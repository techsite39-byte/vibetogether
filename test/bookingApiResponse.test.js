import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BookingApiError,
  readBookingApiResponse,
} from '../src/services/bookingApiResponse.js'
import { resolveApiBaseUrl } from '../src/config/api.js'

test('parses JSON event responses including empty event lists', async () => {
  const response = new Response(JSON.stringify({ events: [] }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    status: 200,
  })

  assert.deepEqual(await readBookingApiResponse(response, 'Events'), {
    events: [],
  })
})

test('maps non-JSON proxy errors to a friendly service message', async () => {
  const response = new Response('<html>Bad Gateway</html>', {
    headers: { 'Content-Type': 'text/html' },
    status: 502,
  })

  await assert.rejects(
    readBookingApiResponse(response, 'Events'),
    (error) => {
      assert.ok(error instanceof BookingApiError)
      assert.equal(
        error.message,
        'Events service is temporarily unavailable (HTTP 502). Please try again.',
      )
      return true
    },
  )
})

test('maps malformed JSON and API failures without exposing response bodies', async () => {
  const malformedResponse = new Response('{not json', {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
  const failedResponse = new Response(
    JSON.stringify({ message: 'Database password or internal detail' }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    },
  )

  await assert.rejects(
    readBookingApiResponse(malformedResponse, 'Events'),
    /Events returned an invalid response/,
  )
  await assert.rejects(
    readBookingApiResponse(failedResponse, 'Events'),
    (error) => {
      assert.ok(error instanceof BookingApiError)
      assert.doesNotMatch(error.message, /Database password|internal detail/)
      return true
    },
  )
})

test('provides a retry hint when the API rate limit is reached', async () => {
  const response = new Response(JSON.stringify({ message: 'Do not expose' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 429,
  })

  await assert.rejects(
    readBookingApiResponse(response, 'Booking requests'),
    /Too many attempts/,
  )
})

test('preserves safe API errors for missing bookings instead of disguising them as outages', async () => {
  const response = new Response(
    JSON.stringify({ message: 'Booking enquiry not found.' }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    },
  )

  await assert.rejects(
    readBookingApiResponse(response, 'Booking details'),
    (error) => {
      assert.ok(error instanceof BookingApiError)
      assert.equal(error.message, 'Booking enquiry not found.')
      return true
    },
  )
})

test('reports the operation and HTTP status for a non-JSON not-found response', async () => {
  const response = new Response('<html>Not Found</html>', {
    headers: { 'Content-Type': 'text/html' },
    status: 404,
  })

  await assert.rejects(
    readBookingApiResponse(response, 'Razorpay order'),
    /Razorpay order endpoint was not found \(HTTP 404\)/,
  )
})

test('uses the deployed API origin as a production fallback instead of the SPA rewrite', () => {
  assert.equal(
    resolveApiBaseUrl({ PROD: true }),
    'https://vibetogether-ahgy.onrender.com/api',
  )
  assert.equal(resolveApiBaseUrl({ PROD: false }), '/api')
})
