import { createApp } from './app.js'
import { config } from './config/env.js'
import { connectDatabase } from './db/connect.js'
import { createEmailService } from './services/emailService.js'
import { saveBookingEnquiry } from './services/bookingEnquiries.js'
import {
  ensureEventCatalog,
  findEventById,
  listEvents,
} from './services/events.js'
import mongoose from 'mongoose'
import { initializeAdminRecords } from './services/adminSetup.js'
import { AdminCredential, AdminSession, PasswordReset } from './models/adminRecords.js'

const emailService = createEmailService({
  host: config.smtpHost,
  port: config.smtpPort,
  user: config.smtpUser,
  password: config.smtpPassword,
  from: config.smtpFromEmail,
})

const app = createApp({
  adminPasswordHash: config.adminPasswordHash,
  adminSessionSecret: config.adminSessionSecret,
  adminUsername: config.adminUsername,
  adminModel: AdminCredential,
  adminSessionModel: AdminSession,
  passwordResetModel: PasswordReset,
  emailService,
  googleClientId: config.googleClientId,
  googleClientSecret: config.googleClientSecret,
  googleCallbackUrl: config.googleCallbackUrl,
  googleCallbackUrlValid: config.googleCallbackUrlValid,
  bookingEnquiryRepository: { save: saveBookingEnquiry },
  corsOrigins: config.corsOrigins,
  databaseReady: () => mongoose.connection.readyState === 1,
  frontendOrigin: config.frontendOrigin,
  backendPort: config.port,
  nodeEnv: config.nodeEnv,
  eventRepository: {
    findById: findEventById,
    list: listEvents,
  },
  secureCookies: config.nodeEnv === 'production',
})

const host = process.env.HOST ?? '0.0.0.0'
const server = app.listen(config.port, host, () => {
  console.info(`Backend listening on http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${config.port}`)
})

try {
  await connectDatabase(config.mongoUri, config.mongoDatabaseName)
  await ensureEventCatalog()
  await initializeAdminRecords({
    bootstrapPasswordHash: config.adminPasswordHash,
    username: config.adminUsername,
  })
  console.info('Database connected and initialized successfully.')
} catch (error) {
  console.error('Backend database initialization failed; database-backed APIs are unavailable:', error?.message || error)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await mongoose.disconnect()
      process.exitCode = 0
    })
  })
}
