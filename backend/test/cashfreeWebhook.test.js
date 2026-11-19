import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { createCashfreePaymentService } from '../src/services/cashfreePayments.js'

const servers = []
const webhookSecret = 'cashfree-webhook-test-secret'

async function startServer(options) {
  const server = createApp({
    corsOrigins: [],
    ...options,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

function signedHeaders(body, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    'Content-Type': 'application/json',
    'x-webhook-signature': createHmac('sha256', webhookSecret)
      .update(timestamp + body)
      .digest('base64'),
    'x-webhook-timestamp': timestamp,
  }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  ))
})

test('registers the Cashfree webhook before CORS and parses the signed raw body', async () => {
  const received = []
  const baseUrl = await startServer({
    cashfreeSecretKey: webhookSecret,
    cashfreePayments: {
      async handleWebhook(payload, signature, timestamp, rawBody) {
        received.push({ payload, signature, timestamp, rawBody })
        return { received: true, ignored: true, eventType: payload.type }
      },
    },
  })
  const body = JSON.stringify({ type: 'TEST_WEBHOOK', data: {} })
  const headers = signedHeaders(body)
  headers.Origin = 'https://untrusted.example'

  const response = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
    method: 'POST',
    headers,
    body,
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true, outcome: 'notification_skipped' })
  assert.equal(received.length, 1)
  assert.deepEqual(received[0].payload, { type: 'TEST_WEBHOOK', data: {} })
  assert.deepEqual(received[0].rawBody, Buffer.from(body))
})

test('rejects invalid signatures and malformed JSON without processing the event', async () => {
  let processed = 0
  const baseUrl = await startServer({
    cashfreeSecretKey: webhookSecret,
    cashfreePayments: {
      async handleWebhook() {
        processed += 1
        return { received: true }
      },
    },
  })
  const body = '{"type":'
  const headers = signedHeaders(body)

  const invalidSignature = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
    method: 'POST',
    headers: { ...headers, 'x-webhook-signature': 'invalid' },
    body,
  })
  assert.equal(invalidSignature.status, 401)

  const malformedJson = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
    method: 'POST',
    headers,
    body,
  })
  assert.equal(malformedJson.status, 400)
  assert.deepEqual(await malformedJson.json(), {
    message: 'Cashfree webhook body contains malformed JSON.',
  })
  assert.equal(processed, 0)
})

test('accepts webhooks with application/*+json content-type on both primary and alternate routes', async () => {
  const received = []
  const baseUrl = await startServer({
    cashfreeSecretKey: webhookSecret,
    cashfreePayments: {
      async handleWebhook(payload, signature, timestamp, rawBody) {
        received.push({ payload, signature, timestamp, rawBody })
        return { received: true, ignored: true, eventType: payload.type }
      },
    },
  })

  // Test alternate route /api/cashfree/webhook with application/payment+json
  const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'cf_order_test' } } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', webhookSecret).update(timestamp + body).digest('base64')

  const response = await fetch(`${baseUrl}/api/cashfree/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/payment+json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': timestamp,
    },
    body,
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true, outcome: 'notification_skipped' })
  assert.equal(received.length, 1)
  assert.equal(received[0].payload.type, 'PAYMENT_SUCCESS_WEBHOOK')
  assert.deepEqual(received[0].rawBody, Buffer.from(body))
})

test('logs Cashfree failure notification results and suppresses duplicate webhook sends', async () => {
  const requestId = 'cashfree-payment-session-sensitive-id'
  const notificationCalls = []
  const logs = []
  let seenFailure = false
  const originalInfo = console.info
  const originalError = console.error
  console.info = (message, details) => logs.push({ message, details })
  console.error = (message, details) => logs.push({ message, details })
  const baseUrl = await startServer({
    cashfreeSecretKey: webhookSecret,
    cashfreePayments: {
      async handleWebhook() {
        if (seenFailure) {
          return {
            action: 'duplicate',
            duplicate: true,
            booking: { requestId, paymentStatus: 'failed', paymentFailureReason: 'failed' },
          }
        }
        seenFailure = true
        return {
          action: 'failed',
          booking: { requestId, paymentStatus: 'failed', paymentFailureReason: 'failed' },
        }
      },
    },
    whatsappNotifications: {
      async notify(id, type, options) {
        notificationCalls.push({ id, type, options })
        return { failed: true, providerRejected: true }
      },
    },
  })

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = JSON.stringify({
        type: 'PAYMENT_FAILED_WEBHOOK',
        data: { payment: { payment_status: 'FAILED', cf_payment_id: 'cf-test' } },
      })
      const headers = signedHeaders(body)
      const response = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
        method: 'POST',
        headers,
        body,
      })
      assert.equal(response.status, 200)
    }
  } finally {
    console.info = originalInfo
    console.error = originalError
  }

  assert.equal(notificationCalls.length, 1)
  assert.equal(notificationCalls[0].type, 'payment_failed')
  assert.equal(notificationCalls[0].options.source, 'cashfree_webhook')
  assert.ok(logs.some(({ details }) =>
    details?.stage === 'caller_result' && details.outcome === 'REJECTED' &&
    details.source === 'cashfree_webhook',
  ))
  assert.ok(logs.some(({ details }) =>
    details?.outcome === 'SKIPPED' && details.reason === 'Duplicate Cashfree webhook',
  ))
  assert.equal(JSON.stringify(logs).includes(requestId), false)
})

test('does not acknowledge an unmatched payment when durable storage fails', async () => {
  const logs = []
  const originalError = console.error
  console.error = (...args) => logs.push(args)
  let baseUrl
  try {
    const payments = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: webhookSecret,
      bookingEnquiryModel: { async findOne() { return null } },
      unmatchedPaymentModel: {
        async findOne() { return null },
        async create() { throw new Error('injected unmatched store failure') },
      },
      fetchFn: async () => { throw new Error('Unexpected provider request') },
    })
    baseUrl = await startServer({
      cashfreeSecretKey: webhookSecret,
      cashfreePayments: payments,
    })
    const body = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'private-order-id' },
        payment: { cf_payment_id: 'private-payment-id', payment_status: 'SUCCESS' },
      },
    })
    const response = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
      message: 'Cashfree payment status could not be recorded.',
    })
  } finally {
    console.error = originalError
  }

  const serializedLogs = JSON.stringify(logs)
  assert.equal(serializedLogs.includes('private-order-id'), false)
  assert.equal(serializedLogs.includes('private-payment-id'), false)
  assert.equal(serializedLogs.includes('injected unmatched store failure'), false)
})

test('acknowledges an unmatched success only after durable event capture completes', async () => {
  let persistedRecord = null
  const payments = createCashfreePaymentService({
    appId: 'test-app',
    secretKey: webhookSecret,
    bookingEnquiryModel: { async findOne() { return null } },
    unmatchedPaymentModel: {
      async findOne() { return null },
      async create(record) {
        persistedRecord = { ...record }
      },
    },
    fetchFn: async () => { throw new Error('Unexpected provider request') },
  })
  const baseUrl = await startServer({
    cashfreeSecretKey: webhookSecret,
    cashfreePayments: payments,
  })
  const body = JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: 'stored-order-id' },
      payment: {
        cf_payment_id: 'stored-payment-id',
        payment_status: 'SUCCESS',
        payment_amount: 249,
        payment_currency: 'INR',
      },
    },
  })
  const response = await fetch(`${baseUrl}/api/payments/cashfree/webhook`, {
    method: 'POST',
    headers: signedHeaders(body),
    body,
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: true, outcome: 'notification_skipped' })
  assert.equal(persistedRecord.providerOrderId, 'stored-order-id')
  assert.equal(persistedRecord.providerPaymentId, 'stored-payment-id')
})
