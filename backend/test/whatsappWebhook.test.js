import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { isValidWhatsAppWebhookSignature } from '../src/services/whatsappService.js'

const servers = []
const testVerifyToken = 'vibe_test_verify_token_123'
const testAppSecret = 'meta_test_app_secret_abc123'

async function startServer(options = {}) {
  const server = createApp({
    corsOrigins: [],
    whatsappWebhookConfig: {
      verifyToken: testVerifyToken,
      appSecret: testAppSecret,
      ...options.whatsappWebhookConfig,
    },
    ...options,
  }).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

function createMetaSignature(rawBody, appSecret = testAppSecret) {
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  return `sha256=${digest}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  ))
})

test('isValidWhatsAppWebhookSignature validates signatures correctly', () => {
  const rawBody = JSON.stringify({ entry: [] })
  const validSig = createMetaSignature(rawBody, testAppSecret)
  assert.equal(isValidWhatsAppWebhookSignature(rawBody, validSig, testAppSecret), true)
  assert.equal(isValidWhatsAppWebhookSignature(rawBody, validSig.toUpperCase(), testAppSecret), true)
  assert.equal(isValidWhatsAppWebhookSignature(rawBody, 'sha256=invalid', testAppSecret), false)
  assert.equal(isValidWhatsAppWebhookSignature('', validSig, testAppSecret), false)
  assert.equal(isValidWhatsAppWebhookSignature(rawBody, validSig, ''), false)
})

test('GET /api/whatsapp/webhook verifies subscription with correct token and challenge', async () => {
  const baseUrl = await startServer()
  const challenge = 'challenge_test_string_9988'
  const response = await fetch(
    `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${testVerifyToken}&hub.challenge=${challenge}`,
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type')?.includes('text/plain'), true)
  const text = await response.text()
  assert.equal(text, challenge)
})

test('GET /api/whatsapp/webhook returns 403 on invalid verify token or mode', async () => {
  const baseUrl = await startServer()

  const badTokenResponse = await fetch(
    `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test`,
  )
  assert.equal(badTokenResponse.status, 403)

  const badModeResponse = await fetch(
    `${baseUrl}/api/whatsapp/webhook?hub.mode=publish&hub.verify_token=${testVerifyToken}&hub.challenge=test`,
  )
  assert.equal(badModeResponse.status, 403)
})

test('GET /api/whatsapp/webhook returns 503 if verification token is not configured', async () => {
  const baseUrl = await startServer({
    whatsappWebhookConfig: {
      verifyToken: '',
      appSecret: testAppSecret,
    },
  })

  const response = await fetch(
    `${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=any&hub.challenge=test`,
  )
  assert.equal(response.status, 503)
})

test('POST /api/whatsapp/webhook rejects missing or invalid signatures', async () => {
  const baseUrl = await startServer()
  const body = JSON.stringify({ entry: [] })

  // Missing signature
  const missingSigResponse = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  assert.equal(missingSigResponse.status, 401)

  // Invalid signature
  const invalidSigResponse = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': 'sha256=wronghex1234567890abcdef',
    },
    body,
  })
  assert.equal(invalidSigResponse.status, 401)
})

test('POST /api/whatsapp/webhook accepts valid signature and dispatches statuses', async () => {
  const recordedStatuses = []
  const baseUrl = await startServer({
    whatsappNotifications: {
      async recordWebhookStatus(update) {
        recordedStatuses.push(update)
        return { success: true }
      },
    },
  })

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [
                {
                  id: 'wamid.HBgLMTIzNDU2',
                  status: 'delivered',
                  timestamp: '1731665000',
                  recipient_id: '919025335720',
                },
              ],
            },
          },
        ],
      },
    ],
  }

  const rawBody = JSON.stringify(payload)
  const signature = createMetaSignature(rawBody, testAppSecret)

  const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  })

  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data, { received: true })
  assert.equal(recordedStatuses.length, 1)
  assert.equal(recordedStatuses[0].messageId, 'wamid.HBgLMTIzNDU2')
  assert.equal(recordedStatuses[0].status, 'delivered')
})

test('POST /api/whatsapp/webhook dispatches incoming customer messages and opt-outs', async () => {
  const recordedMessages = []
  const baseUrl = await startServer({
    whatsappNotifications: {
      recordWebhookStatus: async () => {},
      async recordIncomingMessage(msg) {
        recordedMessages.push(msg)
        return { success: true }
      },
    },
  })

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  from: '919025335720',
                  id: 'wamid.HBgLMjAy',
                  timestamp: '1731665100',
                  type: 'text',
                  text: { body: 'STOP' },
                },
              ],
            },
          },
        ],
      },
    ],
  }

  const rawBody = JSON.stringify(payload)
  const signature = createMetaSignature(rawBody, testAppSecret)

  const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  })

  assert.equal(response.status, 200)
  assert.equal(recordedMessages.length, 1)
  assert.equal(recordedMessages[0].messageId, 'wamid.HBgLMjAy')
  assert.equal(recordedMessages[0].from, '919025335720')
  assert.equal(recordedMessages[0].text, 'STOP')
})
