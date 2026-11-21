import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveBookingSubtotal } from '../src/utils/bookingTotals.js'

test('calculates the displayed subtotal when the stored value only covers one ticket', () => {
  assert.equal(resolveBookingSubtotal(199, 199, 2), 398)
})

test('preserves a stored subtotal that includes the full ticket quantity or discount basis', () => {
  assert.equal(resolveBookingSubtotal(597, 199, 3), 597)
  assert.equal(resolveBookingSubtotal(598, 249, 2), 598)
})
