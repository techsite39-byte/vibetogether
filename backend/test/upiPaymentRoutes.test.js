import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'

const servers = []
const requestId = '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b'

async function startServer(paymentProvider = 'upi', paymentOrderId = '') {
  const enquiry = {
    requestId,
    name: 'Jordan Example',
    mobile: '+919876543210',
    email: 'jordan@example.com',
    eventId: '',
    event: '',
    categoryId: 'fun-games',
    category: 'Fun Games',
    ticketType: 'general-admission',
    ticketTypeName: 'General Admission',
    ticketQuantity: 2,
    maleCount: 1,
    femaleCount: 1,
    maleMemberNames: ['Jordan Example'],
    femaleMemberNames: ['Mira Example'],
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentProvider: paymentOrderId ? 'razorpay' : '',
    paymentOrderId,
    paymentAmount: 777,
    paymentAmountPaise: 77700,
    expiresAt: new Date(Date.now() + 60_000),
    upiPayments: [],
  }
  const repository = {
    async save() { return { enquiry, duplicate: false } },
    async findByRequestId(id) { return id === requestId ? enquiry : null },
    async markDemoPaid() { return null },
    async markDemoFailed() { return null },
    async submitUpiPayment(id, { utr, upiId, pricing }) {
      if (id !== requestId) return null
      if (enquiry.paymentOrderId || enquiry.paymentProvider === 'razorpay') {
        throw Object.assign(new Error('This UPI payment cannot be submitted in its current state.'), { status: 409 })
      }
      const current = enquiry.upiPayments.at(-1)
      if (current?.utr === utr.trim().toUpperCase()) {
        return { enquiry, duplicate: true }
      }
      if (current?.status === 'Submitted for Verification') {
        throw Object.assign(new Error('This UPI payment cannot be submitted in its current state.'), { status: 409 })
      }
      const payment = {
        bookingId: id,
        customerId: '',
        eventId: enquiry.eventId,
        amount: pricing.finalAmount,
        upiId,
        utr: utr.trim().toUpperCase(),
        paymentMethod: 'UPI',
        status: 'Submitted for Verification',
        submittedAt: new Date(),
      }
      enquiry.upiPayments.push(payment)
      Object.assign(enquiry, {
        paymentAmount: pricing.finalAmount,
        paymentAmountPaise: pricing.paymentAmountPaise,
        paymentStatus: 'processing',
        paymentProvider: 'upi',
      })
      return { enquiry, duplicate: false }
    },
  }

  const server = createApp({
    corsOrigins: ['http://localhost:5173'],
    bookingEnquiryRepository: repository,
    paymentProvider,
    upiId: 'vinothinimoorthi37-1@okhdfcbank',
    upiPayeeName: 'Vinothini Moorthi',
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
    ),
  )
})

test('UPI endpoint uses server-side booking price and leaves the booking unconfirmed', async () => {
  const baseUrl = await startServer()
  const response = await fetch(`${baseUrl}/api/booking-enquiries/${requestId}/upi-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utr: '123456789012', amount: 1, upiId: 'attacker@upi' }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.booking.paymentProviderMode, 'upi')
  assert.equal(payload.booking.paymentProvider, 'upi')
  assert.equal(payload.booking.upiId, 'vinothinimoorthi37-1@okhdfcbank')
  assert.equal(payload.booking.upiPayeeName, 'Vinothini Moorthi')
  assert.equal(payload.booking.paymentStatus, 'processing')
  assert.equal(payload.booking.status, 'pending')
  assert.equal(payload.booking.reference, '')
  assert.equal(payload.booking.upiPayment.status, 'Submitted for Verification')
  assert.equal(payload.booking.upiPayment.amount, payload.booking.paymentAmount)
  assert.notEqual(payload.booking.paymentAmount, 1)

  const razorpayResponse = await fetch(`${baseUrl}/api/booking-enquiries/${requestId}/razorpay-order`, {
    method: 'POST',
  })
  assert.equal(razorpayResponse.status, 503)
})

test('UPI fallback is allowed when Razorpay is configured and no Razorpay order exists', async () => {
  const baseUrl = await startServer('razorpay')
  const response = await fetch(`${baseUrl}/api/booking-enquiries/${requestId}/upi-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utr: '123456789012' }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.booking.paymentProviderMode, 'razorpay')
  assert.equal(payload.booking.paymentProvider, 'upi')
  assert.equal(payload.booking.reference, '')
})

test('UPI fallback refuses a booking that already has a Razorpay order', async () => {
  const baseUrl = await startServer('razorpay', 'order_existing')
  const response = await fetch(`${baseUrl}/api/booking-enquiries/${requestId}/upi-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utr: '123456789012' }),
  })

  assert.equal(response.status, 409)
})
