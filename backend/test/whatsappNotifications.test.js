import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createWhatsAppNotificationService,
  isValidWhatsAppWebhookSignature,
  logWhatsAppNotification,
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

function createBookingModel(booking) {
  const record = structuredClone(booking)
  return {
    find(filter) {
      return {
        select() { return this },
        limit() { return this },
        lean: async () => matches(record, filter) ? [structuredClone(record)] : [],
      }
    },
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
      return {
        lean: async () => structuredClone(record),
        catch: (handler) => Promise.resolve(structuredClone(record)).catch(handler),
      }
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
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    fetchImpl,
    now: () => new Date('2026-11-09T10:00:00.000Z'),
  })
}

test('payment notifications require the approved templates and English language code', () => {
  const options = {
    apiVersion: 'v22.0',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
  }

  assert.throws(
    () => createWhatsAppNotificationService({ ...options, bookingTemplateLanguage: 'en_US' }),
    /approved en language/,
  )
  assert.throws(
    () => createWhatsAppNotificationService({
      ...options,
      successTemplateName: 'unapproved_template',
    }),
    /approved VibeTogether template names/,
  )
})

async function captureWhatsAppLogs(run) {
  const entries = []
  const originalInfo = console.info
  const originalError = console.error
  console.info = (message, details) => entries.push({ message, details })
  console.error = (message, details) => entries.push({ message, details })
  try {
    return { result: await run(entries), entries }
  } finally {
    console.info = originalInfo
    console.error = originalError
  }
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
  assert.equal(requests[0].payload.template.name, 'vibetogether_payment_success')
  assert.equal(requests[0].payload.template.language.code, 'en')
  assert.equal(requests[0].payload.template.components[0].parameters[0].text, 'Jordan Example')
  assert.equal(requests[0].payload.template.components[0].parameters.length, 5)
  assert.equal(requests[0].payload.template.components[0].parameters[4].text, 'General Admission')
  assert.equal(model.record.whatsappNotification.recipient, '+919876543210')
  assert.equal(model.record.whatsappNotification.status, 'sent')
  assert.equal(model.record.whatsappNotification.sentAt.toISOString(), '2026-11-09T10:00:00.000Z')
  assert.equal(model.record.whatsappNotification.providerMessageId, 'wamid.confirm-1')
  assert.equal(sent.sent, true)
  assert.equal(duplicate.duplicate, true)
})

test('sends confirmation templates to attendee members who provided an optional mobile number', async () => {
  const model = createBookingModel(booking({
    ticketQuantity: 2,
    maleCount: 1,
    femaleCount: 1,
    maleMemberNames: ['Jordan Example'],
    maleMemberMobiles: ['+919876543210'],
    maleMemberConsents: [true],
    femaleMemberNames: ['Taylor Friend'],
    femaleMemberMobiles: ['+919876543299'],
    femaleMemberConsents: [true],
  }))
  const requests = []
  const service = createService(model, async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.msg-${requests.length}` }] }) }
  })

  await service.notify('session-1', 'booking_confirmation')

  assert.equal(requests.length, 2)
  assert.equal(requests[0].payload.to, '919876543210')
  assert.equal(requests[1].payload.to, '919876543299')
  assert.equal(requests[1].payload.template.components[0].parameters[0].text, 'Taylor Friend')
  assert.equal(requests[1].payload.template.components[0].parameters[1].text, '10812026501')
  assert.equal(model.record.attendeeNotifications?.length, 1)
  assert.equal(model.record.attendeeNotifications[0].name, 'Taylor Friend')
  assert.equal(model.record.attendeeNotifications[0].recipient, '+919876543299')
  assert.equal(model.record.attendeeNotifications[0].status, 'sent')
})

test('does not send to attendees whose WhatsApp consent is missing', async () => {
  const model = createBookingModel(booking({
    ticketQuantity: 2,
    maleCount: 1,
    femaleCount: 0,
    maleMemberNames: ['Taylor Friend'],
    maleMemberMobiles: ['+919876543299'],
  }))
  const requests = []
  const service = createService(model, async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.primary-only' }] }) }
  })

  await service.notify('session-1', 'booking_confirmation')

  assert.equal(requests.length, 1)
  assert.equal(requests[0].payload.to, '919876543210')
  assert.equal(model.record.attendeeNotifications?.length ?? 0, 0)
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
  assert.equal(payload.template.name, 'vibetogether_payment_failed')
  assert.equal(payload.to, '919876543210')
  assert.equal(parameters[0].text, 'Jordan Example')
  assert.equal(parameters.length, 4)
  assert.equal(parameters[2].text, '249')
  assert.equal(parameters[3].text, 'https://www.vibetogether.show/booking/payment/session-1')
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

test('logs DELIVERED only after a delivery status webhook confirms it', async () => {
  const model = createBookingModel(booking())
  const service = createService(model, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.delivery-log' }] }),
  }))

  const { entries } = await captureWhatsAppLogs(async (entries) => {
    await service.notify('session-1', 'booking_confirmation')
    assert.equal(entries.some(({ details }) => details?.outcome === 'DELIVERED'), false)
    await service.recordWebhookStatus({
      messageId: 'wamid.delivery-log',
      status: 'delivered',
      timestamp: '1794228000',
    })
    await service.recordWebhookStatus({
      messageId: 'wamid.delivery-log',
      status: 'delivered',
      timestamp: '1794228000',
    })
    await service.recordWebhookStatus({
      messageId: 'wamid.delivery-log',
      status: 'read',
      timestamp: '1794228001',
    })
  })

  assert.equal(entries.filter(({ details }) => details?.outcome === 'DELIVERED').length, 1)
  assert.equal(entries.filter(({ details }) => details?.outcome === 'READ').length, 1)
  const deliveredLog = entries.find(({ details }) => details?.outcome === 'DELIVERED')?.details
  assert.equal(deliveredLog.messageId, 'wamid.delivery-log')
  assert.equal(deliveredLog.deliveryTimestamp, '2026-11-09T12:40:00.000Z')
})

test('logs failed delivery callbacks without exposing provider-supplied phone numbers', async () => {
  const model = createBookingModel(booking())
  const service = createService(model, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.delivery-failed' }] }),
  }))

  const { entries } = await captureWhatsAppLogs(async () => {
    await service.notify('session-1', 'booking_confirmation')
    await service.recordWebhookStatus({
      messageId: 'wamid.delivery-failed',
      status: 'failed',
      timestamp: '1794228002',
      error: '131026',
      errorMessage: 'Delivery failed for +919876543210',
    })
  })

  const failedLog = entries.find(({ details }) => details?.outcome === 'DELIVERY_FAILED')?.details
  assert.equal(failedLog.messageId, 'wamid.delivery-failed')
  assert.equal(failedLog.deliveryStatus, 'failed')
  assert.equal(failedLog.deliveryTimestamp, '2026-11-09T12:40:02.000Z')
  assert.equal(JSON.stringify(failedLog).includes('+919876543210'), false)
})

test('logs each primary notification skip reason without calling Meta', async () => {
  const cases = [
    { reason: 'Customer consent missing', booking: booking({ paymentStatus: 'failed', whatsappConsent: false }) },
    { reason: 'Customer opted out', booking: booking({ paymentStatus: 'failed', whatsappConsent: false, whatsappOptedOutAt: new Date() }) },
    { reason: 'Invalid mobile number', booking: booking({ paymentStatus: 'failed', mobile: 'not-a-phone' }) },
    { reason: 'Payment still pending', booking: booking({ paymentStatus: 'pending', reference: '' }) },
    { reason: 'Payment already completed', booking: booking({ paymentStatus: 'paid', reference: 'VT-PAID' }) },
    { reason: 'Demo payment; no real payment was processed.', booking: booking({ paymentStatus: 'demo_paid' }), type: 'booking_confirmation' },
    {
      reason: 'Duplicate notification',
      booking: booking({
        paymentStatus: 'failed',
        paymentOrderId: 'order-1',
        whatsappNotification: { status: 'sent', idempotencyKey: 'session-1:payment_assistance:order-1' },
      }),
    },
    {
      reason: 'Notification already in progress',
      booking: booking({
        paymentStatus: 'failed',
        paymentOrderId: 'order-1',
        whatsappNotification: { status: 'pending', inProgress: true, idempotencyKey: 'session-1:payment_assistance:order-1' },
      }),
    },
  ]
  const { entries } = await captureWhatsAppLogs(async () => {
    for (const testCase of cases) {
      const model = createBookingModel(testCase.booking)
      const service = createService(model, async () => {
        throw new Error('Meta must not be called for a skipped notification.')
      })
      await service.notify('session-1', testCase.type ?? 'payment_assistance')
    }
    const unavailableModel = createBookingModel(booking({ paymentStatus: 'failed' }))
    const unavailableService = createWhatsAppNotificationService({ bookingEnquiryModel: unavailableModel })
    await unavailableService.notify('session-1', 'payment_assistance')
  })

  const reasons = entries.map(({ details }) => details?.reason).filter(Boolean)
  for (const testCase of cases) assert.ok(reasons.includes(testCase.reason), testCase.reason)
  assert.ok(reasons.includes('WhatsApp configuration missing'))
  assert.equal(entries.some(({ details }) => details?.outcome === 'ATTEMPTED'), false)
})

test('logs ATTEMPTED immediately before Meta fetch and ACCEPTED with message ID', async () => {
  const model = createBookingModel(booking())
  const sequence = []
  const entries = []
  const originalInfo = console.info
  console.info = (message, details) => {
    if (message === '[WhatsApp Notification]' && details.notificationType === 'booking_confirmation') {
      sequence.push(details.outcome)
      entries.push(details)
    }
  }
  const service = createService(model, async () => {
    sequence.push('META_FETCH')
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.attempt-order' }] }) }
  })
  try {
    await service.notify('session-1', 'booking_confirmation')
  } finally {
    console.info = originalInfo
  }
  assert.deepEqual(sequence, ['ATTEMPTED', 'META_FETCH', 'ACCEPTED'])
  assert.equal(entries[0].template, 'vibetogether_payment_success')
  assert.equal(entries[0].language, 'en')
  assert.match(entries[0].correlationId, /^[a-f0-9]{16}$/)
  assert.equal(entries[1].messageId, 'wamid.attempt-order')
})

test('text admin alerts record a non-applicable template language without logging message contents', async () => {
  const model = createBookingModel(booking())
  const { entries } = await captureWhatsAppLogs(async () => {
    const service = createWhatsAppNotificationService({
      bookingEnquiryModel: model,
      phoneNumberId: 'meta-phone-id',
      accessToken: 'test-token',
      apiVersion: 'v22.0',
      successTemplateName: 'vibetogether_payment_success',
      failureTemplateName: 'vibetogether_payment_failed',
      adminPhoneNumber: '+919876543211',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.admin-text' }] }),
      }),
    })
    await service.resendNotification('session-1', { target: 'admin' })
  })

  const attempted = entries.find(({ details }) => details?.outcome === 'ATTEMPTED')?.details
  assert.equal(attempted.template, 'text')
  assert.equal(attempted.language, 'not_applicable')
  assert.equal(attempted.source, 'admin_manual_retry')
  assert.equal('recipient' in attempted, false)
  assert.equal(JSON.stringify(entries).includes('Jordan Example'), false)
  assert.equal(JSON.stringify(entries).includes('+919876543211'), false)
})

test('logs allowlisted Meta rejection metadata without provider or customer details', async () => {
  const sensitiveValues = [
    'Fake Customer Name 739',
    '+919876543219',
    'fake.customer.739@example.test',
    'Fake Event Name 739',
    'FAKE-BOOKING-REF-739',
    'fake-access-token-739',
    'fake-payment-session-739',
  ]
  const providerDetails = sensitiveValues.join('; ')
  const model = createBookingModel(booking({
    paymentStatus: 'failed',
    reference: '',
    name: sensitiveValues[0],
    mobile: sensitiveValues[1],
    email: sensitiveValues[2],
    event: sensitiveValues[3],
    paymentSessionId: sensitiveValues[6],
  }))
  const service = createService(model, async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        code: 132001,
        error_subcode: 2494011,
        message: `Template mismatch: ${providerDetails}`,
        error_data: { details: `Template rejected: ${providerDetails}` },
      },
    }),
  }))

  const { entries } = await captureWhatsAppLogs(() => service.notify('session-1', 'payment_assistance'))
  const rejection = entries.find(({ details }) => details?.outcome === 'REJECTED')?.details
  assert.equal(rejection.httpStatus, 400)
  assert.equal(rejection.metaErrorCode, 132001)
  assert.equal(rejection.metaErrorSubcode, 2494011)
  assert.equal(rejection.retryable, false)
  assert.equal(rejection.reason, 'Meta rejected notification')
  assert.equal('errorDetails' in rejection, false)
  assert.equal('recipient' in rejection, false)
  const serializedLogs = JSON.stringify(entries)
  for (const value of sensitiveValues) {
    assert.equal(serializedLogs.includes(value), false, `log leaked ${value}`)
  }
})

test('automatic retry logs a transient failure and later acceptance', async () => {
  const model = createBookingModel(booking({
    paymentStatus: 'failed',
    paymentFailureReason: 'failed',
    paymentOrderId: 'retry-order',
    reference: '',
  }))
  let currentTime = new Date('2026-11-18T13:00:00.000Z')
  let fetchCount = 0
  const service = createWhatsAppNotificationService({
    bookingEnquiryModel: model,
    phoneNumberId: 'meta-phone-id',
    accessToken: 'test-token',
    apiVersion: 'v22.0',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    fetchImpl: async () => {
      fetchCount += 1
      return fetchCount === 1
        ? { ok: false, status: 503, json: async () => ({ error: { code: 1, message: 'temporary' } }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.retry-success' }] }) }
    },
    now: () => currentTime,
  })
  const { entries } = await captureWhatsAppLogs(async () => {
    const first = await service.notify('session-1', 'payment_assistance')
    assert.equal(first.failed, true)
    currentTime = new Date(currentTime.getTime() + 2 * 60_000)
    assert.equal(await service.processRetries(), 1)
  })

  assert.equal(fetchCount, 2)
  assert.ok(entries.some(({ details }) => details?.outcome === 'REJECTED' && details.retryable === true))
  assert.ok(entries.some(({ details }) => details?.source === 'automatic_retry' && details.outcome === 'ACCEPTED'))
  assert.equal(model.record.whatsappNotification.status, 'sent')
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

test('WhatsApp diagnostics verify configuration without returning credentials', async () => {
  const service = createWhatsAppNotificationService({
    phoneNumberId: 'meta-phone-id',
    accessToken: 'never-return-this-token',
    apiVersion: 'v22.0',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    webhookVerifyToken: 'never-return-this-verify-token',
    appSecret: 'never-return-this-app-secret',
    fetchImpl: async (url, options) => {
      assert.match(url, /meta-phone-id\?fields=/)
      assert.equal(options.headers.Authorization, 'Bearer never-return-this-token')
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'meta-phone-id' }),
      }
    },
  })

  const result = await service.getDiagnostics()
  assert.equal(result.notificationConfigured, true)
  assert.deepEqual(result.missingNotificationConfiguration, [])
  assert.equal(result.webhookConfigured, true)
  assert.deepEqual(result.missingWebhookConfiguration, [])
  assert.equal(result.apiAccess, 'accepted')
  assert.equal(JSON.stringify(result).includes('never-return-this'), false)
})

test('WhatsApp diagnostics list missing environment variable names only', async () => {
  const service = createWhatsAppNotificationService({
    fetchImpl: async () => {
      throw new Error('Must not query Meta when required configuration is missing.')
    },
  })

  const result = await service.getDiagnostics()
  assert.equal(result.notificationConfigured, false)
  assert.deepEqual(result.missingNotificationConfiguration, [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_API_VERSION',
    'WHATSAPP_SUCCESS_TEMPLATE_NAME',
    'WHATSAPP_FAILURE_TEMPLATE_NAME',
  ])
  assert.deepEqual(result.missingWebhookConfiguration, [
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
  ])
  assert.equal(result.apiAccess, 'not_checked')
})

test('admin retries do not resend when the previous provider response was uncertain', async () => {
  const model = createBookingModel(booking({
    whatsappNotification: {
      status: 'failed',
      idempotencyKey: 'session-1:booking_confirmation:10812026501',
      failureReason: 'WhatsApp provider response was uncertain; automatic retry was withheld to prevent duplicate messages.',
      retryable: false,
      inProgress: false,
      history: [],
    },
  }))
  let calls = 0
  const service = createService(model, async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.duplicate' }] }) }
  })

  const result = await service.notify('session-1', 'booking_confirmation', {
    force: true,
    retry: true,
  })

  assert.equal(result.uncertain, true)
  assert.equal(calls, 0)
})

test('structured WhatsApp diagnostics omit raw details and reject unrecognized free text', () => {
  const records = []
  const originalError = console.error
  console.error = (message, details) => records.push({ message, details })
  try {
    logWhatsAppNotification('REJECTED', {
      source: 'cashfree_verification',
      notificationType: 'payment_assistance',
      identity: 'payment-session-secret-123',
      recipient: '+919876543210',
      template: 'vibetogether_payment_failed',
      language: 'en',
      httpStatus: 400,
      metaErrorCode: 132001,
      reason: 'Untrusted Customer Name should never be logged',
      errorDetails: 'Untrusted Name; +919876543210; customer@example.test; token secret-token; payment-session-secret-123',
      sensitiveValues: ['secret-token'],
    })
  } finally {
    console.error = originalError
  }

  const serialized = JSON.stringify(records)
  assert.equal(records.length, 1)
  assert.match(records[0].details.correlationId, /^[a-f0-9]{16}$/)
  assert.equal('recipient' in records[0].details, false)
  assert.equal(records[0].details.reason, 'Notification outcome recorded')
  assert.equal('errorDetails' in records[0].details, false)
  assert.equal(serialized.includes('secret-token'), false)
  assert.equal(serialized.includes('payment-session-secret-123'), false)
  assert.equal(serialized.includes('+919876543210'), false)
  assert.equal(serialized.includes('Untrusted Name'), false)
  assert.equal(serialized.includes('customer@example.test'), false)
  assert.equal(records[0].details.metaErrorCode, 132001)
})
