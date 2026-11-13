import assert from 'node:assert/strict'
import test from 'node:test'
import {
  submitBookingEnquiryUpiPayment,
  verifyBookingEnquiryUpiPayment,
} from '../src/services/bookingEnquiries.js'

function createBookingModel(initialRecord) {
  const record = structuredClone(initialRecord)
  const query = (value) => ({ lean: async () => (value ? structuredClone(value) : null) })

  return {
    get record() {
      return structuredClone(record)
    },
    findOne({ requestId }) {
      return query(record.requestId === requestId ? record : null)
    },
    findOneAndUpdate(filter, update) {
      if (record.requestId !== filter.requestId || record.status === 'cancelled') {
        return query(null)
      }

      if (update.$push?.upiPayments) {
        if (
          record.reference ||
          !['unpaid', 'failed'].includes(record.paymentStatus) ||
          record.paymentOrderId ||
          record.upiPayments.some((payment) => payment.status === 'Submitted for Verification')
        ) {
          return query(null)
        }
        record.upiPayments.push(structuredClone(update.$push.upiPayments))
      } else {
        const statusPath = Object.keys(update.$set).find((key) => key.endsWith('.status'))
        const index = Number(statusPath.split('.')[1])
        const payment = record.upiPayments[index]
        if (
          !payment ||
          payment.utr !== filter[`upiPayments.${index}.utr`] ||
          payment.status !== filter[`upiPayments.${index}.status`]
        ) {
          return query(null)
        }
        for (const [path, value] of Object.entries(update.$set)) {
          if (path.startsWith(`upiPayments.${index}.`)) {
            payment[path.split('.').at(-1)] = value
          } else {
            record[path] = value
          }
        }
      }

      Object.assign(record, update.$set)
      return query(record)
    },
  }
}

function bookingRecord() {
  return {
    requestId: '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    name: 'Jordan Example',
    eventId: 'fun-games',
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentAmount: 299,
    paymentAmountPaise: 29900,
    upiPayments: [],
    expiresAt: new Date(Date.now() + 60_000),
  }
}

const pricing = {
  finalAmount: 475,
  paymentAmountPaise: 47500,
  ticketType: 'general-admission',
  ticketTypeName: 'General Admission',
  ticketQuantity: 2,
  pricePerTicket: 250,
  subtotal: 500,
  discount: 25,
  regularPrice: 250,
  offerPrice: 237.5,
  diwaliOfferApplied: true,
  offerActivationAt: null,
  offerExpiresAt: null,
}

test('UPI submission is server-priced, idempotent and stays unconfirmed until verification', async () => {
  const model = createBookingModel(bookingRecord())
  const options = { bookingEnquiryModel: model }
  const first = await submitBookingEnquiryUpiPayment(
    model.record.requestId,
    { utr: ' 123456789012 ', upiId: 'vinothinimoorthi37-1@okhdfcbank', pricing },
    options,
  )

  assert.equal(first.duplicate, false)
  assert.equal(first.enquiry.upiPayments[0].utr, '123456789012')
  assert.equal(first.enquiry.upiPayments[0].amount, pricing.finalAmount)
  assert.equal(first.enquiry.paymentAmount, pricing.finalAmount)
  assert.equal(first.enquiry.paymentStatus, 'processing')
  assert.equal(first.enquiry.status, 'pending')
  assert.equal(first.enquiry.reference, undefined)
  assert.equal(first.enquiry.expiresAt, null)

  const duplicate = await submitBookingEnquiryUpiPayment(
    model.record.requestId,
    { utr: '123456789012', upiId: 'vinothinimoorthi37-1@okhdfcbank', pricing },
    options,
  )
  assert.equal(duplicate.duplicate, true)
  await assert.rejects(
    submitBookingEnquiryUpiPayment(
      model.record.requestId,
      { utr: '999999999999', upiId: 'vinothinimoorthi37-1@okhdfcbank', pricing },
      options,
    ),
    (error) => error.status === 409,
  )

  let allocated = 0
  const verified = await verifyBookingEnquiryUpiPayment(
    model.record.requestId,
    { decision: 'approve', adminId: 'admin-1' },
    {
      bookingEnquiryModel: model,
      allocateReference: async () => {
        allocated += 1
        return '10812026501'
      },
    },
  )
  assert.equal(verified.enquiry.upiPayments[0].status, 'Verified')
  assert.equal(verified.enquiry.paymentStatus, 'paid')
  assert.equal(verified.enquiry.status, 'confirmed')
  assert.equal(verified.enquiry.reference, '10812026501')
  assert.ok(verified.enquiry.upiPayments[0].adminVerifiedAt)
  assert.equal(allocated, 1)

  const duplicateApproval = await verifyBookingEnquiryUpiPayment(
    model.record.requestId,
    { decision: 'approve', adminId: 'admin-1' },
    { bookingEnquiryModel: model, allocateReference: async () => 'unused' },
  )
  assert.equal(duplicateApproval.duplicate, true)
  assert.equal(duplicateApproval.enquiry.reference, '10812026501')
})

test('a rejected UPI submission records a reason and does not issue a booking reference', async () => {
  const model = createBookingModel(bookingRecord())
  const requestId = model.record.requestId
  await submitBookingEnquiryUpiPayment(
    requestId,
    { utr: '123456789012', upiId: 'vinothinimoorthi37-1@okhdfcbank', pricing },
    { bookingEnquiryModel: model },
  )

  const rejected = await verifyBookingEnquiryUpiPayment(
    requestId,
    { decision: 'reject', rejectionReason: 'No matching bank credit.', adminId: 'admin-1' },
    { bookingEnquiryModel: model },
  )
  assert.equal(rejected.enquiry.upiPayments[0].status, 'Rejected')
  assert.equal(rejected.enquiry.upiPayments[0].rejectionReason, 'No matching bank credit.')
  assert.equal(rejected.enquiry.paymentStatus, 'failed')
  assert.equal(rejected.enquiry.status, 'pending')
  assert.equal(rejected.enquiry.reference, undefined)
  assert.ok(rejected.enquiry.upiPayments[0].adminVerifiedAt)
})
