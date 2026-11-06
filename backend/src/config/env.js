import dotenv from 'dotenv'
import { resolve } from 'node:path'

const nodeEnv = process.env.NODE_ENV ?? 'development'
const defaultEnvFile = nodeEnv === 'production' ? '.env.production' : '.env'
dotenv.config({ path: resolve(process.cwd(), process.env.ENV_FILE ?? defaultEnvFile) })

const port = Number(process.env.PORT ?? 4000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const mongoUri = process.env.MONGODB_URI
if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
  throw new Error('MONGODB_URI must be a MongoDB connection URI.')
}

const mongoDatabaseName = process.env.MONGODB_DB_NAME
if (!mongoDatabaseName || mongoDatabaseName.length > 63) {
  throw new Error('MONGODB_DB_NAME must name the database to use.')
}

const corsOrigins = (process.env.CORS_ORIGIN ??
  (nodeEnv === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (nodeEnv === 'production' && corsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must list trusted frontend origins in production.')
}
if (
  nodeEnv === 'production' &&
  corsOrigins.some((origin) => origin.includes('your-production-domain.example'))
) {
  throw new Error('Replace the placeholder in CORS_ORIGIN before production startup.')
}

const adminUsername =
  (process.env.ADMIN_EMAIL ?? process.env.ADMIN_USERNAME)?.trim().toLowerCase() ?? ''
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? ''
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET ?? ''
if (adminUsername && !/^[a-z0-9._@-]{3,120}$/.test(adminUsername)) {
  throw new Error('ADMIN_EMAIL must be a valid 3-120 character email or username.')
}
if (process.env.ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminUsername)) {
  throw new Error('ADMIN_EMAIL must be a valid email address.')
}
if (
  adminPasswordHash &&
  !(
    /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(adminPasswordHash) ||
    /^scrypt\$[A-Za-z0-9_-]{16,128}\$[A-Za-z0-9_-]{32,128}$/.test(adminPasswordHash)
  )
) {
  throw new Error('ADMIN_PASSWORD_HASH must be a bcrypt or legacy scrypt hash.')
}
if (adminSessionSecret && adminSessionSecret.length < 32) {
  throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters.')
}
const adminAuthConfigured = Boolean(
  adminUsername && adminSessionSecret,
)

export const config = Object.freeze({
  adminAuthConfigured,
  adminPasswordHash,
  adminSessionSecret,
  adminUsername,
  corsOrigins,
  mongoDatabaseName,
  mongoUri,
  nodeEnv,
  port,
})
