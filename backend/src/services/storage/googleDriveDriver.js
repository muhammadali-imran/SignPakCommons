import fs from 'node:fs'
import { createReadStream } from 'node:fs'
import { google } from 'googleapis'
import { randomUUID } from 'node:crypto'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const escapeQueryValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function createGoogleDriveDriver({ serviceAccountJson, rootFolderId }) {
  const credentials = JSON.parse(serviceAccountJson)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] })
  const drive = google.drive({ version: 'v3', auth })
  const folderIds = new Map()

  async function accessToken() {
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    return token.token
  }

  async function folderIdFor(folderPath) {
    let parentId = rootFolderId
    let cacheKey = ''
    for (const name of folderPath.split('/').filter(Boolean)) {
      cacheKey = `${cacheKey}/${name}`
      if (folderIds.has(cacheKey)) {
        parentId = folderIds.get(cacheKey)
        continue
      }
      const listed = await drive.files.list({
        q: `'${escapeQueryValue(parentId)}' in parents and name = '${escapeQueryValue(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1,
        spaces: 'drive',
        supportsAllDrives: true,
      })
      let id = listed.data.files?.[0]?.id
      if (!id) {
        const created = await drive.files.create({
          requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
          fields: 'id',
          supportsAllDrives: true,
        })
        id = created.data.id
      }
      folderIds.set(cacheKey, id)
      parentId = id
    }
    return parentId
  }

  async function uploadWithResumableSession({ tempPath, parentId, fileName, mimeType, ext }) {
    const fileSize = (await fs.promises.stat(tempPath)).size
    const suffix = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : ''
    const metadata = { name: fileName || `${randomUUID()}${suffix}`, parents: [parentId], mimeType }
    const token = await accessToken()
    const session = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    })

    if (!session.ok) {
      const text = await session.text()
      throw new Error(`Google Drive upload session creation failed (${session.status}): ${text}`)
    }

    const uploadUrl = session.headers.get('Location')
    if (!uploadUrl) throw new Error('Google Drive upload session is missing the upload URL.')

    const finalResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
      },
      body: createReadStream(tempPath),
    })

    if (!finalResponse.ok) {
      const text = await finalResponse.text()
      throw new Error(`Google Drive single-request upload failed (${finalResponse.status}): ${text}`)
    }

    const json = await finalResponse.json().catch(() => ({}))
    const key = json.id || json.fileId
    if (!key) throw new Error('Google Drive upload succeeded but no file id was returned.')
    return { key }
  }

  return {
    name: 'gdrive',
    tempDir: null,

    async init() {
      await drive.files.get({ fileId: rootFolderId, fields: 'id, trashed', supportsAllDrives: true })
    },

    async save({ tempPath, ext = '', folder, fileName, mimeType }) {
      const parentId = await folderIdFor(folder)
      return uploadWithResumableSession({ tempPath, parentId, fileName, mimeType, ext })
    },

    async stat(key) {
      const response = await drive.files.get({ fileId: key, fields: 'size', supportsAllDrives: true })
      return { size: Number(response.data.size || 0) }
    },

    async createReadStream(key, range) {
      const headers = range ? { Range: `bytes=${range.start}-${range.end}` } : undefined
      const response = await drive.files.get({ fileId: key, alt: 'media', supportsAllDrives: true }, { responseType: 'stream', headers })
      return response.data
    },

    async remove(key) {
      try {
        await drive.files.delete({ fileId: key, supportsAllDrives: true })
      } catch (error) {
        if (error.code !== 404) throw error
      }
    },
  }
}
