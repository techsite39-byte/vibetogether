import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { createBookingEnquiriesRouter } from './routes/bookingEnquiries.js'
import { createEventsRouter } from './routes/events.js'
import { createAdminAuthRouter } from './auth/adminAuth.js'
import { createAdminRouter } from './routes/admin.js'
import { createBookingsRouter } from './routes/bookings.js'
import { createPublicEnquiriesRouter } from './routes/publicEnquiries.js'
import healthRouter from './routes/health.js'

export function createApp({
  adminPasswordHash = '',
  adminSessionSecret = '',
  adminUsername = '',
  adminModel,
  bookingModel,
  bookingEventModel,
  bookingEnquiryRepository,
  corsOrigins,
  enquiryModel,
  events,
  eventRepository,
  subscriberModel,
  secureCookies = false,
}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true)
          return
        }

        callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }))
      },
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/health', healthRouter)
  app.use('/api/admin/auth', createAdminAuthRouter({
    bootstrapPasswordHash: adminPasswordHash,
    model: adminModel,
    sessionSecret: adminSessionSecret,
    secureCookies,
    username: adminUsername,
  }))
  app.use('/api/admin', createAdminRouter({
    adminModel,
    sessionSecret: adminSessionSecret,
  }))
  app.use('/api', createPublicEnquiriesRouter({ enquiryModel, subscriberModel }))
  app.use('/api/bookings', createBookingsRouter({
    bookingModel,
    eventModel: bookingEventModel,
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
      }),
    )
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.' })
  })

  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status)
      ? error.status
      : error.name === 'ValidationError'
        ? 400
        : error.code === 11000
          ? 409
          : 500
    if (status >= 500) {
      console.error('API request failed.')
    }

    response.status(status).json({
      message:
        status >= 500
          ? 'Internal server error.'
          : error.type === 'entity.parse.failed'
            ? 'Malformed JSON request.'
            : error.message,
    })
  })

  return app
}
