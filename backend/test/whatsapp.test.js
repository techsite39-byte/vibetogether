import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import {
  createBookingTemplateParameters,
  createWhatsAppService,
  normalizeWhatsAppNumber,
} from '../src/services/whatsapp.js'

const servers = []

async function startServer(options) {
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

test('normalizes Indian and international WhatsApp numbers into E.164 digits', () => {
  assert.equal(normalizeWhatsAppNumber('+91 98765 43210'), '919876543210')
  assert.equal(normalizeWhatsAppNumber('+44 7700 900123'), '447700900123')
  assert.equal(normalizeWhatsAppNumber('9876543210'), '919876543210')
  assert.equal(normalizeWhatsAppNumber('12345'), '')
})

test('sends an approved template using persisted booking fields and never claims delivery', async () => {
  let outbound
  const service = createWhatsAppService({
    phoneNumberId: 'phone-id',
    businessAccountId: 'account-id',
    accessToken: 'server-only-token',
    apiVersion: 'v21.0',
    templateName: 'vibe_booking_confirmation_v1',
    templateLanguage: 'en',
    fetchImpl: async (url, options) => {
      outbound = { url, options, payload: JSON.parse(options.body) }
      return {
        ok: true,
        status: 200,
        async json() {
          return { messages: [{ id: 'wamid.confirmed' }] }
        },
      }
    },
  })
  const booking = {
    reference: '10812026501',
    name: 'Jordan Example',
    mobile: '+919876543210',
    category: 'Fun Games',
    event: '',
    gender: 'Female',
    createdAt: '2026-11-09T06:00:00.000Z',
    paymentStatus: 'demo_paid',
  }
  const result = await service.sendBookingConfirmation(booking, { enabled: true })

  assert.equal(result.status, 'sent')
  assert.equal(result.messageId, 'wamid.confirmed')
  assert.equal('delivered' in result, false)
  assert.equal(outbound.url, 'https://graph.facebook.com/v21.0/phone-id/messages')
  assert.equal(outbound.options.headers.Authorization, 'Bearer server-only-token')
  assert.equal(outbound.payload.to, '919876543210')
  assert.equal(outbound.payload.type, 'template')
  assert.equal(outbound.payload.template.name, 'vibe_booking_confirmation_v1')
  assert.deepEqual(
    outbound.payload.template.components[0].parameters.map(({ text }) => text),
    createBookingTemplateParameters(booking),
  )
  assert.ok(outbound.payload.template.components[0].parameters.some(({ text }) =>
    text === '10812026501',
  ))
  assert.ok(outbound.payload.template.components[0].parameters.some(({ text }) =>
    text.includes('no real money collected'),
  ))
  assert.equal(
    outbound.payload.template.components[0].parameters.at(-1).text,
    'Booking Received (not yet approved)',
  )
})

test('reports API rejection as retryable but does not retry ambiguous network failures', async () => {
  const rejected = createWhatsAppService({
    phoneNumberId: 'phone-id',
    accessToken: 'token',
    apiVersion: 'v21.0',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return {} },
    }),
  })
  const rejectedResult = await rejected.sendBookingConfirmation({
    reference: '10812026501',
    name: 'Jordan',
    mobile: '+919876543210',
    category: 'Fun Games',
    gender: 'Female',
    createdAt: new Date(),
    paymentStatus: 'unpaid',
  })
  assert.equal(rejectedResult.status, 'failed')
  assert.equal(rejectedResult.retryable, true)

  const networkError = createWhatsAppService({
    phoneNumberId: 'phone-id',
    accessToken: 'token',
    apiVersion: 'v21.0',
    fetchImpl: async () => {
      throw new Error('socket reset')
    },
  })
  const networkResult = await networkError.sendBookingConfirmation({
    reference: '10812026501',
    name: 'Jordan',
    mobile: '+919876543210',
    category: 'Fun Games',
    gender: 'Female',
    createdAt: new Date(),
    paymentStatus: 'unpaid',
  })
  assert.equal(networkResult.status, 'failed')
  assert.equal(networkResult.retryable, false)
})

test('verifies Meta webhook challenge and HMAC signature before accepting statuses', async () => {
  const appSecret = 'test-meta-app-secret'
  const updates = []
  const optedOutNumbers = []
  const repository = {
    async save() { throw new Error('unused') },
    async findByRequestId() { return null },
    async markDemoPaid() { return null },
    async updateWhatsAppDeliveryStatus(status) { updates.push(status) },
    async optOutWhatsAppByPhone(number) { optedOutNumbers.push(number) },
  }
  const whatsappService = createWhatsAppService({
    appSecret,
    webhookVerifyToken: 'verify-token',
  })
  const baseUrl = await startServer({ bookingEnquiryRepository: repository, whatsappService })

  const challenge = await fetch(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value`,
  )
  assert.equal(challenge.status, 200)
  assert.equal(await challenge.text(), 'challenge-value')

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '919876543210',
            type: 'text',
            text: { body: 'STOP' },
          }],
          statuses: [{
            id: 'wamid.confirmed',
            status: 'delivered',
            timestamp: '1794204000',
          }],
        },
      }],
    }],
  })
  const signature = `sha256=${createHmac('sha256', appSecret).update(payload).digest('hex')}`
  const invalid = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=invalid' },
    body: payload,
  })
  assert.equal(invalid.status, 401)

  const accepted = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body: payload,
  })
  assert.equal(accepted.status, 200)
  assert.deepEqual(await accepted.json(), { received: true })
  assert.equal(updates.length, 1)
  assert.equal(updates[0].messageId, 'wamid.confirmed')
  assert.equal(updates[0].status, 'delivered')
  assert.deepEqual(optedOutNumbers, ['+919876543210'])
})
