import assert from 'node:assert/strict'
import test from 'node:test'
import { getWhatsAppRetryIdentifier } from '../src/admin/services/adminApi.js'

test('primary WhatsApp retry prefers the enquiry request ID over its booking reference', () => {
  assert.equal(
    getWhatsAppRetryIdentifier({
      id: 'enquiry-id',
      requestId: 'enquiry-request-id',
      reference: 'booking-reference',
    }),
    'enquiry-request-id',
  )
})

test('primary WhatsApp retry preserves reference and ID fallbacks', () => {
  assert.equal(
    getWhatsAppRetryIdentifier({ id: 'enquiry-id', reference: 'booking-reference' }),
    'booking-reference',
  )
  assert.equal(
    getWhatsAppRetryIdentifier({ reference: 'booking-reference' }),
    'booking-reference',
  )
  assert.equal(getWhatsAppRetryIdentifier({ id: 'enquiry-id' }), 'enquiry-id')
})
