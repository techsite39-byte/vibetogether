import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'

test('valid category booking passes model validation with optional WhatsApp consent omitted', () => {
  const enquiry = new BookingEnquiry({
    requestId: 'bfe94e41-29f1-4e31-bbcc-477302baa176',
    name: 'Browser Test',
    mobile: '+919876543210',
    email: '',
    categoryId: 'sing-along',
    category: 'Sing Along',
    gender: 'Male',
    status: 'pending',
    paymentStatus: 'unpaid',
    source: 'Website booking journey',
    paymentAmount: 249,
    paymentAmountPaise: 24900,
    regularPrice: 299,
    offerPrice: 249,
    diwaliOfferApplied: true,
    offerActivationAt: new Date('2026-11-09T09:57:00.003Z'),
    offerExpiresAt: new Date('2026-11-12T09:57:00.003Z'),
  })

  assert.equal(enquiry.whatsappConsent, false)
  assert.equal(enquiry.paymentOrderAttemptNumber, 0)
  assert.deepEqual(enquiry.validateSync(), undefined)
})
