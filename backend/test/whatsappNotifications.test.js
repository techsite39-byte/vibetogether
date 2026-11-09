import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createWhatsAppNotificationService,
  isValidWhatsAppWebhookSignature,
} from '../src/services/whatsappNotifications.js'
import { createHmac } from 'node:crypto'

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object)
}

function setPath(object, path, value) {
  const parts = path.split('.')
  const key = parts.pop()
  const target = parts.reduce((valueAtPath, part) => {
    valueAtPath[part] ??= {}
    return valueAtPath[part]
  }, object)
  target[key] = value
}

function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = key.startsWith('$') ? undefined : getPath(record, key)
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return actual !== expected.$ne
      if ('$lte' in expected) return actual <= expected.$lte
      if ('$in' in expected) return expected.$in.includes(actual)
      return Object.entries(expected).every(([operator, value]) => operator === '$ne' && actual !== value)
    }
    return actual === expected
  })
}

function createBookingModel(booking) {
  const record = structuredClone(booking)
  return {
    findOne(filter) {
      return { lean: async () => matches(record, filter) ? structuredClone(record) : null }
    },
    findOneAndUpdate(filter, update) {
      if (!matches(record, filter)) {
        return { lean: async () => null }
      }
      for (const [path, value] of Object.entries(update.$set ?? {})) {
        setPath(record, path, structuredClone(value))
      }
      for (const [path, amount] of Object.entries(update.$inc ?? {})) {
        setPath(record, path, (getPath(record, path) ?? 0) + amount)
      }
      for (const [path, value] of Object.entries(update.$push ?? {})) {
        const values = Array.isArray(value?.$each) ? value.$each : [value]
        const previous = getPath(record, path) ?? []
        setPath(record, path, [...previous, ...structuredClone(values)])
      }
      return { lean: async () => structuredClone(record) }
    },
    get record() {
      return structuredClone(record)
    },
  }
}

function booking(overrides = {}) {
  return {
    _id: 'booking-1',
    requestId: 'session-1',
    name: 'Jordan Example',
    mobile: '+919876543210',
    email: 'jordan@example.com',
    category: 'Fun Games',
    gender: 'Female',
    createdAt: new Date('2026-11-09T10:00:00.000Z'),
    status: 'pending',
    paymentStatus: 'paid',
    paymentAmount: 249,
    regularPrice: 299,
    offerPrice: 249,
    diwaliOfferApplied: true,
    reference: '10812026501',
    whatsappConsent: true,
    whatsappNotification: { status: 'skipped', history: [] },
    ...overrides,
  }
}

function createService(model, fetchImpl) {
  return createWhatsAppNotificationService({
    bookingEnquiryModel: model,
    phoneNumberId: 'meta-phone-id',
    accessToken: 'test-token',
    apiVersion: 'v22.0',
    successTemplateName: 'vibe_booking_confirmation',
    failureTemplateName: 'vibe_payment_assistance',
    fetchImpl,
    now: () => new Date('2026-11-09T10:00:00.000Z'),
  })
}

test('sends one approved confirmation template to the consented customer number', async () => {
  const model = createBookingModel(booking())
  const requests = []
  const service = createService(model, async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.confirm-1' }] }) }
  })

  const sent = await service.notify('session-1', 'booking_confirmation')
  const duplicate = await service.notify('session-1', 'booking_confirmation')

  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /meta-phone-id\/messages$/)
  assert.equal(requests[0].payload.to, '919876543210')
  assert.notEqual(requests[0].payload.to, '918778595810')
  assert.equal(requests[0].payload.template.name, 'vibe_booking_confirmation')
  assert.equal(requests[0].payload.template.components[0].parameters[0].text, 'Jordan Example')
  assert.match(requests[0].payload.template.components[0].parameters[8].text, /Diwali Offer Price: ₹249/)
  assert.equal(model.record.whatsappNotification.recipient, '+919876543210')
  assert.equal(model.record.whatsappNotification.status, 'sent')
  assert.equal(model.record.whatsappNotification.providerMessageId, 'wamid.confirm-1')
  assert.equal(sent.sent, true)
  assert.equal(duplicate.duplicate, true)
})

test('sends failure assistance without a permanent reference and reports the applicable amount', async () => {
  const model = createBookingModel(booking({
    paymentStatus: 'failed',
    paymentFailureReason: 'cancelled',
    paymentAmount: 249,
    reference: '',
    diwaliOfferApplied: true,
  }))
  let payload
  const service = createService(model, async (_url, options) => {
    payload = JSON.parse(options.body)
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.failure-1' }] }) }
  })

  const result = await service.notify('session-1', 'payment_assistance')

  const parameters = payload.template.components[0].parameters
  assert.equal(payload.template.name, 'vibe_payment_assistance')
  assert.equal(payload.to, '919876543210')
  assert.equal(parameters[0].text, 'Jordan Example')
  assert.equal(parameters[3].text, '₹249')
  assert.equal(parameters[4].text, 'Cancelled')
  assert.equal(model.record.reference, '')
  assert.equal(result.sent, true)
})

test('records skipped without consent and does not call the WhatsApp API', async () => {
  const model = createBookingModel(booking({ whatsappConsent: false }))
  let requestCount = 0
  const service = createService(model, async () => {
    requestCount += 1
    throw new Error('Should not be called.')
  })

  const result = await service.notify('session-1', 'booking_confirmation')

  assert.equal(requestCount, 0)
  assert.equal(result.skipped, true)
  assert.equal(model.record.whatsappNotification.status, 'skipped')
  assert.match(model.record.whatsappNotification.history[0].note, /no WhatsApp notification consent/i)
})

test('records delivered and read webhooks idempotently without regressing status', async () => {
  const model = createBookingModel(booking())
  const service = createService(model, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.status-1' }] }),
  }))
  await service.notify('session-1', 'booking_confirmation')

  await service.recordWebhookStatus({ messageId: 'wamid.status-1', status: 'delivered', timestamp: '1794228000' })
  await service.recordWebhookStatus({ messageId: 'wamid.status-1', status: 'delivered', timestamp: '1794228000' })
  await service.recordWebhookStatus({ messageId: 'wamid.status-1', status: 'read', timestamp: '1794228001' })
  await service.recordWebhookStatus({ messageId: 'wamid.status-1', status: 'delivered', timestamp: '1794228000' })

  const events = model.record.whatsappNotification.history.filter((entry) => entry.status === 'delivered')
  assert.equal(model.record.whatsappNotification.status, 'read')
  assert.equal(events.length, 1)
})

test('verifies Meta webhook signatures against the original request body', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}')
  const secret = 'meta-test-secret'
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

  assert.equal(isValidWhatsAppWebhookSignature(body, signature, secret), true)
  assert.equal(isValidWhatsAppWebhookSignature(body, signature, 'wrong-secret'), false)
})

test('buildWhatsAppMessage produces exact required copy for success and failure', async () => {
  const { buildWhatsAppMessage } = await import('../src/services/whatsappNotifications.js')
  const successMsg = buildWhatsAppMessage(booking())
  assert.match(successMsg, /✨ VIBE TOGETHER – PAYMENT SUCCESSFUL! ✨/)
  assert.match(successMsg, /Hello Jordan Example! 💜/)
  assert.match(successMsg, /🎟️ Booking Reference: 10812026501/)
  assert.match(successMsg, /Amount Paid: ₹249/)
  assert.match(successMsg, /Payment Status: PAID/)
  assert.match(successMsg, /https:\/\/www\.vibetogether\.show/)
  assert.match(successMsg, /Connect\. Celebrate\. Experience\./)

  const failBooking = booking({
    paymentStatus: 'failed',
    paymentFailureReason: 'cancelled',
    paymentAmount: 249,
    reference: '',
    diwaliOfferApplied: true,
  })
  const failMsg = buildWhatsAppMessage(failBooking, 'failure')
  assert.match(failMsg, /✨ VIBE TOGETHER – PAYMENT UPDATE ✨/)
  assert.match(failMsg, /Hello Jordan Example!/)
  assert.match(failMsg, /Amount: ₹249/)
  assert.match(failMsg, /Payment Status: CANCELLED/)
  assert.match(failMsg, /Your booking is not confirmed yet\./)
  assert.match(failMsg, /Please return to Vibe Together and retry your payment\./)
  assert.match(failMsg, /VIBE TOGETHER 💜/)
})

test('admin forced retry does not send duplicate messages when already delivered', async () => {
  const model = createBookingModel(booking())
  let calls = 0
  const service = createService(model, async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.admin-1' }] }) }
  })

  await service.notify('session-1', 'booking_confirmation')
  assert.equal(calls, 1)

  // Mark as delivered
  await service.recordWebhookStatus({ messageId: 'wamid.admin-1', status: 'delivered', timestamp: '1794228000' })
  assert.equal(model.record.whatsappNotification.status, 'delivered')

  // Attempt admin force retry
  const retryResult = await service.notify('session-1', 'booking_confirmation', { force: true, retry: true })
  assert.equal(retryResult.duplicate, true)
  assert.equal(retryResult.alreadyDelivered, true)
  assert.equal(calls, 1, 'Did not call Meta API again because message was already delivered')
})
