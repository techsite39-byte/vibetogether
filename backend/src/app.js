import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { createBookingEnquiriesRouter } from './routes/bookingEnquiries.js'
import { createEventsRouter } from './routes/events.js'
import { createAdminAuthRouter } from './auth/adminAuth.js'
import { createAdminRouter } from './routes/admin.js'
import { createBookingsRouter } from './routes/bookings.js'
import { createPublicEnquiriesRouter } from './routes/publicEnquiries.js'
import { createPublicSettingsRouter } from './routes/publicSettings.js'
import { createWhatsAppWebhookRouter } from './routes/whatsappWebhook.js'
import { createRazorpayWebhookRouter } from './routes/razorpayWebhook.js'
import healthRouter from './routes/health.js'
import { PlatformSetting } from './models/adminRecords.js'
import { DiwaliOffer } from './models/diwaliOffer.js'

export function createApp({
  adminPasswordHash = '',
  adminSessionSecret = '',
  adminUsername = '',
  adminModel,
  adminSessionModel,
  passwordResetModel,
  emailService,
  googleClientId = '',
  googleClientSecret = '',
  googleCallbackUrl = '',
  googleCallbackUrlValid = false,
  googleOAuthTransactionStore,
  bookingModel,
  bookingEventModel,
  bookingReferenceCounterModel,
  bookingEnquiryRepository,
  razorpayPayments,
  razorpayConfigured = false,
  razorpayKeyId = '',
  razorpayWebhookSecret = '',
  paymentProvider = 'razorpay',
  upiId = 'vinothinimoorthi37-1@okhdfcbank',
  upiPayeeName = 'Vinothini Moorthi',
  whatsappNotifications,
  whatsappWebhookConfig = {},
  diwaliOfferService,
  corsOrigins,
  databaseReady,
  enquiryModel,
  events,
  eventRepository,
  platformSettingModel = PlatformSetting,
  frontendOrigin,
  backendPort = 4000,
  nodeEnv = 'production',
  subscriberModel,
  secureCookies = false,
}) {
  const app = express()

  app.set('trust proxy', nodeEnv === 'production' ? 1 : false)
  app.disable('x-powered-by')
  app.use(helmet())
  app.get('/', (request, response) => {
    response.json({
      status: 'ok',
      message: 'Backend is running',
      port: request.socket.localPort,
    })
  })
  app.use(
    cors({
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'X-CSRF-Token',
        'Authorization',
        'Accept',
        'Origin',
        'X-Requested-With',
      ],
      exposedHeaders: ['Set-Cookie', 'X-CSRF-Token', 'Retry-After'],
      origin(origin, callback) {
        if (!origin) {
          callback(null, true)
          return
        }

        const isLocalNetworkOrigin =
          /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)(?::\d+)?$/i.test(
            origin,
          )
        const isVibeTogetherDomain =
          /^https:\/\/(?:[a-z0-9-]+\.)?vibetogether\.show(?::\d+)?$/i.test(origin)
        const isRenderFrontend =
          /^https:\/\/vibetogether[a-z0-9-]*\.onrender\.com(?::\d+)?$/i.test(origin)
        const isVercelFrontend =
          /^https:\/\/vibe-together[a-z0-9-]*\.vercel\.app(?::\d+)?$/i.test(origin)

        if (
          corsOrigins.includes(origin) ||
          isVibeTogetherDomain ||
          isRenderFrontend ||
          isVercelFrontend ||
          (nodeEnv !== 'production' && isLocalNetworkOrigin)
        ) {
          callback(null, true)
          return
        }

        callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }))
      },
    }),
  )
  app.use(express.json({
    limit: '1mb',
    verify(request, _response, buffer) {
      if (request.originalUrl.startsWith('/api/whatsapp/webhook')) {
        request.rawBody = Buffer.from(buffer)
      }
      if (request.originalUrl.startsWith('/api/razorpay/webhook')) {
        request.rawBody = Buffer.from(buffer)
      }
    },
  }))
  app.use('/api/health', healthRouter)
  app.use('/api/admin/auth', createAdminAuthRouter({
    bootstrapPasswordHash: adminPasswordHash,
    emailService,
    googleClientId,
    googleClientSecret,
    googleCallbackUrl,
    googleCallbackUrlValid,
    googleOAuthTransactionStore,
    backendPort,
    frontendOrigin,
    corsOrigins,
    nodeEnv,
    model: adminModel,
    passwordResetModel,
    sessionModel: adminSessionModel,
    sessionSecret: adminSessionSecret,
    databaseReady,
    secureCookies,
    username: adminUsername,
  }))
  app.use('/api/admin', createAdminRouter({
    adminModel,
    sessionModel: adminSessionModel,
    sessionSecret: adminSessionSecret,
    bookingEnquiryRepository,
    diwaliOfferService,
    diwaliOfferModel: DiwaliOffer,
    whatsappNotifications,
    integrationDiagnostics: {
      razorpayCheckoutConfigured: razorpayConfigured,
      razorpayMode: razorpayKeyId.startsWith('rzp_test_') ? 'test' : razorpayKeyId ? 'live' : 'not_configured',
      razorpayWebhookConfigured: Boolean(razorpayWebhookSecret),
    },
  }))
  app.use('/api', createPublicEnquiriesRouter({ enquiryModel, subscriberModel }))
  app.use('/api/public-settings', createPublicSettingsRouter({
    platformSettingModel,
    diwaliOfferService,
  }))
  app.use('/api/whatsapp/webhook', createWhatsAppWebhookRouter({
    notifications: whatsappNotifications,
    ...whatsappWebhookConfig,
  }))
  app.use('/api/razorpay/webhook', createRazorpayWebhookRouter({
    payments: razorpayPayments,
    notifications: whatsappNotifications,
    secret: razorpayWebhookSecret,
  }))
  app.use('/api/bookings', createBookingsRouter({
    bookingModel,
    eventModel: bookingEventModel,
    bookingReferenceCounterModel,
  }))
  app.use(
    '/api/events',
    createEventsRouter({ eventRepository, initialEvents: events }),
  )
  if (bookingEnquiryRepository) {
    app.use(
      '/api/booking-enquiries',
      createBookingEnquiriesRouter({
        events,
        eventRepository,
        repository: bookingEnquiryRepository,
        razorpayPayments,
        razorpayConfigured,
        paymentProvider,
        upiId,
        upiPayeeName,
        diwaliOfferService,
        whatsappNotifications,
      }),
    )
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' })
  })

  app.use((error, _request, response, _next) => {
    const databaseUnavailable =
      error.name === 'MongooseServerSelectionError' ||
      error.name === 'MongoNetworkError' ||
      (error.name === 'MongooseError' && /buffering timed out|bufferCommands/i.test(error.message))
    const hasExplicitStatus = Number.isInteger(error.status)
    const status = Number.isInteger(error.status)
      ? error.status
      : error.name === 'ValidationError'
        ? 400
        : error.code === 11000
          ? 409
          : databaseUnavailable
            ? 503
          : 500
    if (status >= 500) {
      console.error('API request failed:', error.message)
    }

    response.status(status).json({
      message:
        databaseUnavailable
          ? 'The database is unavailable. Please try again when the service is ready.'
          : status >= 500 && !hasExplicitStatus
            ? 'Internal server error.'
          : error.type === 'entity.parse.failed'
            ? 'Malformed JSON request.'
            : error.message,
    })
  })

  return app
}
