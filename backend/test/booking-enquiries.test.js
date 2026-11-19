import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { events } from '../../src/data/events.js'

const servers = []

async function startTestServer({
  eventRepository,
  repository: suppliedRepository,
  cashfreePayments,
  cashfreeConfigured = false,
  nodeEnv,
  whatsappNotifications,
  diwaliOfferService,
} = {}) {
  const saved = suppliedRepository?.saved ?? new Map()
  let nextReference = 10812026501
  const repository = suppliedRepository ?? {
    async save(enquiry) {
      const existing = saved.get(enquiry.requestId)
      if (existing) {
        if (
          existing.name !== enquiry.name ||
          existing.mobile !== enquiry.mobile ||
          existing.email !== (enquiry.email ?? '') ||
          existing.eventId !== enquiry.eventId ||
          existing.categoryId !== enquiry.categoryId ||
          existing.ticketType !== enquiry.ticketType ||
          existing.ticketQuantity !== enquiry.ticketQuantity ||
          existing.gender !== enquiry.gender ||
          existing.maleCount !== enquiry.maleCount ||
          existing.femaleCount !== enquiry.femaleCount ||
          JSON.stringify(existing.maleMemberNames ?? []) !== JSON.stringify(enquiry.maleMemberNames ?? []) ||
          JSON.stringify(existing.femaleMemberNames ?? []) !== JSON.stringify(enquiry.femaleMemberNames ?? [])
        ) {
          throw Object.assign(new Error('Request ID conflict.'), { status: 409 })
        }
        return { enquiry: existing, duplicate: true }
      }

      const savedEnquiry = {
        ...enquiry,
        email: enquiry.email ?? '',
        paymentStatus: 'unpaid',
        paymentAmount: enquiry.paymentAmount ?? 199,
        paymentAmountPaise: enquiry.paymentAmountPaise ?? 19_900,
        paymentProvider: null,
        paymentReference: '',
        paidAt: null,
        paymentVerifiedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        whatsappConsentAt: enquiry.whatsappConsent ? new Date() : null,
        whatsappNotification: {
          messageType: 'booking_confirmation',
          bookingReference: '',
          status: 'skipped',
          attemptCount: 0,
          history: [],
        },
      }
      saved.set(enquiry.requestId, savedEnquiry)
      return { enquiry: savedEnquiry, duplicate: false }
    },
    async findByRequestId(requestId) {
      return saved.get(requestId) ?? null
    },
    async findByReference(reference) {
      return [...saved.values()].find((enquiry) => enquiry.reference === reference) ?? null
    },
    async optOutWhatsApp(requestId) {
      const enquiry = saved.get(requestId)
      if (!enquiry) return null
      enquiry.whatsappConsent = false
      enquiry.whatsappOptedOutAt = new Date()
      return enquiry
    },
    async markDemoPaid(requestId, { pricing } = {}) {
      const enquiry = saved.get(requestId)
      if (!enquiry) return null
      if (enquiry.paymentStatus === 'demo_paid' && enquiry.reference) {
        return { enquiry, duplicate: true }
      }
      if (enquiry.paymentStatus === 'processing') {
        return { enquiry, pending: true, duplicate: false }
      }
      if (!['unpaid', 'failed'].includes(enquiry.paymentStatus) || enquiry.reference) {
        return null
      }

      Object.assign(enquiry, {
        reference: String(nextReference++),
        paymentStatus: 'demo_paid',
        paymentAmount: pricing?.finalAmount ?? enquiry.paymentAmount ?? 199,
        paymentAmountPaise: pricing?.paymentAmountPaise ?? enquiry.paymentAmountPaise ?? 19_900,
        finalAmount: pricing?.finalAmount ?? enquiry.finalAmount ?? enquiry.paymentAmount ?? 199,
        pricePerTicket: pricing?.pricePerTicket ?? enquiry.pricePerTicket ?? 199,
        subtotal: pricing?.subtotal ?? enquiry.subtotal ?? 199,
        discount: pricing?.discount ?? enquiry.discount ?? 0,
        ticketType: pricing?.ticketType ?? enquiry.ticketType ?? 'general-admission',
        ticketTypeName: pricing?.ticketTypeName ?? enquiry.ticketTypeName ?? 'General Admission',
        ticketQuantity: pricing?.ticketQuantity ?? enquiry.ticketQuantity ?? 1,
        paymentProvider: 'demo',
        paymentReference: `demo_${requestId}`,
        paidAt: new Date(),
        paymentVerifiedAt: new Date(),
        paymentFailureReason: '',
        expiresAt: null,
      })
      return { enquiry, duplicate: false }
    },
    async markDemoFailed(requestId, outcome) {
      const enquiry = saved.get(requestId)
      if (!enquiry || enquiry.reference || !['unpaid', 'failed'].includes(enquiry.paymentStatus)) {
        return null
      }
      enquiry.paymentStatus = 'failed'
      enquiry.paymentFailureReason = outcome
      return enquiry
    },
  }
  repository.saved = saved
  const server = createApp({
    corsOrigins: ['http://localhost:5173'],
    eventRepository,
    bookingEnquiryRepository: repository,
    cashfreePayments,
    cashfreeConfigured,
    nodeEnv,
    whatsappNotifications,
    diwaliOfferService,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    saved,
    repository,
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

test('lists existing events and saves one idempotent booking enquiry', async () => {
  const { baseUrl, saved } = await startTestServer()
  const eventResponse = await fetch(`${baseUrl}/api/events`)
  const eventPayload = await eventResponse.json()

  assert.equal(eventResponse.status, 200)
  assert.deepEqual(
    eventPayload.events.map(({ id, title }) => ({ id, title })),
    events.map(({ id, title }) => ({ id, title })),
  )
  assert.equal(eventPayload.events[0].category, events[0].category)

  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    eventId: events[0].id,
    gender: 'Female',
  }
  const firstResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  assert.equal(firstResponse.status, 201)
  assert.equal(saved.size, 1)
  const savedEnquiry = saved.get(request.requestId)
  assert.equal(savedEnquiry.event, events[0].title)
  assert.equal(savedEnquiry.mobile, '+919876543210')
  assert.equal(savedEnquiry.gender, 'Female')
  assert.equal(savedEnquiry.status, 'pending')
  assert.equal(savedEnquiry.source, 'Website booking journey')
  assert.ok(savedEnquiry.createdAt instanceof Date)

  const duplicateResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(duplicateResponse.status, 200)
  assert.equal(saved.size, 1)

  const conflictingResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, name: 'Different Person' }),
  })
  assert.equal(conflictingResponse.status, 409)
  assert.equal(saved.size, 1)
})

test('reloads persisted booking and attendee details without requiring offer pricing', async () => {
  let pricingReads = 0
  const { baseUrl, saved } = await startTestServer({
    diwaliOfferService: {
      async getPricing() {
        pricingReads += 1
        if (pricingReads > 1) {
          throw new Error('Offer pricing service is unavailable.')
        }
        return {
          regularPrice: 299,
          offerPrice: 249,
          diwaliOfferApplied: true,
        }
      },
    },
  })
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    eventId: events[0].id,
    gender: 'Mixed',
    ticketQuantity: 2,
    maleCount: 1,
    femaleCount: 1,
    maleMemberNames: ['Jordan Example'],
    femaleMemberNames: ['Mira Example'],
  }
  const createResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(createResponse.status, 201)
  const created = await createResponse.json()
  assert.equal(created.booking.paymentAmount, 199)
  assert.equal(created.booking.paymentAmountPaise, 19_900)
  assert.equal(created.booking.ticketQuantity, 2)

  const refreshResponses = await Promise.all([
    fetch(`${baseUrl}/api/booking-enquiries/${request.requestId}`),
    fetch(`${baseUrl}/api/booking-enquiries/${request.requestId}`),
  ])
  const refreshedBookings = await Promise.all(
    refreshResponses.map(async (response) => {
      assert.equal(response.status, 200)
      return (await response.json()).booking
    }),
  )

  for (const booking of refreshedBookings) {
    assert.equal(booking.requestId, request.requestId)
    assert.equal(booking.name, request.name)
    assert.equal(booking.event, events[0].title)
    assert.equal(booking.ticketTypeName, 'General Admission')
    assert.equal(booking.ticketQuantity, 2)
    assert.equal(booking.paymentAmount, 199)
    assert.deepEqual(booking.maleMemberNames, ['Jordan Example'])
    assert.deepEqual(booking.femaleMemberNames, ['Mira Example'])
    assert.equal(booking.paymentStatus, 'unpaid')
  }
  assert.equal(pricingReads, 1)
  assert.equal(saved.size, 1)
})

test('distinguishes invalid and missing booking IDs', async () => {
  const { baseUrl } = await startTestServer()
  const invalidResponse = await fetch(`${baseUrl}/api/booking-enquiries/not-a-uuid`)
  assert.equal(invalidResponse.status, 400)

  const missingId = crypto.randomUUID()
  const missingResponse = await fetch(`${baseUrl}/api/booking-enquiries/${missingId}`)
  const payload = await missingResponse.json()
  assert.equal(missingResponse.status, 404)
  assert.equal(payload.message, 'Booking enquiry not found.')
})

test('stores mixed ticket counts and optional member names consistently', async () => {
  const { baseUrl, saved } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'sing-along',
    gender: 'Mixed',
    ticketQuantity: 4,
    maleCount: 2,
    femaleCount: 2,
    maleMemberNames: ['m1', 'm2'],
    femaleMemberNames: ['f1', 'f2'],
  }
  const response = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const payload = await response.json()

  assert.equal(response.status, 201)
  assert.equal(payload.booking.ticketQuantity, 4)
  assert.equal(payload.booking.maleCount, 2)
  assert.equal(payload.booking.femaleCount, 2)
  assert.deepEqual(payload.booking.maleMemberNames, ['m1', 'm2'])
  assert.deepEqual(payload.booking.femaleMemberNames, ['f1', 'f2'])
  assert.deepEqual(saved.get(request.requestId).maleMemberNames, ['m1', 'm2'])

  const duplicateResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(duplicateResponse.status, 200)

  const invalidResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, requestId: crypto.randomUUID(), femaleCount: 0 }),
  })
  assert.equal(invalidResponse.status, 400)
})

test('does not send automatic WhatsApp messages before successful payment', async () => {
  const { baseUrl, saved } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
    whatsappConsent: true,
  }
  const firstResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const firstPayload = await firstResponse.json()
  assert.equal(firstResponse.status, 201)
  assert.equal(firstPayload.booking.reference, '')
  assert.equal(firstPayload.booking.paymentStatus, 'unpaid')
  assert.equal(firstPayload.booking.whatsappNotification.status, 'skipped')
  assert.equal(saved.get(request.requestId).reference, undefined)
  assert.ok(saved.get(request.requestId).whatsappConsentAt instanceof Date)

  const duplicateResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(duplicateResponse.status, 200)
  assert.equal((await duplicateResponse.json()).booking.reference, '')
})

test('calculates ticket pricing on the server and ignores client-supplied amounts', async () => {
  const { baseUrl, saved } = await startTestServer({
    diwaliOfferService: {
      async getPricing() {
        return {
          paymentAmount: 249,
          paymentAmountPaise: 24_900,
          regularPrice: 299,
          offerPrice: 249,
          diwaliOfferApplied: true,
          offerActivationAt: new Date('2026-11-09T00:00:00.000Z'),
          offerExpiresAt: new Date('2026-11-12T00:00:00.000Z'),
        }
      },
    },
  })
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
    ticketType: 'general-admission',
    ticketQuantity: 3,
    femaleMemberNames: ['Jordan Example', 'Guest Two', 'Guest Three'],
    pricePerTicket: 1,
    subtotal: 1,
    discount: 0,
    finalAmount: 1,
    paymentAmount: 1,
    paymentAmountPaise: 100,
  }
  const response = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const payload = await response.json()

  assert.equal(response.status, 201)
  assert.equal(payload.booking.ticketType, 'general-admission')
  assert.equal(payload.booking.ticketTypeName, 'General Admission')
  assert.equal(payload.booking.ticketQuantity, 3)
  assert.equal(payload.booking.pricePerTicket, 199)
  assert.equal(payload.booking.subtotal, 597)
  assert.equal(payload.booking.discount, 0)
  assert.equal(payload.booking.finalAmount, 597)
  assert.equal(payload.booking.paymentAmount, 597)
  assert.equal(payload.booking.paymentAmountPaise, 59_700)
  assert.equal(saved.get(request.requestId).paymentAmount, 597)
})

test('rejects invalid ticket quantities and unavailable ticket types', async () => {
  const { baseUrl } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
    ticketType: 'general-admission',
    ticketQuantity: 11,
  }
  const invalidQuantityResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(invalidQuantityResponse.status, 400)

  const invalidTypeResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, requestId: crypto.randomUUID(), ticketQuantity: 1, ticketType: 'vip' }),
  })
  assert.equal(invalidTypeResponse.status, 400)
})

test('keeps temporary booking data separate from WhatsApp send status', async () => {
  const { baseUrl, saved } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
    whatsappConsent: true,
  }
  const failureResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const failurePayload = await failureResponse.json()
  assert.equal(failureResponse.status, 201)
  assert.equal(saved.size, 1)
  assert.equal(failurePayload.booking.reference, '')
  assert.equal(failurePayload.booking.whatsappNotification.status, 'skipped')
  assert.equal(saved.get(request.requestId).whatsappNotification.failureReason, undefined)
  assert.equal(failurePayload.booking.whatsappNotification.failureReason, undefined)

  const noConsent = {
    ...request,
    requestId: crypto.randomUUID(),
    whatsappConsent: false,
  }
  const skippedResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noConsent),
  })
  const skippedPayload = await skippedResponse.json()
  assert.equal(skippedResponse.status, 201)
  assert.equal(skippedPayload.booking.whatsappNotification.status, 'skipped')
  assert.equal(saved.size, 2)
})

test('failed payment retry uses the fixed per-ticket server amount regardless of offer settings', async () => {
  let offerActive = true
  const diwaliOfferService = {
    async getPricing() {
      return {
        paymentAmount: offerActive ? 249 : 299,
        paymentAmountPaise: offerActive ? 24900 : 29900,
        regularPrice: 299,
        offerPrice: 249,
        diwaliOfferApplied: offerActive,
        offerActivationAt: new Date('2026-11-09T10:00:00.000Z'),
        offerExpiresAt: new Date('2026-11-12T10:00:00.000Z'),
      }
    },
  }
  const { baseUrl, saved } = await startTestServer({ diwaliOfferService })
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
  }
  const createResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const created = await createResponse.json()
  assert.equal(created.booking.paymentAmount, 199)
  assert.equal(created.booking.diwaliOfferApplied, false)

  Object.assign(saved.get(request.requestId), {
    paymentStatus: 'failed',
    paymentOrderId: 'order_from_expired_offer',
    paymentAmount: 249,
    paymentOrderAmountPaise: 24900,
    diwaliOfferApplied: true,
  })
  offerActive = false
  const retryResponse = await fetch(`${baseUrl}/api/booking-enquiries/${request.requestId}`)
  const retry = await retryResponse.json()

  assert.equal(retry.booking.paymentAmount, 199)
  assert.equal(retry.booking.paymentAmountPaise, 19_900)
  assert.equal(retry.booking.diwaliOfferApplied, false)
})

test('records customer opt-out on the saved enquiry without changing its booking reference', async () => {
  const { baseUrl, saved } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
    whatsappConsent: true,
  }
  const created = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const originalBooking = (await created.json()).booking
  const optOut = await fetch(
    `${baseUrl}/api/booking-enquiries/${request.requestId}/whatsapp-opt-out`,
    { method: 'POST' },
  )
  const optedOutBooking = (await optOut.json()).booking

  assert.equal(optOut.status, 200)
  assert.equal(optedOutBooking.reference, originalBooking.reference)
  assert.equal(optedOutBooking.whatsappConsent, false)
  assert.ok(optedOutBooking.whatsappOptedOutAt)
  assert.equal(saved.get(request.requestId).reference, undefined)
})

test('serves database events and validates booking selections against them', async () => {
  const databaseEvent = {
    id: 'database-only-event',
    title: 'Database Event',
    description: 'Existing database event description.',
    image: 'https://example.test/event.jpg',
    imageAlt: 'Event image',
  }
  const { baseUrl, saved } = await startTestServer({
    eventRepository: {
      async list() {
        return [databaseEvent]
      },
      async findById(id) {
        return id === databaseEvent.id ? databaseEvent : null
      },
    },
  })

  const eventResponse = await fetch(`${baseUrl}/api/events`)
  assert.equal(eventResponse.status, 200)
  assert.deepEqual((await eventResponse.json()).events, [databaseEvent])

  const submissionResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      name: 'Jordan Example',
      mobile: '+91 98765 43210',
      eventId: databaseEvent.id,
      gender: 'Female',
    }),
  })
  assert.equal(submissionResponse.status, 201)
  assert.equal(saved.size, 1)
  assert.equal([...saved.values()][0].event, databaseEvent.title)
})

test('stores one category interest without assigning an event', async () => {
  const { baseUrl, saved } = await startTestServer()
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
  }
  const response = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  assert.equal(response.status, 201)
  const savedEnquiry = saved.get(request.requestId)
  assert.equal(savedEnquiry.eventId, '')
  assert.equal(savedEnquiry.event, '')
  assert.equal(savedEnquiry.categoryId, 'fun-games')
  assert.equal(savedEnquiry.category, 'Fun Games')

  const duplicateResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(duplicateResponse.status, 200)

  const conflictResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, categoryId: 'sing-along' }),
  })
  assert.equal(conflictResponse.status, 409)
  assert.equal(saved.size, 1)
})

test('loads enquiry details and records one idempotent demo payment', async () => {
  const { baseUrl, saved, repository } = await startTestServer({ nodeEnv: 'development' })
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
  }
  const submitResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(submitResponse.status, 201)

  const detailsResponse = await fetch(
    `${baseUrl}/api/booking-enquiries/${request.requestId}`,
  )
  const details = await detailsResponse.json()
  assert.equal(detailsResponse.status, 200)
  assert.equal(details.booking.name, request.name)
  assert.equal(details.booking.category, 'Fun Games')
  assert.equal(details.booking.paymentStatus, 'unpaid')
  assert.equal(details.booking.reference, '')
  assert.equal('source' in details.booking, false)

  const paymentUrl =
    `${baseUrl}/api/booking-enquiries/${request.requestId}/demo-payment`
  const firstPayment = await fetch(paymentUrl, { method: 'POST' })
  const firstPaymentPayload = await firstPayment.json()
  assert.equal(firstPayment.status, 200)
  assert.equal(firstPaymentPayload.booking.paymentStatus, 'demo_paid')
  assert.equal(firstPaymentPayload.booking.reference, '10812026501')
  assert.equal(firstPaymentPayload.booking.status, 'pending')
  assert.equal(firstPaymentPayload.booking.paymentAmount, 199)
  assert.equal(firstPaymentPayload.booking.paymentProvider, 'demo')
  assert.match(firstPaymentPayload.booking.paymentReference, /^demo_/)
  assert.ok(firstPaymentPayload.booking.paymentVerifiedAt)
  assert.match(firstPaymentPayload.message, /No real payment was processed/)

  const secondPayment = await fetch(paymentUrl, { method: 'POST' })
  const secondPaymentPayload = await secondPayment.json()
  assert.equal(secondPayment.status, 200)
  assert.equal(secondPaymentPayload.duplicate, true)
  assert.equal(
    secondPaymentPayload.booking.paymentReference,
    firstPaymentPayload.booking.paymentReference,
  )
  assert.equal(saved.size, 1)

  const restartedServer = await startTestServer({ repository })
  const persistedResponse = await fetch(
    `${restartedServer.baseUrl}/api/booking-enquiries/${request.requestId}`,
  )
  const persisted = await persistedResponse.json()
  assert.equal(persistedResponse.status, 200)
  assert.equal(persisted.booking.reference, firstPaymentPayload.booking.reference)
  assert.equal(persisted.booking.paymentStatus, 'demo_paid')
})

test('disables the demo simulator when Cashfree is configured', async () => {
  const { baseUrl, saved } = await startTestServer({
    cashfreeConfigured: true,
    nodeEnv: 'development',
  })
  const requestId = crypto.randomUUID()
  const submitted = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      name: 'Jordan Example',
      mobile: '+91 98765 43210',
      categoryId: 'fun-games',
      gender: 'Female',
    }),
  })
  assert.equal(submitted.status, 201)

  const demoResponse = await fetch(
    `${baseUrl}/api/booking-enquiries/${requestId}/demo-payment`,
    { method: 'POST' },
  )

  assert.equal(demoResponse.status, 404)
  assert.equal(saved.get(requestId).reference, undefined)
  assert.equal(saved.get(requestId).paymentStatus, 'unpaid')
})

test('creates a Cashfree checkout session through the booking route with mocked gateway data', async () => {
  let saved
  let receivedOptions
  const { baseUrl, saved: records } = await startTestServer({
    cashfreeConfigured: true,
    cashfreePayments: {
      async createOrder(requestId, options) {
        assert.equal(requestId, saved.requestId)
        receivedOptions = options
        return {
          order_id: 'cf-order-mock',
          payment_session_id: 'cf-session-mock',
          amount: 199,
          currency: 'INR',
          environment: 'sandbox',
          booking: saved,
        }
      },
    },
  })
  const request = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    categoryId: 'fun-games',
    gender: 'Female',
  }
  const submitResponse = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(submitResponse.status, 201)
  saved = records.get(request.requestId)

  const checkoutResponse = await fetch(
    `${baseUrl}/api/booking-enquiries/${request.requestId}/cashfree-order`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: 'https://vibetogether.show/return' }),
    },
  )
  const checkout = await checkoutResponse.json()

  assert.equal(checkoutResponse.status, 200)
  assert.equal(checkout.payment_session_id, 'cf-session-mock')
  assert.equal(checkout.order_id, 'cf-order-mock')
  assert.equal(checkout.booking.requestId, request.requestId)
  assert.equal(checkout.booking.cashfreeConfigured, true)
  assert.deepEqual(receivedOptions, {
    returnUrl: 'https://vibetogether.show/return',
    notifyUrl: undefined,
  })
})

test('Cashfree verification notifies only for confirmed failures and preserves success behavior', async (t) => {
  let verification
  const notifications = []
  const notificationLogs = []
  const originalInfo = console.info
  const originalError = console.error
  console.info = (message, details) => notificationLogs.push({ level: 'info', message, details })
  console.error = (message, details) => notificationLogs.push({ level: 'error', message, details })
  t.after(() => {
    console.info = originalInfo
    console.error = originalError
  })
  const { baseUrl } = await startTestServer({
    cashfreeConfigured: true,
    cashfreePayments: {
      async verifyPayment() {
        return verification
      },
    },
    whatsappNotifications: {
      async notify(requestId, type) {
        notifications.push({ requestId, type })
        return type === 'booking_confirmation' ? { sent: true } : { failed: true }
      },
    },
  })
  const requestId = crypto.randomUUID()
  const submitted = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      name: 'Jordan Example',
      mobile: '+91 98765 43210',
      email: 'jordan@example.com',
      categoryId: 'fun-games',
      gender: 'Female',
    }),
  })
  assert.equal(submitted.status, 201)

  async function verify(result) {
    verification = result
    return fetch(`${baseUrl}/api/booking-enquiries/${requestId}/cashfree-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: 'order_test_booking' }),
    })
  }

  const pendingResponse = await verify({
    pending: true,
    booking: { requestId, paymentStatus: 'unpaid' },
  })
  assert.equal(pendingResponse.status, 202)
  assert.deepEqual(notifications, [])

  await verify({
    failed: false,
    booking: {
      requestId,
      paymentStatus: 'failed',
      paymentFailureReason: 'failed',
    },
  })
  assert.deepEqual(notifications, [])

  await verify({
    failed: true,
    booking: {
      requestId,
      paymentStatus: 'failed',
      paymentFailureReason: 'cancelled',
    },
  })
  assert.deepEqual(notifications, [])

  await verify({
    failed: true,
    booking: {
      requestId,
      paymentStatus: 'failed',
      paymentFailureReason: 'failed',
    },
  })
  assert.deepEqual(notifications, [{
    requestId,
    type: 'payment_assistance',
  }])

  await verify({
    verified: true,
    booking: {
      requestId,
      paymentStatus: 'paid',
      reference: 'VT-TEST-1',
    },
  })
  assert.deepEqual(notifications, [
    { requestId, type: 'payment_assistance' },
    { requestId, type: 'booking_confirmation' },
  ])
  assert.ok(notificationLogs.some(({ details }) =>
    details?.stage === 'caller_result' && details.source === 'cashfree_verification' &&
    details.notificationType === 'payment_assistance' && details.outcome === 'REJECTED',
  ))
  assert.equal(JSON.stringify(notificationLogs).includes(requestId), false)
})

test('failed and cancelled demo payments have no reference and can retry the same session', async () => {
  for (const outcome of ['failed', 'cancelled']) {
    const { baseUrl, saved } = await startTestServer({ nodeEnv: 'development' })
    const request = {
      requestId: crypto.randomUUID(),
      name: 'Jordan Example',
      mobile: '+91 98765 43210',
      email: 'jordan@example.com',
      categoryId: 'fun-games',
      gender: 'Female',
    }
    const submitted = await fetch(`${baseUrl}/api/booking-enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const submittedPayload = await submitted.json()
    assert.equal(submitted.status, 201)
    assert.equal(submittedPayload.booking.reference, '')
    assert.equal(submittedPayload.booking.email, request.email)

    const failed = await fetch(
      `${baseUrl}/api/booking-enquiries/${request.requestId}/demo-payment-failure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      },
    )
    const failedPayload = await failed.json()
    assert.equal(failed.status, 200)
    assert.equal(failedPayload.booking.paymentStatus, 'failed')
    assert.equal(failedPayload.booking.paymentFailureReason, outcome)
    assert.equal(failedPayload.booking.reference, '')
    assert.equal(saved.get(request.requestId).reference, undefined)

    const retry = await fetch(
      `${baseUrl}/api/booking-enquiries/${request.requestId}/demo-payment`,
      { method: 'POST' },
    )
    const retryPayload = await retry.json()
    assert.equal(retry.status, 200)
    assert.equal(retryPayload.booking.paymentStatus, 'demo_paid')
    assert.equal(retryPayload.booking.reference, '10812026501')
    assert.equal(saved.size, 1)
  }
})

test('returns an empty event list and a friendly error when the event store fails', async () => {
  const empty = await startTestServer({
    eventRepository: {
      async list() {
        return []
      },
      async findById() {
        return null
      },
    },
  })
  const emptyResponse = await fetch(`${empty.baseUrl}/api/events`)
  assert.equal(emptyResponse.status, 200)
  assert.deepEqual(await emptyResponse.json(), { events: [] })

  const unavailable = await startTestServer({
    eventRepository: {
      async list() {
        throw new Error('Private database details')
      },
      async findById() {
        throw new Error('Private database details')
      },
    },
  })
  const unavailableResponse = await fetch(`${unavailable.baseUrl}/api/events`)
  assert.equal(unavailableResponse.status, 503)
  assert.deepEqual(await unavailableResponse.json(), {
    message: 'Event experiences are temporarily unavailable.',
  })
})

test('rejects invalid names, phone numbers, genders, and unavailable events', async () => {
  const { baseUrl, saved } = await startTestServer()
  const valid = {
    requestId: crypto.randomUUID(),
    name: 'Jordan Example',
    mobile: '+91 98765 43210',
    eventId: events[0].id,
    gender: 'Female',
  }
  const invalidCases = [
    { ...valid, requestId: crypto.randomUUID(), name: '<script>bad</script>' },
    { ...valid, requestId: crypto.randomUUID(), mobile: '123' },
    { ...valid, requestId: crypto.randomUUID(), gender: 'Other' },
    { ...valid, requestId: crypto.randomUUID(), eventId: 'not-an-event' },
    {
      requestId: crypto.randomUUID(),
      name: 'Jordan Example',
      mobile: '+91 98765 43210',
      categoryId: 'not-a-category',
      gender: 'Female',
    },
  ]

  for (const body of invalidCases) {
    const response = await fetch(`${baseUrl}/api/booking-enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
  }
  assert.equal(saved.size, 0)
})

test('rate limits repeated booking submissions', async () => {
  const { baseUrl } = await startTestServer()
  const responses = []
  for (let index = 0; index < 6; index += 1) {
    responses.push(
      await fetch(`${baseUrl}/api/booking-enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          name: 'Jordan Example',
          mobile: '+91 98765 43210',
          eventId: events[0].id,
          gender: 'Male',
        }),
      }),
    )
  }
  assert.deepEqual(
    responses.map(({ status }) => status),
    [201, 201, 201, 201, 201, 429],
  )
})

test('rejects malformed JSON without exposing parser details', async () => {
  const { baseUrl } = await startTestServer()
  const response = await fetch(`${baseUrl}/api/booking-enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { message: 'Malformed JSON request.' })
})
