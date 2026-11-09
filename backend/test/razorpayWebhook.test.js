import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'

const servers = []

async function startServer(options) {
  const server = createApp({
    corsOrigins: [],
    ...options,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  ))
})

test('verifies Razorpay webhook signatures and safely triggers the customer notification', async () => {
  const secret = 'razorpay-webhook-test-secret'
  const notifications = []
  const payments = {
    async handleWebhook(event, payment) {
      assert.equal(event, 'payment.captured')
      assert.equal(payment.id, 'pay_test')
      return {
        booking: {
          requestId: 'session-test',
          reference: '10812026501',
          paymentStatus: 'paid',
        },
      }
    },
  }
  const baseUrl = await startServer({
    razorpayWebhookSecret: secret,
    razorpayPayments: payments,
    whatsappNotifications: {
      async notify(requestId, type) {
        notifications.push({ requestId, type })
        throw new Error('Notification provider unavailable.')
      },
    },
  })
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test',
          order_id: 'order_test',
          amount: 24900,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  })
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  const invalid = await fetch(`${baseUrl}/api/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': '0'.repeat(64),
    },
    body,
  })
  assert.equal(invalid.status, 401)

  const response = await fetch(`${baseUrl}/api/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
    },
    body,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(notifications, [{
    requestId: 'session-test',
    type: 'booking_confirmation',
  }])
})

test('rejects Razorpay webhooks when signature verification is not configured', async () => {
  const baseUrl = await startServer({
    razorpayPayments: { async handleWebhook() { return null } },
  })

  const response = await fetch(`${baseUrl}/api/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })

  assert.equal(response.status, 503)
})
