import { createApp } from './app.js'
import { config } from './config/env.js'
import { connectDatabase } from './db/connect.js'
import { createEmailService } from './services/emailService.js'
import {
  findBookingEnquiry,
  findBookingEnquiryByReference,
  markBookingEnquiryDemoPaid,
  markBookingEnquiryDemoFailed,
  submitBookingEnquiryUpiPayment,
  optOutBookingWhatsApp,
  saveBookingEnquiry,
  verifyBookingEnquiryUpiPayment,
} from './services/bookingEnquiries.js'
import {
  ensureEventCatalog,
  findEventById,
  listEvents,
} from './services/events.js'
import mongoose from 'mongoose'
import Razorpay from 'razorpay'
import { initializeAdminRecords } from './services/adminSetup.js'
import { createRazorpayPaymentService } from './services/razorpayPayments.js'
import { createDiwaliOfferService } from './services/diwaliOffer.js'
import { createWhatsAppNotificationService } from './services/whatsappNotifications.js'
import { DiwaliOffer } from './models/diwaliOffer.js'
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

const diwaliOfferService = createDiwaliOfferService()
const razorpayPayments = createRazorpayPaymentService({
  client: config.razorpayConfigured
    ? new Razorpay({
        key_id: config.razorpayKeyId,
        key_secret: config.razorpayKeySecret,
      })
    : null,
  keyId: config.razorpayKeyId,
  keySecret: config.razorpayKeySecret,
  diwaliOfferService,
})
const whatsappNotifications = createWhatsAppNotificationService({
  phoneNumberId: config.whatsappPhoneNumberId,
  accessToken: config.whatsappAccessToken,
  apiVersion: config.whatsappApiVersion,
  successTemplateName: config.whatsappSuccessTemplateName,
  failureTemplateName: config.whatsappFailureTemplateName,
  webhookVerifyToken: config.whatsappWebhookVerifyToken,
  appSecret: config.whatsappAppSecret,
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
    optOutWhatsApp: optOutBookingWhatsApp,
    markDemoPaid: markBookingEnquiryDemoPaid,
    markDemoFailed: markBookingEnquiryDemoFailed,
    submitUpiPayment: submitBookingEnquiryUpiPayment,
    verifyUpiPayment: verifyBookingEnquiryUpiPayment,
  },
  razorpayPayments,
  razorpayConfigured: config.razorpayConfigured,
  razorpayKeyId: config.razorpayKeyId,
  razorpayWebhookSecret: config.razorpayWebhookSecret,
  paymentProvider: config.paymentProvider,
  upiId: config.upiId,
  upiPayeeName: config.upiPayeeName,
  whatsappNotifications,
  whatsappWebhookConfig: {
    verifyToken: config.whatsappWebhookVerifyToken,
    appSecret: config.whatsappAppSecret,
  },
  diwaliOfferService,
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
  await DiwaliOffer.init()
  await diwaliOfferService.getOffer()
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
  void whatsappNotifications.processRetries().catch((error) => {
    console.error('WhatsApp notification startup retry job failed.', {
      name: error?.name ?? 'UnknownError',
      code: error?.code ?? '',
    })
  })
  const notificationRetryTimer = setInterval(() => {
    void whatsappNotifications.processRetries().catch((error) => {
      console.error('WhatsApp notification retry job failed.', {
        name: error?.name ?? 'UnknownError',
        code: error?.code ?? '',
      })
    })
  }, 60_000)
  notificationRetryTimer.unref()

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      clearInterval(notificationRetryTimer)
      server.close(async () => {
        await mongoose.disconnect()
        process.exitCode = 0
      })
    })
  }
}
