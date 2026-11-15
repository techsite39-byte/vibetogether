import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'

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
  assert.deepEqual(await response.json(), { received: true })
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
