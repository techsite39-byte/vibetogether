import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { events } from '../../src/data/events.js'

const servers = []

async function startTestServer({ eventRepository } = {}) {
  const saved = new Map()
  const repository = {
    async save(enquiry) {
      const existing = saved.get(enquiry.requestId)
      if (existing) {
        if (
          existing.name !== enquiry.name ||
          existing.mobile !== enquiry.mobile ||
          existing.eventId !== enquiry.eventId ||
          existing.categoryId !== enquiry.categoryId ||
          existing.gender !== enquiry.gender
        ) {
          throw Object.assign(new Error('Request ID conflict.'), { status: 409 })
        }
        return { enquiry: existing, duplicate: true }
      }

      const savedEnquiry = {
        ...enquiry,
        paymentStatus: 'unpaid',
        paymentAmount: 299,
        paymentProvider: null,
        paymentReference: '',
        paidAt: null,
      }
      saved.set(enquiry.requestId, savedEnquiry)
      return { enquiry: savedEnquiry, duplicate: false }
    },
    async findByRequestId(requestId) {
      return saved.get(requestId) ?? null
    },
    async markDemoPaid(requestId) {
      const enquiry = saved.get(requestId)
      if (!enquiry) return null
      if (enquiry.paymentStatus === 'demo_paid') {
        return { enquiry, duplicate: true }
      }

      Object.assign(enquiry, {
        paymentStatus: 'demo_paid',
        paymentAmount: 299,
        paymentProvider: 'razorpay_demo',
        paymentReference: `demo_${requestId}`,
        paidAt: new Date(),
      })
      return { enquiry, duplicate: false }
    },
  }
  const server = createApp({
    bookingEnquiryRepository: repository,
    corsOrigins: ['http://localhost:5173'],
    eventRepository,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    saved,
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
  const { baseUrl, saved } = await startTestServer()
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
  assert.equal('source' in details.booking, false)

  const paymentUrl =
    `${baseUrl}/api/booking-enquiries/${request.requestId}/demo-payment`
  const firstPayment = await fetch(paymentUrl, { method: 'POST' })
  const firstPaymentPayload = await firstPayment.json()
  assert.equal(firstPayment.status, 200)
  assert.equal(firstPaymentPayload.booking.paymentStatus, 'demo_paid')
  assert.equal(firstPaymentPayload.booking.paymentAmount, 299)
  assert.equal(firstPaymentPayload.booking.paymentProvider, 'razorpay_demo')
  assert.match(firstPaymentPayload.booking.paymentReference, /^demo_/)
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
