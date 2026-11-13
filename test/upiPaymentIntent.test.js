import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createUpiPaymentIntent } from '../src/services/upiPaymentIntent.js'

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
  assert.equal(
    url.searchParams.get('tn'),
    'Vibe Together Booking 4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
  )
})
