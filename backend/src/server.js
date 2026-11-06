import { createApp } from './app.js'
import { config } from './config/env.js'
import { connectDatabase } from './db/connect.js'
import { saveBookingEnquiry } from './services/bookingEnquiries.js'
import {
  ensureEventCatalog,
  findEventById,
  listEvents,
} from './services/events.js'
import mongoose from 'mongoose'
import { initializeAdminRecords } from './services/adminSetup.js'

const app = createApp({
  adminPasswordHash: config.adminPasswordHash,
  adminSessionSecret: config.adminSessionSecret,
  adminUsername: config.adminUsername,
  bookingEnquiryRepository: { save: saveBookingEnquiry },
  corsOrigins: config.corsOrigins,
  eventRepository: {
    findById: findEventById,
    list: listEvents,
  },
  secureCookies: config.nodeEnv === 'production',
})

try {
  await connectDatabase(config.mongoUri, config.mongoDatabaseName)
  await ensureEventCatalog()
  await initializeAdminRecords({
    bootstrapPasswordHash: config.adminPasswordHash,
    username: config.adminUsername,
  })
} catch {
  console.error('Backend database initialization failed.')
  process.exitCode = 1
  await mongoose.disconnect()
  process.exit()
}

const server = app.listen(config.port, () => {
  console.info(`Backend listening on port ${config.port}.`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await mongoose.disconnect()
      process.exitCode = 0
    })
  })
}
