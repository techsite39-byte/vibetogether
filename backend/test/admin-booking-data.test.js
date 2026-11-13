import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeBookingRecords } from '../src/routes/admin.js'

test('admin booking records include saved enquiries before payment', () => {
  const enquiry = {
    requestId: '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    name: 'Alex Customer',
    email: 'alex@example.com',
    mobile: '+919876543210',
    category: 'Sing Along',
    gender: 'Mixed',
    ticketQuantity: 2,
    maleCount: 1,
    femaleCount: 1,
    maleMemberNames: ['Alex'],
    femaleMemberNames: ['Sam'],
    ticketType: 'general-admission',
    paymentStatus: 'unpaid',
    status: 'pending',
    createdAt: new Date('2026-11-12T12:00:00Z'),
  }

  const [booking] = mergeBookingRecords([], [enquiry])

  assert.equal(booking.reference, '')
  assert.equal(booking.requestId, enquiry.requestId)
  assert.equal(booking.customer, enquiry.name)
  assert.equal(booking.customerEmail, enquiry.email)
  assert.equal(booking.mobile, enquiry.mobile)
  assert.equal(booking.ticketQuantity, 2)
  assert.deepEqual(booking.maleMemberNames, ['Alex'])
  assert.deepEqual(booking.femaleMemberNames, ['Sam'])
  assert.equal(booking.paymentStatus, 'unpaid')
})
