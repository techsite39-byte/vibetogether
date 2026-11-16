import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWhatsAppNotificationService } from '../src/services/whatsappNotifications.js'
import { templateBodyParameters, buildWhatsAppMessage } from '../src/services/whatsappService.js'

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

function createBookingModel(initialBooking) {
  const record = structuredClone(initialBooking)
  return {
    findOne(filter) {
      return { lean: async () => matches(record, filter) ? structuredClone(record) : null }
    },
    findByIdAndUpdate(_id, update) {
      return this.findOneAndUpdate({ _id }, update)
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
      if (update.$pull) {
        for (const [path, condition] of Object.entries(update.$pull)) {
          const list = getPath(record, path) ?? []
          const filtered = list.filter((item) => {
            return !Object.entries(condition).every(([k, v]) => item[k] === v)
          })
          setPath(record, path, filtered)
        }
      }
      return { lean: async () => structuredClone(record) }
    },
    get record() {
      return structuredClone(record)
    },
  }
}

function makeBooking(overrides = {}) {
  return {
    _id: 'booking-id-123',
    requestId: 'req-session-456',
    name: 'Sanjay Kumar',
    mobile: '+919025335720',
    email: 'sanjay@example.com',
    category: 'Sing Along',
    gender: 'Male',
    createdAt: new Date('2026-11-16T10:00:00.000Z'),
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentProvider: 'cashfree',
    paymentAmount: 897,
    amount: 897,
    ticketQuantity: 3,
    ticketType: 'general-admission',
    ticketTypeName: 'General Admission',
    reference: 'VT-2026-9025',
    whatsappConsent: true,
    whatsappNotification: { status: 'pending', history: [] },
    attendeeNotifications: [],
    maleCount: 2,
    femaleCount: 1,
    maleMemberNames: ['Sanjay Kumar', 'Ravi Prakash'],
    maleMemberMobiles: ['+919025335720', '+919876543211'],
    femaleMemberNames: ['Priya Sharma'],
    femaleMemberMobiles: ['+919876543222'],
    ...overrides,
  }
}

function createTestWhatsAppService(model, fetchImpl) {
  return createWhatsAppNotificationService({
    bookingEnquiryModel: model,
    phoneNumberId: '1604867012700775',
    accessToken: 'test-access-token',
    businessAccountId: '2401641057342853',
    apiVersion: 'v22.0',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    adminPhoneNumber: '',
    fetchImpl,
  })
}

// ---------------------------------------------------------------------------
// 1. Template Parameter Mapping Verification
// ---------------------------------------------------------------------------
test('templateBodyParameters maps vibetogether_payment_success correctly (5 parameters)', () => {
  const b = makeBooking()
  const params = templateBodyParameters(b, 'success', 'vibetogether_payment_success')
  assert.equal(params.length, 5)
  assert.equal(params[0], 'Sanjay Kumar')   // {{1}} Name
  assert.equal(params[1], 'VT-2026-9025')   // {{2}} Booking ID
  assert.equal(params[2], '3')              // {{3}} Number of Tickets
  assert.equal(params[3], '897')            // {{4}} Amount Paid (without ₹)
  assert.equal(params[4], 'General Admission') // {{5}} Your ticket
})

test('templateBodyParameters maps vibetogether_payment_failed correctly (4 parameters)', () => {
  const b = makeBooking({
    paymentStatus: 'failed',
    paymentFailureReason: 'bank_timeout',
    reference: 'VT-2026-9025',
  })
  const params = templateBodyParameters(b, 'failure', 'vibetogether_payment_failed')
  assert.equal(params.length, 4)
  assert.equal(params[0], 'Sanjay Kumar')   // {{1}} Name
  assert.equal(params[1], 'VT-2026-9025')   // {{2}} Booking ID
  assert.equal(params[2], '897')            // {{3}} Payment Amount (without ₹)
  assert.equal(params[3], 'https://www.vibetogether.show/booking/payment/req-session-456') // {{4}} Retry URL
})

test('buildWhatsAppMessage produces exact copy for vibetogether_payment_success and vibetogether_payment_failed', () => {
  const b = makeBooking()
  const successMsg = buildWhatsAppMessage(b, 'success', null, 'vibetogether_payment_success')
  assert.match(successMsg, /🎶 VIBE TOGETHER – MADURAI MUSICAL EVENING 🎶/)
  assert.match(successMsg, /Hello Sanjay Kumar,/)
  assert.match(successMsg, /Booking ID: VT-2026-9025/)
  assert.match(successMsg, /Number of Tickets: 3/)
  assert.match(successMsg, /Amount Paid: ₹897/)
  assert.match(successMsg, /Your ticket: General Admission/)
  assert.match(successMsg, /\+91 87785 95810/)

  const failedBooking = makeBooking({ paymentStatus: 'failed' })
  const failMsg = buildWhatsAppMessage(failedBooking, 'failure', null, 'vibetogether_payment_failed')
  assert.match(failMsg, /🎶 VIBE TOGETHER – MADURAI MUSICAL EVENING 🎶/)
  assert.match(failMsg, /Hello Sanjay Kumar,/)
  assert.match(failMsg, /unfortunately, your payment for the event booking was unsuccessful/i)
  assert.match(failMsg, /Booking ID: VT-2026-9025/)
  assert.match(failMsg, /Payment Amount: ₹897/)
  assert.match(failMsg, /Retry Payment: https:\/\/www\.vibetogether\.show\/booking\/payment\/req-session-456/)
  assert.match(failMsg, /\+91 87785 95810/)
})

// ---------------------------------------------------------------------------
// 2. Scenario 1: Successful Cashfree payment — main user receives success message
// ---------------------------------------------------------------------------
test('Scenario 1: Successful Cashfree payment — main user receives success message', async () => {
  const model = createBookingModel(makeBooking({
    paymentProvider: 'cashfree',
    maleCount: 1,
    femaleCount: 0,
    maleMemberMobiles: ['+919025335720'],
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.cf-success-1' }] }) }
  })

  const result = await service.send('req-session-456', 'booking_confirmation')

  assert.equal(sentRequests.length, 1)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[0].payload.template.name, 'vibetogether_payment_success')
  assert.equal(sentRequests[0].payload.template.components[0].parameters[0].text, 'Sanjay Kumar')
  assert.equal(sentRequests[0].payload.template.components[0].parameters[1].text, 'VT-2026-9025')
  assert.equal(model.record.whatsappNotification.status, 'sent')
  assert.equal(result.sent, true)
})

// ---------------------------------------------------------------------------
// 3. Scenario 2: Successful Razorpay payment — main user receives success message
// ---------------------------------------------------------------------------
test('Scenario 2: Successful Razorpay payment — main user receives success message', async () => {
  const model = createBookingModel(makeBooking({
    paymentProvider: 'razorpay',
    maleCount: 1,
    femaleCount: 0,
    maleMemberMobiles: ['+919025335720'],
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.rzp-success-1' }] }) }
  })

  const result = await service.send('req-session-456', 'booking_confirmation')

  assert.equal(sentRequests.length, 1)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[0].payload.template.name, 'vibetogether_payment_success')
  assert.equal(result.sent, true)
})

// ---------------------------------------------------------------------------
// 4. Scenario 3: Successful payment with two extra members with mobile numbers — all three receive success
// ---------------------------------------------------------------------------
test('Scenario 3: Successful payment with two extra members with mobile numbers — all three receive success messages', async () => {
  const model = createBookingModel(makeBooking({
    ticketQuantity: 3,
    maleCount: 2,
    femaleCount: 1,
    maleMemberNames: ['Sanjay Kumar', 'Ravi Prakash'],
    maleMemberMobiles: ['+919025335720', '+919876543211'],
    femaleMemberNames: ['Priya Sharma'],
    femaleMemberMobiles: ['+919876543222'],
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.msg-${sentRequests.length}` }] }) }
  })

  await service.send('req-session-456', 'booking_confirmation')

  // Total 3 messages: 1 to primary Sanjay, 1 to extra Ravi, 1 to extra Priya
  assert.equal(sentRequests.length, 3)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[0].payload.template.components[0].parameters[0].text, 'Sanjay Kumar')

  assert.equal(sentRequests[1].payload.to, '919876543211')
  assert.equal(sentRequests[1].payload.template.components[0].parameters[0].text, 'Ravi Prakash')

  assert.equal(sentRequests[2].payload.to, '919876543222')
  assert.equal(sentRequests[2].payload.template.components[0].parameters[0].text, 'Priya Sharma')

  assert.equal(model.record.attendeeNotifications.length, 2)
})

// ---------------------------------------------------------------------------
// 5. Scenario 4: Successful payment with extra members without mobile numbers — those members are skipped
// ---------------------------------------------------------------------------
test('Scenario 4: Successful payment with extra members without mobile numbers — those members are skipped', async () => {
  const model = createBookingModel(makeBooking({
    ticketQuantity: 3,
    maleCount: 2,
    femaleCount: 1,
    maleMemberNames: ['Sanjay Kumar', 'Ravi Prakash'],
    maleMemberMobiles: ['+919025335720', ''], // Ravi has no mobile
    femaleMemberNames: ['Priya Sharma'],
    femaleMemberMobiles: ['+919876543222'], // Priya has mobile
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.msg-${sentRequests.length}` }] }) }
  })

  await service.send('req-session-456', 'booking_confirmation')

  // Only 2 messages: Primary Sanjay and Priya (Ravi was skipped because no mobile was provided)
  assert.equal(sentRequests.length, 2)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[1].payload.to, '919876543222')
})

// ---------------------------------------------------------------------------
// 6. Scenario 5: Failed Cashfree payment — main user receives failure message only
// ---------------------------------------------------------------------------
test('Scenario 5: Failed Cashfree payment — main user receives failure message only', async () => {
  const model = createBookingModel(makeBooking({
    paymentStatus: 'failed',
    paymentFailureReason: 'payment_declined',
    reference: '',
    maleMemberMobiles: ['+919025335720', '+919876543211'],
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.fail-cf' }] }) }
  })

  const result = await service.send('req-session-456', 'payment_assistance')

  assert.equal(sentRequests.length, 1)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[0].payload.template.name, 'vibetogether_payment_failed')
  assert.equal(result.sent, true)
})

// ---------------------------------------------------------------------------
// 7. Scenario 6: Failed Razorpay payment — main user receives failure message only
// ---------------------------------------------------------------------------
test('Scenario 6: Failed Razorpay payment — main user receives failure message only', async () => {
  const model = createBookingModel(makeBooking({
    paymentStatus: 'failed',
    paymentProvider: 'razorpay',
    paymentFailureReason: 'payment_failed',
    reference: '',
  }))
  const sentRequests = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    sentRequests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.fail-rzp' }] }) }
  })

  const result = await service.send('req-session-456', 'payment_assistance')

  assert.equal(sentRequests.length, 1)
  assert.equal(sentRequests[0].payload.to, '919025335720')
  assert.equal(sentRequests[0].payload.template.name, 'vibetogether_payment_failed')
  assert.equal(result.sent, true)
})

// ---------------------------------------------------------------------------
// 8. Scenario 7: Failed payment with extra ticket members — no extra member receives any message
// ---------------------------------------------------------------------------
test('Scenario 7: Failed payment with extra ticket members — no extra member receives any message', async () => {
  const model = createBookingModel(makeBooking({
    paymentStatus: 'failed',
    paymentFailureReason: 'insufficient_funds',
    ticketQuantity: 3,
    maleMemberMobiles: ['+919025335720', '+919876543211'],
    femaleMemberMobiles: ['+919876543222'],
  }))
  const sentRecipients = []
  const service = createTestWhatsAppService(model, async (url, options) => {
    const payload = JSON.parse(options.body)
    sentRecipients.push(payload.to)
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.fail-7' }] }) }
  })

  await service.send('req-session-456', 'payment_assistance')

  // Only the main user received the failure notification
  assert.equal(sentRecipients.length, 1)
  assert.deepEqual(sentRecipients, ['919025335720'])
})

// ---------------------------------------------------------------------------
// 9. Scenario 8: Pending payment — no success/failure message
// ---------------------------------------------------------------------------
test('Scenario 8: Pending payment — no success or failure message', async () => {
  const model = createBookingModel(makeBooking({
    paymentStatus: 'pending',
    reference: '',
  }))
  let apiCalled = false
  const service = createTestWhatsAppService(model, async () => {
    apiCalled = true
    return { ok: true, status: 200, json: async () => ({ messages: [] }) }
  })

  const successResult = await service.send('req-session-456', 'booking_confirmation')
  assert.equal(apiCalled, false)
  assert.equal(successResult.pending, true)

  const failureResult = await service.send('req-session-456', 'payment_assistance')
  assert.equal(apiCalled, false)
  assert.equal(failureResult.pending, true)
})

// ---------------------------------------------------------------------------
// 10. Scenario 9: Duplicate payment webhook — no duplicate WhatsApp messages
// ---------------------------------------------------------------------------
test('Scenario 9: Duplicate payment webhook — no duplicate WhatsApp messages sent', async () => {
  const model = createBookingModel(makeBooking({
    maleCount: 1,
    femaleCount: 0,
    maleMemberMobiles: ['+919025335720'],
  }))
  let callCount = 0
  const service = createTestWhatsAppService(model, async () => {
    callCount += 1
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.first-call' }] }) }
  })

  // First webhook processing: sends message
  const first = await service.send('req-session-456', 'booking_confirmation')
  assert.equal(first.sent, true)
  assert.equal(callCount, 1)

  // Second duplicate webhook processing: skipped idempotently
  const second = await service.send('req-session-456', 'booking_confirmation')
  assert.equal(second.duplicate, true)
  assert.equal(callCount, 1) // Call count did not increase
})

// ---------------------------------------------------------------------------
// 11. Scenario 10: WhatsApp API failure — booking and payment remain unaffected
// ---------------------------------------------------------------------------
test('Scenario 10: WhatsApp API failure — booking and payment remain unaffected', async () => {
  const model = createBookingModel(makeBooking({
    paymentStatus: 'paid',
    reference: 'VT-2026-9025',
  }))
  const service = createTestWhatsAppService(model, async () => {
    // Simulate Meta API network outage or 500 error
    throw new Error('Meta Graph API 500 Internal Server Error')
  })

  const result = await service.send('req-session-456', 'booking_confirmation')

  // WhatsApp send returned failed, but booking status remains confirmed and paid!
  assert.equal(result.failed, true)
  assert.equal(model.record.paymentStatus, 'paid')
  assert.equal(model.record.status, 'confirmed')
  assert.equal(model.record.reference, 'VT-2026-9025')
  assert.equal(model.record.whatsappNotification.status, 'failed')
})

// ---------------------------------------------------------------------------
// 12. Scenario 11: Duplicate recipient number in same booking — no duplicate notification
// ---------------------------------------------------------------------------
test('Scenario 11: Duplicate recipient number in same booking — no duplicate notification', async () => {
  const model = createBookingModel(makeBooking({
    ticketQuantity: 3,
    maleCount: 2,
    femaleCount: 1,
    mobile: '+919025335720', // Main user phone
    maleMemberNames: ['Sanjay Kumar', 'Sanjay Duplicate Number'],
    maleMemberMobiles: ['+919025335720', '+919025335720'], // Same phone entered for attendee 2
    femaleMemberNames: ['Priya Sharma'],
    femaleMemberMobiles: ['+919876543222'],
  }))
  const sentNumbers = []
  const service = createTestWhatsAppService(model, async (_url, options) => {
    const payload = JSON.parse(options.body)
    sentNumbers.push(payload.to)
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.msg-${sentNumbers.length}` }] }) }
  })

  await service.send('req-session-456', 'booking_confirmation')

  // Only 2 sends: 919025335720 was sent ONCE, and Priya 919876543222 was sent ONCE.
  // The duplicate 919025335720 was suppressed!
  assert.equal(sentNumbers.length, 2)
  assert.deepEqual(sentNumbers, ['919025335720', '919876543222'])
})
