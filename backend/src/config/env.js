import fs from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'

const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
const explicitEnv = { ...process.env }
const dotEnvPath = path.resolve(process.cwd(), '.env')
const dotEnv = fs.existsSync(dotEnvPath) ? config({ path: dotEnvPath, override: false }).parsed ?? {} : {}
const mergedEnv = { ...dotEnv, ...explicitEnv }
const isTest = (explicitEnv.NODE_ENV ?? dotEnv.NODE_ENV ?? 'development') === 'test'
const testSafeEnv = isTest ? {
  ...mergedEnv,
  COOKIE_SECURE: explicitEnv.COOKIE_SECURE ?? 'false',
  COOKIE_SAMESITE: explicitEnv.COOKIE_SAMESITE ?? 'lax',
  STORAGE_DRIVER: explicitEnv.STORAGE_DRIVER ?? 'local',
  ARCHIVE_STORAGE_DRIVER: explicitEnv.ARCHIVE_STORAGE_DRIVER ?? 'local',
  RATE_LIMIT_ENABLED: explicitEnv.RATE_LIMIT_ENABLED ?? 'false',
} : mergedEnv

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool.default(false),

  MONGODB_URI: z.string({ error: 'MONGODB_URI is required (for example mongodb://127.0.0.1:27017/signpakcommons)' }).min(1, 'MONGODB_URI is required'),

  // Comma-separated list of browser origins allowed to call the API with cookies.
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_SECRET: z.string({ error: 'JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"' }).min(32, 'JWT_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'),
  JWT_EXPIRES_DAYS: z.coerce.number().positive().default(7),
  COOKIE_SECURE: bool.optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.email().optional(),
  BREVO_SENDER_NAME: z.string().min(1).default('SignPak Commons'),
  AUTH_OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  AUTH_OTP_RESEND_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WEB3FORMS_ACCESS_KEY: z.string().optional(),
  CONTACT_DAILY_LIMIT: z.coerce.number().int().min(1).default(25),
  CONTACT_USER_DAILY_LIMIT: z.coerce.number().int().min(1).default(1),
  CONTACT_ABUSE_BLOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),

  ADMIN_EMAIL: z.email({ error: 'ADMIN_EMAIL is required and must be a valid email' }),
  ADMIN_PASSWORD: z.string({ error: 'ADMIN_PASSWORD is required (at least 8 characters)' }).min(8, 'ADMIN_PASSWORD must be at least 8 characters').max(72),
  ADMIN_FIRST_NAME: z.string().min(1).default('Admin'),
  ADMIN_SURNAME: z.string().min(1).default('Signpak'),

  STORAGE_DRIVER: z.enum(['local', 'gdrive']).default('local'),
  ARCHIVE_STORAGE_DRIVER: z.enum(['local', 'gdrive']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  MAX_VIDEO_UPLOAD_MB: z.coerce.number().positive().default(300),
  MAX_RECORDING_UPLOAD_MB: z.coerce.number().positive().default(100),

  RATE_LIMIT_ENABLED: bool.default(true),

  // A contributor can submit a video more than once, but not back to back: this is the
  // minimum gap enforced between two submissions for the same (user, video). Overridable
  // (like BCRYPT_ROUNDS) so tests do not have to wait 30 real seconds.
  SUBMISSION_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
}).superRefine((data, context) => {
  if (data.NODE_ENV === 'production' && !data.BREVO_API_KEY) {
    context.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'Required in production for email verification and password reset.' })
  }
  if (data.NODE_ENV === 'production' && !data.BREVO_SENDER_EMAIL) {
    context.addIssue({ code: 'custom', path: ['BREVO_SENDER_EMAIL'], message: 'Required in production; use a verified Brevo sender address.' })
  }
  if (data.NODE_ENV === 'production' && !data.WEB3FORMS_ACCESS_KEY) {
    context.addIssue({ code: 'custom', path: ['WEB3FORMS_ACCESS_KEY'], message: 'Required in production to deliver contact messages.' })
  }
  const needsGoogle = data.STORAGE_DRIVER === 'gdrive' || data.ARCHIVE_STORAGE_DRIVER === 'gdrive'
  if (needsGoogle && !data.GOOGLE_SERVICE_ACCOUNT_JSON) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_SERVICE_ACCOUNT_JSON'], message: 'Required when STORAGE_DRIVER=gdrive.' })
  }
  if (needsGoogle && !data.GOOGLE_DRIVE_FOLDER_ID) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_DRIVE_FOLDER_ID'], message: 'Required when STORAGE_DRIVER=gdrive.' })
  }
})

const parsed = schema.safeParse(testSafeEnv)
if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n\nCopy .env.example to .env and fill in the values.\n`)
  process.exit(1)
}

const data = parsed.data
export const env = Object.freeze({
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  // Secure cookies by default in production; override for local HTTPS-less setups.
  COOKIE_SECURE: data.COOKIE_SECURE ?? data.NODE_ENV === 'production',
  clientOrigins: data.CLIENT_ORIGIN.split(',').map((item) => item.trim().replace(/\/$/, '')).filter(Boolean),
})
