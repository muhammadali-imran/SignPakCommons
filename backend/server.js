import app from './src/app.js'
import { connectDb } from './src/config/db.js'
import { env } from './src/config/env.js'
import { authService } from './src/services/authService.js'
import { storageService } from './src/services/storage/index.js'
import { logger } from './src/utils/logger.js'

// Cache the initialization promise across serverless warm starts
let initPromise = null
const initServices = () => {
  if (!initPromise) {
    initPromise = (async () => {
      await connectDb()
      await storageService.init()
      await authService.ensureAdminFromEnv()
    })()
  }
  return initPromise
}

// Ensure DB and services are connected before handling any incoming request
app.use(async (req, res, next) => {
  try {
    await initServices()
    next()
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to initialize services')
    res.status(500).json({ error: 'Database or service initialization failed' })
  }
})

// Run app.listen only when running locally (not on Vercel serverless)
if (!process.env.VERCEL) {
  initServices()
    .then(() => {
      app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`))
    })
    .catch((error) => {
      logger.fatal({ err: error }, 'Failed to start local server')
      process.exit(1)
    })
}

// CRITICAL FOR VERCEL: Export the Express app instance
export default app
