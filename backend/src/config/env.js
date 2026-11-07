import dotenv from 'dotenv'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const backendDir = resolve(currentDir, '../..')
const rootDir = resolve(backendDir, '..')

const nodeEnv = process.env.NODE_ENV ?? 'development'

const candidatePaths = [
  process.env.ENV_FILE ? resolve(process.cwd(), process.env.ENV_FILE) : null,
  resolve(backendDir, '.env'),
  resolve(process.cwd(), '.env'),
  resolve(rootDir, '.env'),
].filter(Boolean)

let loadedEnvPath = null
for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath) && fs.statSync(envPath).isFile()) {
    dotenv.config({ path: envPath })
    loadedEnvPath = envPath
    break
  }
}

if (!process.env.MONGODB_URI && loadedEnvPath == null) {
  dotenv.config()
}

const port = Number(process.env.PORT ?? 4000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const mongoUri = process.env.MONGODB_URI
if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
  throw new Error(
    `MONGODB_URI must be a valid MongoDB connection URI. Checked files: ${candidatePaths.join(', ')}`,
  )
}

const mongoDatabaseName = process.env.MONGODB_DB_NAME ?? 'main'
if (!mongoDatabaseName || mongoDatabaseName.length > 63) {
  throw new Error('MONGODB_DB_NAME must name the database to use.')
}

const configuredCorsOrigins = (process.env.CORS_ORIGIN ??
  (nodeEnv === 'production'
    ? ''
    : 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000,http://127.0.0.1:4000'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const devFrontendOrigins =
  nodeEnv === 'production'
    ? []
    : (process.env.DEV_FRONTEND_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
const corsOrigins = [...new Set([...configuredCorsOrigins, ...devFrontendOrigins])]
const frontendOrigin = devFrontendOrigins[0] ?? configuredCorsOrigins[0] ?? ''

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

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim() ?? ''
let googleCallbackUrlValid = false
if (googleCallbackUrl) {
  try {
    const callback = new URL(googleCallbackUrl)
    googleCallbackUrlValid =
      ['http:', 'https:'].includes(callback.protocol) &&
      callback.pathname === '/api/admin/auth/google/callback' &&
      !callback.username &&
      !callback.password
  } catch {
    googleCallbackUrlValid = false
  }
}

const smtpHost = process.env.SMTP_HOST?.trim() ?? ''
const smtpPort = Number(process.env.SMTP_PORT ?? 587)
const smtpUser = process.env.SMTP_USER?.trim() ?? ''
const smtpPassword = process.env.SMTP_PASSWORD?.trim() ?? ''
const smtpFromEmail =
  process.env.SMTP_FROM_EMAIL?.trim() ??
  (smtpUser ? `"Vibe Together" <${smtpUser}>` : 'Vibe Together <no-reply@vibetogether.com>')

export const config = Object.freeze({
  adminAuthConfigured,
  adminPasswordHash,
  adminSessionSecret,
  adminUsername,
  corsOrigins,
  frontendOrigin,
  googleClientId,
  googleClientSecret,
  googleCallbackUrl,
  googleCallbackUrlValid,
  mongoDatabaseName,
  mongoUri,
  nodeEnv,
  port,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPassword,
  smtpFromEmail,
})
