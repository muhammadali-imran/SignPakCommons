import app from './src/app.js'
import { connectDb } from './src/config/db.js'
import { authService } from './src/services/authService.js'

let initialization

async function initialize() {
  if (!initialization) {
    initialization = (async () => {
      await connectDb()
      await authService.ensureAdminFromEnv()
    })().catch((error) => {
      initialization = undefined
      throw error
    })
  }
  return initialization
}

export default async function handler(req, res) {
  await initialize()
  return app(req, res)
}
