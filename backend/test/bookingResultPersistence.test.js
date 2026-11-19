import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BookingResult } from '../src/models/bookingResult.js'
import { persistBookingResult } from '../src/services/bookingResults.js'
import { createMockBookingResultModel } from './bookingResultMocks.js'

test('targets the existing bookings-db collection with a unique request identifier', () => {
  assert.equal(BookingResult.collection.collectionName, 'bookings-db')
  assert.ok(
    BookingResult.schema.indexes().some(([keys, options]) =>
      keys.requestId === 1 && options.unique === true,
    ),
  )
})

test('upserts terminal results once and never downgrades a confirmed success', async () => {
  const bookingResultModel = createMockBookingResultModel({
    requestId: 'request-stable-1',
    paymentStatus: 'unpaid',
    expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })
  const booking = {
    requestId: 'request-stable-1',
    reference: 'VT-REF-001',
    name: 'Test Attendee',
    mobile: '+919876543210',
    email: 'test@example.com',
    eventId: 'event-1',
    event: 'Live Music',
    ticketType: 'general-admission',
    ticketTypeName: 'General Admission',
    ticketQuantity: 2,
    paymentAmount: 498,
    status: 'confirmed',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }

  await persistBookingResult(booking, {
    paymentStatus: 'SUCCESS',
    paymentProvider: 'cashfree',
    providerPaymentId: 'cf-payment-1',
    providerOrderId: 'cf-order-1',
  }, { bookingResultModel })
  await persistBookingResult(booking, {
    paymentStatus: 'FAILED',
    paymentProvider: 'cashfree',
    providerPaymentId: 'cf-payment-1',
    providerOrderId: 'cf-order-1',
    failureReason: 'declined',
  }, { bookingResultModel })

  assert.equal(bookingResultModel.record.paymentStatus, 'SUCCESS')
  assert.equal(bookingResultModel.record.requestId, 'request-stable-1')
  assert.equal(bookingResultModel.record.bookingReference, 'VT-REF-001')
  assert.equal(bookingResultModel.record.eventName, 'Live Music')
  assert.equal(bookingResultModel.record.amount, 498)
  assert.equal(bookingResultModel.record.createdAt.toISOString(), '2026-01-01T00:00:00.000Z')
  assert.equal('expiresAt' in bookingResultModel.record, false)
})

test('preserves enquiry payment status values when result data shares its document', async () => {
  for (const [paymentStatus, resultStatus] of [['paid', 'SUCCESS'], ['failed', 'FAILED']]) {
    const bookingResultModel = createMockBookingResultModel({
      requestId: `request-${paymentStatus}`,
      paymentStatus: 'unpaid',
      expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    })
    const booking = {
      requestId: `request-${paymentStatus}`,
      name: 'Test Attendee',
      mobile: '+919876543210',
      paymentAmount: 249,
      paymentStatus,
    }

    await persistBookingResult(booking, {
      paymentStatus: resultStatus,
      paymentProvider: 'cashfree',
      providerPaymentId: 'cf-payment-1',
    }, { bookingResultModel })

    assert.equal(bookingResultModel.record.paymentStatus, paymentStatus)
    assert.equal(
      'expiresAt' in bookingResultModel.record,
      paymentStatus !== 'paid',
    )
  }
})
