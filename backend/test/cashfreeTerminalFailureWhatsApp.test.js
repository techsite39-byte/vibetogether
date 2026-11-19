import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWhatsAppNotificationService } from '../src/services/whatsappNotifications.js'

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
    if (key === '$or') return expected.some((condition) => matches(record, condition))
    if (key === '$and') return expected.every((condition) => matches(record, condition))
    const actual = key.startsWith('$') ? undefined : getPath(record, key)
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return actual !== expected.$ne
      if ('$lte' in expected) return actual <= expected.$lte
      if ('$in' in expected) return expected.$in.includes(actual)
      if ('$nin' in expected) return !expected.$nin.includes(actual)
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$ne') return actual !== value
        if (operator === '$nin') return !value.includes(actual)
        return false
      })
    }
    return actual === expected
  })
}

function createMockBookingModel(initialBooking) {
  const record = structuredClone(initialBooking)
  return {
    collection: { name: 'bookings-db' },
    record,
    find(filter) {
      return {
        limit() { return this },
        lean: async () => matches(record, filter) ? [structuredClone(record)] : [],
      }
    },
    findOne(filter) {
      return {
        lean: async () => matches(record, filter) ? structuredClone(record) : null,
      }
    },
    findOneAndUpdate(filter, update) {
      const matched = matches(record, filter)
      if (matched) {
        if (update.$set) {
          for (const [key, val] of Object.entries(update.$set)) {
            setPath(record, key, val)
          }
        }
        if (update.$inc) {
          for (const [key, val] of Object.entries(update.$inc)) {
            setPath(record, key, (getPath(record, key) || 0) + val)
          }
        }
        if (update.$push) {
          for (const [key, val] of Object.entries(update.$push)) {
            const list = getPath(record, key) || []
            list.push(val)
            setPath(record, key, list)
          }
        }
      }
      return {
        lean: async () => matched ? structuredClone(record) : null,
      }
    },
  }
}

function createService(bookingModel, fetchMock) {
  return createWhatsAppNotificationService({
    bookingEnquiryModel: bookingModel,
    phoneNumberId: 'phone-id-123',
    accessToken: 'test-access-token',
    businessAccountId: 'biz-acc-123',
    apiVersion: 'v22.0',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    bookingTemplateLanguage: 'en',
    notificationsEnabled: true,
    fetchImpl: fetchMock,
  })
}

function baseBooking(overrides = {}) {
  return {
    _id: '67c1e5a20000000000000001',
    requestId: 'req-failure-test-001',
    name: 'Aarav Patel',
    mobile: '+919876543210',
    email: 'aarav@example.com',
    event: 'After Hours Sing Along',
    category: 'Sing Along',
    ticketQuantity: 3,
    ticketTypeName: 'VIP Pass',
    paymentAmount: 597,
    paymentStatus: 'failed',
    paymentFailureReason: 'failed',
    cfPaymentStatus: 'FAILED',
    cfPaymentId: 'cf-failed-001',
    paymentOrderId: 'order-fail-100',
    whatsappConsent: true,
    maleCount: 1,
    femaleCount: 1,
    maleMemberNames: ['Rohan'],
    maleMemberMobiles: ['+919876543211'],
    maleMemberConsents: [true],
    femaleMemberNames: ['Meera'],
    femaleMemberMobiles: ['+919876543212'],
    femaleMemberConsents: [false],
    whatsappNotification: {
      status: 'pending',
      attemptCount: 0,
      history: [],
    },
    ...overrides,
  }
}

test('7. WhatsApp failure notification uses the primary customer saved mobile number', async () => {
  const model = createMockBookingModel(baseBooking())
  const sentPayloads = []
  const service = createService(model, async (_url, options) => {
    const payload = JSON.parse(options.body)
    sentPayloads.push(payload)
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.fail-primary-1' }] }),
    }
  })

  const result = await service.send('req-failure-test-001', 'payment_failed')

  assert.equal(Boolean(result.sent), true)
  assert.equal(sentPayloads.length, 1)
  assert.equal(sentPayloads[0].to, '919876543210') // Normalized primary mobile
  assert.equal(sentPayloads[0].template.name, 'vibetogether_payment_failed')
  assert.equal(model.record.whatsappNotification.status, 'sent')
  assert.equal(model.record.whatsappNotification.providerMessageId, 'wamid.fail-primary-1')
})

test('8. Valid consent permits the failure notification', async () => {
  const model = createMockBookingModel(baseBooking({ whatsappConsent: true }))
  let sent = false
  const service = createService(model, async () => {
    sent = true
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.consent-ok' }] }) }
  })

  const result = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(sent, true)
  assert.equal(Boolean(result.sent), true)
  assert.equal(model.record.whatsappNotification.status, 'sent')
})

test('9. Missing consent prevents the notification', async () => {
  const model = createMockBookingModel(baseBooking({ whatsappConsent: false }))
  let sent = false
  const service = createService(model, async () => {
    sent = true
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.should-not-send' }] }) }
  })

  const result = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(sent, false)
  assert.equal(result.skipped, true)
  assert.equal(model.record.whatsappNotification.status, 'skipped')
  assert.match(model.record.whatsappNotification.history[0]?.note || '', /customer consent missing/i)
  // Payment status must remain failed
  assert.equal(model.record.paymentStatus, 'failed')
})

test('10. Invalid mobile prevents the notification safely without crashing', async () => {
  const model = createMockBookingModel(baseBooking({ mobile: '1234' }))
  let sent = false
  const service = createService(model, async () => {
    sent = true
    return { ok: true, status: 200, json: async () => ({}) }
  })

  const result = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(sent, false)
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'Invalid mobile number')
  assert.equal(model.record.whatsappNotification.status, 'skipped')
  assert.equal(model.record.whatsappNotification.recipient, '')
  assert.equal(model.record.paymentStatus, 'failed')
})

test('11. Attendees without individual consent or on failure are not notified', async () => {
  const model = createMockBookingModel(baseBooking({
    maleMemberConsents: [false],
    femaleMemberConsents: [false],
  }))
  const sentPayloads = []
  const service = createService(model, async (_url, options) => {
    const payload = JSON.parse(options.body)
    sentPayloads.push(payload)
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.fail-single' }] }) }
  })

  await service.notify('req-failure-test-001', 'payment_failed')

  // Only the primary contact gets the payment_failed message
  assert.equal(sentPayloads.length, 1)
  assert.equal(sentPayloads[0].to, '919876543210')
  assert.equal(model.record.attendeeNotifications?.length ?? 0, 0)
})

test('12. Duplicate Cashfree webhooks / calls do not send duplicate failure messages', async () => {
  const model = createMockBookingModel(baseBooking())
  let sendCount = 0
  const service = createService(model, async () => {
    sendCount++
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.msg-${sendCount}` }] }) }
  })

  // First call succeeds
  const res1 = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(Boolean(res1.sent), true)
  assert.equal(sendCount, 1)

  // Second call with same order/attempt is deduplicated via idempotencyKey
  const res2 = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(res2.duplicate, true)
  assert.equal(sendCount, 1) // No second HTTP call was dispatched
})

test('13. WhatsApp provider rejection does not change payment status', async () => {
  const model = createMockBookingModel(baseBooking())
  const service = createService(model, async () => {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Meta server error', code: 131000 } }),
    }
  })

  const res = await service.send('req-failure-test-001', 'payment_failed')
  assert.equal(res.failed, true)
  assert.equal(model.record.whatsappNotification.status, 'failed')
  // CRITICAL: Payment status remains failed
  assert.equal(model.record.paymentStatus, 'failed')
  assert.equal(model.record.cfPaymentStatus, 'FAILED')
})

test('14. Notification state persists in bookings-db canonical collection', async () => {
  const model = createMockBookingModel(baseBooking())
  assert.equal(model.collection.name, 'bookings-db')
  const service = createService(model, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.persisted-1' }] }),
  }))

  await service.send('req-failure-test-001', 'payment_failed')

  assert.equal(model.record.whatsappNotification.status, 'sent')
  assert.equal(model.record.whatsappNotification.providerMessageId, 'wamid.persisted-1')
  assert.equal(model.record.whatsappNotification.attemptCount, 1)
  assert.equal(model.record.whatsappNotification.history.length, 2)
  assert.equal(model.record.whatsappNotification.history[0].status, 'pending')
  assert.equal(model.record.whatsappNotification.history[1].status, 'sent')
})

test('15. Payment success and payment failure notifications never overlap incorrectly', async () => {
  // Scenario A: A paid booking is asked to send payment_failed -> must be rejected/skipped
  const paidModel = createMockBookingModel(baseBooking({
    paymentStatus: 'paid',
    reference: 'VT-PAID-001',
  }))
  let failureSent = false
  const failureService = createService(paidModel, async () => {
    failureSent = true
    return { ok: true, status: 200, json: async () => ({}) }
  })
  const failAttempt = await failureService.send('req-failure-test-001', 'payment_failed')
  assert.equal(failureSent, false)
  assert.equal(failAttempt.alreadyPaid, true)

  // Scenario B: An unpaid/failed booking is asked to send booking_confirmation -> must be rejected/skipped
  const failedModel = createMockBookingModel(baseBooking({
    paymentStatus: 'failed',
    reference: '',
  }))
  let successSent = false
  const successService = createService(failedModel, async () => {
    successSent = true
    return { ok: true, status: 200, json: async () => ({}) }
  })
  const successAttempt = await successService.send('req-failure-test-001', 'booking_confirmation')
  assert.equal(successSent, false)
  assert.equal(successAttempt.skipped, true)
})
