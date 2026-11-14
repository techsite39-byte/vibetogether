import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGooglePayPaymentIntent,
  createPaytmPaymentIntent,
  createPhonePePaymentIntent,
  createUpiPaymentIntent,
} from '../src/services/upiPaymentIntent.js'

test('encodes the payee and persisted booking amount in the UPI intent', () => {
  const intent = createUpiPaymentIntent({
    requestId: '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    upiId: 'vinothinimoorthi37-1@okhdfcbank',
    upiPayeeName: 'Vinothini Moorthi',
    paymentAmount: 777.25,
  })
  const url = new URL(intent)

  assert.equal(url.protocol, 'upi:')
  assert.equal(url.host, 'pay')
  assert.equal(url.searchParams.get('pa'), 'vinothinimoorthi37-1@okhdfcbank')
  assert.equal(url.searchParams.get('pn'), 'Vinothini Moorthi')
  assert.equal(url.searchParams.get('am'), '777.25')
  assert.equal(url.searchParams.get('cu'), 'INR')
  assert.equal(url.searchParams.get('tn'), 'Vibe Together Booking')
})

test('targets PhonePe, Google Pay, and Paytm without exposing WhatsApp as a payment target', () => {
  const booking = {
    upiId: 'vinothinimoorthi37-1@okhdfcbank',
    upiPayeeName: 'Vinothini Moorthi',
    paymentAmount: 777.25,
  }
  const fallbackUrl =
    'https://www.vibetogether.show/booking/payment/request-123?upiFallback=1'
  const intents = [
    [createPhonePePaymentIntent(booking, fallbackUrl), 'com.phonepe.app'],
    [
      createGooglePayPaymentIntent(booking, fallbackUrl),
      'com.google.android.apps.nbu.paisa.user',
    ],
    [createPaytmPaymentIntent(booking, fallbackUrl), 'net.one97.paytm'],
  ]

  for (const [intent, packageName] of intents) {
    const query = intent.slice('intent://pay?'.length, intent.indexOf('#Intent;'))
    const parameters = new URLSearchParams(query)
    const fallback = decodeURIComponent(
      intent.match(/S\.browser_fallback_url=([^;]+)/)[1],
    )

    assert.match(intent, /^intent:\/\/pay\?/)
    assert.ok(intent.includes(`package=${packageName}`))
    assert.equal(parameters.get('pa'), booking.upiId)
    assert.equal(parameters.get('am'), '777.25')
    assert.equal(parameters.get('cu'), 'INR')
    assert.equal(parameters.get('tn'), 'Vibe Together Booking')
    assert.equal(fallback, fallbackUrl)
    assert.doesNotMatch(intent, /wa\.me|whatsapp/i)
  }
})

test('rejects invalid booking amounts and missing payee details', () => {
  assert.throws(
    () =>
      createUpiPaymentIntent({
        upiId: 'vinothinimoorthi37-1@okhdfcbank',
        upiPayeeName: 'Vinothini Moorthi',
        paymentAmount: 0,
      }),
    /valid booking amount/,
  )
  assert.throws(
    () =>
      createUpiPaymentIntent({
        paymentAmount: 777,
        upiId: '',
        upiPayeeName: 'Vinothini Moorthi',
      }),
    /Verified UPI payee details/,
  )
})
