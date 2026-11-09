import mongoose from 'mongoose'
import { config } from '../src/config/env.js'
import { connectDatabase } from '../src/db/connect.js'
import {
  Booking,
  BookingReferenceCounter,
} from '../src/models/adminRecords.js'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'

function numericReference(reference) {
  if (typeof reference !== 'string' || !/^\d+$/.test(reference)) {
    return null
  }
  const value = Number(reference)
  return Number.isSafeInteger(value) ? value : null
}

let connected = false
try {
  await connectDatabase(config.mongoUri, config.mongoDatabaseName)
  connected = true

  const backfillExpiry = process.argv.includes('--backfill-temporary-expiry')
  let temporarySessionsExpiryBackfilled = 0
  if (backfillExpiry) {
    const sessions = await BookingEnquiry.find({
      reference: { $in: ['', null] },
      paymentStatus: { $in: ['unpaid', 'failed', 'processing'] },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }],
    }).select('requestId createdAt').lean()

    for (const session of sessions) {
      const createdAt = new Date(session.createdAt)
      if (Number.isNaN(createdAt.getTime())) {
        continue
      }
      const result = await BookingEnquiry.updateOne(
        {
          requestId: session.requestId,
          reference: { $in: ['', null] },
          paymentStatus: { $in: ['unpaid', 'failed', 'processing'] },
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }],
        },
        { $set: { expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) } },
      )
      temporarySessionsExpiryBackfilled += result.modifiedCount
    }
  }

  const permanentReference = { $exists: true, $ne: '' }
  const [
    referencedUnpaidEnquiries,
    demoPaidEnquiries,
    actualPaidEnquiries,
    failedPaymentEnquiries,
    temporarySessions,
    failedLegacyWhatsAppNotifications,
    bookingReferences,
    enquiryReferences,
    counter,
  ] = await Promise.all([
    BookingEnquiry.countDocuments({ reference: permanentReference, paymentStatus: 'unpaid' }),
    BookingEnquiry.countDocuments({ paymentStatus: 'demo_paid' }),
    BookingEnquiry.countDocuments({ paymentStatus: { $in: ['paid', 'verified'] } }),
    BookingEnquiry.countDocuments({ paymentStatus: 'failed' }),
    BookingEnquiry.find({
      reference: { $in: ['', null] },
      paymentStatus: { $in: ['unpaid', 'failed', 'processing'] },
    }).select('requestId paymentStatus createdAt expiresAt').lean(),
    BookingEnquiry.countDocuments({ 'whatsappNotification.status': 'failed' }),
    Booking.find({ reference: /^\d+$/ }, 'reference').lean(),
    BookingEnquiry.find({ reference: /^\d+$/ }, 'reference').lean(),
    BookingReferenceCounter.findById('booking-reference-counter').lean(),
  ])
  const maxAssignedReference = [...bookingReferences, ...enquiryReferences]
    .map(({ reference }) => numericReference(reference))
    .filter((reference) => reference !== null)
    .reduce((maximum, reference) => Math.max(maximum, reference), 0)
  const temporarySessionsMissingExpiry = temporarySessions.filter(
    ({ expiresAt }) => !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime()),
  ).length

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: !backfillExpiry,
    temporarySessionsExpiryBackfilled,
    referencedUnpaidEnquiries,
    demoPaidEnquiries,
    actualPaidEnquiries,
    failedPaymentEnquiries,
    temporaryUnpaidEnquiries: temporarySessions.length,
    temporarySessionsMissingExpiry,
    legacySessionsMissingExpiry: temporarySessions
      .filter(({ expiresAt }) => !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime()))
      .map(({ requestId, paymentStatus, createdAt }) => ({
        requestId,
        paymentStatus,
        createdAt,
      })),
    failedLegacyWhatsAppNotifications,
    maxAssignedReference: maxAssignedReference || null,
    counterValue: counter?.value ?? null,
  }, null, 2)}\n`)
} catch (error) {
  console.error(`Booking reconciliation could not complete: ${error.message}`)
  process.exitCode = 1
} finally {
  if (connected) {
    await mongoose.disconnect()
  }
}