import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'

const servers = []

async function startTestServer(options = {}) {
  const server = createApp({
    corsOrigins: ['http://localhost:5173'],
    ...options,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
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

function query(getValue) {
  return {
    lean: async () => getValue(),
    exec: async () => getValue(),
  }
}

test('creates idempotent free bookings and restores seats once on cancellation', async () => {
  const event = {
    id: 'database-free-event',
    title: 'Database Event',
    category: 'Community',
    date: '2030-07-12',
    time: '18:00',
    location: 'Vibe Hall',
    status: 'published',
    isFree: true,
    priceAmount: 0,
    seatsAvailable: 5,
    currency: 'INR',
  }
  const records = new Map()
  const eventModel = {
    findOne: (filter) => query(() =>
      filter.id === event.id && filter.status === event.status ? { ...event } : null,
    ),
    findOneAndUpdate: (filter, update) => query(() => {
      if (
        filter.id !== event.id ||
        filter.status !== event.status ||
        !event.isFree ||
        event.seatsAvailable < filter.seatsAvailable.$gte
      ) {
        return null
      }
      event.seatsAvailable += update.$inc.seatsAvailable
      return { ...event }
    }),
    updateOne: async (_filter, update) => {
      event.seatsAvailable += update.$inc.seatsAvailable
      return { modifiedCount: 1 }
    },
  }
  const bookingModel = {
    findOne: (filter) => query(() => {
      if (filter.requestId) {
        return [...records.values()].find((item) => item.requestId === filter.requestId) ?? null
      }
      return [...records.values()].find((item) => item.reference === filter.reference) ?? null
    }),
    findOneAndUpdate: (filter, update) => query(() => {
      const booking = [...records.values()].find((item) => item.reference === filter.reference)
      if (!booking || booking.status === 'cancelled' || booking.paymentStatus !== 'not_required') {
        return null
      }
      Object.assign(booking, update.$set)
      return { ...booking }
    }),
    create: async (input) => {
      const booking = {
        ...input,
        _id: `booking-${records.size + 1}`,
        createdAt: new Date(),
      }
      records.set(booking.reference, booking)
      return booking
    },
  }
  const baseUrl = await startTestServer({
    bookingModel,
    bookingEventModel: eventModel,
  })
  const request = {
    requestId: crypto.randomUUID(),
    eventId: event.id,
    attendee: {
      fullName: 'Jordan Example',
      email: 'jordan@example.com',
      mobile: '+919876543210',
    },
    ticketCount: 1,
  }

  const createdResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(createdResponse.status, 201)
  const { booking } = await createdResponse.json()
  assert.equal(booking.status, 'confirmed')
  assert.equal(event.seatsAvailable, 4)

  const duplicateResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(duplicateResponse.status, 200)
  assert.equal(event.seatsAvailable, 4)

  const lookupResponse = await fetch(`${baseUrl}/api/bookings/${booking.reference}`)
  assert.equal(lookupResponse.status, 200)
  assert.equal((await lookupResponse.json()).booking.reference, booking.reference)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cancellation = await fetch(`${baseUrl}/api/bookings/${booking.reference}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(cancellation.status, 200)
    assert.equal((await cancellation.json()).booking.status, 'cancelled')
  }
  assert.equal(event.seatsAvailable, 5)
})

test('persists newsletter subscriptions and contact enquiries', async () => {
  const subscribers = []
  const enquiries = []
  const baseUrl = await startTestServer({
    subscriberModel: {
      async findOneAndUpdate(filter, update) {
        subscribers.push({ email: filter.email, ...update.$setOnInsert, ...update.$set })
      },
    },
    enquiryModel: {
      async create(record) {
        enquiries.push(record)
      },
    },
  })

  const subscription = await fetch(`${baseUrl}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ' Jordan@Example.com ' }),
  })
  assert.equal(subscription.status, 200)
  assert.equal(subscribers[0].email, 'jordan@example.com')

  const contact = await fetch(`${baseUrl}/api/enquiries/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Jordan Example',
      email: 'jordan@example.com',
      mobile: '+919876543210',
      subject: 'Question',
      message: 'A valid contact request.',
    }),
  })
  assert.equal(contact.status, 201)
  assert.equal(enquiries[0].type, 'contact')
  assert.equal(enquiries[0].name, 'Jordan Example')
  assert.equal(enquiries[0].status, 'pending')
})
