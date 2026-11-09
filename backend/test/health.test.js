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

test('root and liveness endpoints report the running backend', async () => {
  const rootResponse = await fetch(baseUrl)
  const healthResponse = await fetch(`${baseUrl}/api/health`)

  assert.equal(rootResponse.status, 200)
  assert.deepEqual(await rootResponse.json(), {
    status: 'ok',
    message: 'Backend is running',
    port: Number(new URL(baseUrl).port),
  })
  assert.equal(healthResponse.status, 200)
  assert.deepEqual(await healthResponse.json(), {
    status: 'ok',
    message: 'Backend is running',
    port: Number(new URL(baseUrl).port),
  })
})

test('health endpoint reports the backend port', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.equal((await response.json()).port, Number(new URL(baseUrl).port))
})

test('trusts the Render reverse proxy only in production', () => {
  const productionApp = createApp({ nodeEnv: 'production' })
  const developmentApp = createApp({ nodeEnv: 'development' })

  assert.equal(productionApp.get('trust proxy'), 1)
  assert.equal(developmentApp.get('trust proxy'), false)
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
