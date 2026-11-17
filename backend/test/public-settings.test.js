import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'

let server
let baseUrl

before(async () => {
  const platformSettingModel = {
    findOne(query) {
      assert.deepEqual(query, { key: 'platform' })
      return {
        lean: async () => ({
          value: {
            contactEmail: 'private@example.com',
            socialInstagram: 'https://instagram.com/vibetogether',
            socialFacebook: '',
            socialYoutube: 'javascript:alert(1)',
            socialLinkedin: 'https://linkedin.com/company/vibetogether',
          },
        }),
      }
    },
  }

  server = createApp({
    corsOrigins: ['http://localhost:5173'],
    platformSettingModel,
    diwaliOfferService: {
      async getPublicOffer() {
        return {
          enabled: false,
          regularPrice: 199,
          offerPrice: 199,
          savings: 0,
          active: false,
          paymentAmount: 199,
          paymentAmountPaise: 19_900,
          serverTime: new Date().toISOString(),
        }
      },
    },
  }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('public social settings include only configured HTTPS links', async () => {
  const response = await fetch(`${baseUrl}/api/public-settings/social`)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), {
    socialLinks: [
      { label: 'Instagram', url: 'https://instagram.com/vibetogether' },
      { label: 'LinkedIn', url: 'https://linkedin.com/company/vibetogether' },
    ],
  })
})

test('public booking pricing exposes the fixed INR 199 amount', async () => {
  const response = await fetch(`${baseUrl}/api/public-settings/diwali-offer`)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.offer.paymentAmount, 199)
  assert.equal(payload.offer.paymentAmountPaise, 19_900)
  assert.equal(payload.offer.regularPrice, 199)
  assert.equal(payload.offer.offerPrice, 199)
  assert.equal(payload.offer.active, false)
})