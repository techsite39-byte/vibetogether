import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import mongoose from 'mongoose'

let server
let baseUrl

before(async () => {
  server = createApp({ corsOrigins: ['http://localhost:5173'] }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('liveness endpoint responds without exposing database details', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('readiness endpoint reports an unavailable database', async () => {
  await mongoose.disconnect()
  const response = await fetch(`${baseUrl}/api/health/ready`)

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    status: 'unavailable',
    database: 'disconnected',
  })
})

test('CORS rejects origins outside the configured allowlist', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://untrusted.example' },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), {
    message: 'Origin is not allowed by CORS.',
  })
})
