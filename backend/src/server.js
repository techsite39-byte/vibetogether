import { createApp } from './app.js'
import { config } from './config/env.js'
import { connectDatabase } from './db/connect.js'
import { createEmailService } from './services/emailService.js'
import {
  findBookingEnquiry,
  findBookingEnquiryByReference,
  claimWhatsAppAttempt,
  completeWhatsAppAttempt,
  findDueWhatsAppRetries,
  getWhatsAppSettings,
  markBookingEnquiryDemoPaid,
  optOutBookingWhatsApp,
  optOutWhatsAppByPhone,
  saveBookingEnquiry,
  updateWhatsAppDeliveryStatus,
} from './services/bookingEnquiries.js'
import { createWhatsAppService } from './services/whatsapp.js'
import {
  ensureEventCatalog,
  findEventById,
  listEvents,
} from './services/events.js'
import mongoose from 'mongoose'
import { initializeAdminRecords } from './services/adminSetup.js'
import { AdminCredential, AdminSession, PasswordReset } from './models/adminRecords.js'
import {
  consumeGoogleOAuthTransaction,
  createGoogleOAuthTransaction,
} from './services/googleOAuthTransactions.js'

const emailService = createEmailService({
  host: config.smtpHost,
  port: config.smtpPort,
  user: config.smtpUser,
  password: config.smtpPassword,
  from: config.smtpFromEmail,
})

const whatsappService = createWhatsAppService({
  phoneNumberId: config.whatsappPhoneNumberId,
  businessAccountId: config.whatsappBusinessAccountId,
  accessToken: config.whatsappAccessToken,
  apiVersion: config.whatsappApiVersion,
  appSecret: config.whatsappAppSecret,
  webhookVerifyToken: config.whatsappWebhookVerifyToken,
  templateName: config.whatsappTemplateName,
  templateLanguage: config.whatsappTemplateLanguage,
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
  googleOAuthTransactionStore: {
    create: createGoogleOAuthTransaction,
    consume: consumeGoogleOAuthTransaction,
  },
  bookingEnquiryRepository: {
    save: saveBookingEnquiry,
    findByRequestId: findBookingEnquiry,
    findByReference: findBookingEnquiryByReference,
    claimWhatsAppAttempt,
    completeWhatsAppAttempt,
    findDueWhatsAppRetries,
    getWhatsAppSettings,
    optOutBookingWhatsApp,
    optOutWhatsAppByPhone,
    updateWhatsAppDeliveryStatus,
    markDemoPaid: markBookingEnquiryDemoPaid,
  },
  whatsappService,
  whatsappTestPhoneNumber: config.whatsappTestPhoneNumber,
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
let databaseInitialized = false
try {
  await connectDatabase(config.mongoUri, config.mongoDatabaseName)
  await ensureEventCatalog()
  await initializeAdminRecords({
    bootstrapPasswordHash: config.adminPasswordHash,
    username: config.adminUsername,
  })
  console.info('Database connected and initialized successfully.')
  databaseInitialized = true
} catch (error) {
  console.error('Backend startup failed during database initialization:', error?.message || error)
  process.exitCode = 1
  await mongoose.disconnect()
}

if (databaseInitialized) {
  const server = app.listen(config.port, host, () => {
    console.info(`Backend listening on ${host}:${config.port}`)
  })

  async function processWhatsAppRetries() {
    try {
      const dueBookings = await findDueWhatsAppRetries()
      for (const { requestId, whatsappNotification } of dueBookings) {
        const retryFailed = whatsappNotification?.status === 'failed'
        const claimed = await claimWhatsAppAttempt(requestId, {
          retryFailed,
          source: 'system',
        })
        if (!claimed) {
          continue
        }
        const settings = await getWhatsAppSettings()
        const result = await whatsappService.sendBookingConfirmation(claimed, settings)
        await completeWhatsAppAttempt(requestId, result)
      }
    } catch {
      console.error('WhatsApp retry worker could not process pending messages.')
    }
  }
  const whatsappRetryWorker = setInterval(() => {
    void processWhatsAppRetries()
  }, 30_000)
  whatsappRetryWorker.unref()
  void processWhatsAppRetries()

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      clearInterval(whatsappRetryWorker)
      server.close(async () => {
        await mongoose.disconnect()
        process.exitCode = 0
      })
    })
  }
}
