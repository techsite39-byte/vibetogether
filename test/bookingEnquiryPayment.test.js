import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createRazorpayOrder } from '../src/services/bookingEnquiryPayment.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('labels a missing Razorpay order route as a payment setup error, not a booking lookup error', async () => {
  let requestedUrl = ''
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return new Response('<html>Not Found</html>', {
      headers: { 'Content-Type': 'text/html' },
      status: 404,
    })
  }

  await assert.rejects(
    createRazorpayOrder('4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b'),
    (error) => {
      assert.match(error.message, /Razorpay order endpoint was not found/)
      assert.doesNotMatch(error.message, /Booking details/)
      return true
    },
  )
  assert.match(requestedUrl, /\/booking-enquiries\/4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b\/razorpay-order$/)
})
