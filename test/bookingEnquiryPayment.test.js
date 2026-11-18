import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createCashfreeOrder } from '../src/services/bookingEnquiryPayment.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('creates a Cashfree order through the Cashfree booking endpoint', async () => {
  let requestedUrl = ''
  let requestOptions
  globalThis.fetch = async (url, options) => {
    requestedUrl = url
    requestOptions = options
    return new Response(JSON.stringify({
      payment_session_id: 'cf-session-test',
      order_id: 'cf-order-test',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  const order = await createCashfreeOrder(
    '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    'https://vibetogether.show/return',
  )

  assert.equal(order.payment_session_id, 'cf-session-test')
  assert.equal(order.order_id, 'cf-order-test')
  assert.match(requestedUrl, /\/booking-enquiries\/4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b\/cashfree-order$/)
  assert.equal(JSON.parse(requestOptions.body).returnUrl, 'https://vibetogether.show/return')
})
