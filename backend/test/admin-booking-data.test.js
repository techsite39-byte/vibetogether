import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeBookingRecords,
  summarizeBookingRecords,
} from '../src/routes/admin.js'

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

test('admin booking records keep attendee details without legacy notification metadata', () => {
  const enquiry = {
    requestId: '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    name: 'Alex Customer',
    maleMemberConsents: [true],
    femaleMemberConsents: [false],
    attendees: [{
      name: 'Alex',
      gender: 'Male',
      mobile: '+919876543210',
      messagingConsent: true,
    }],
    attendeeNotifications: [{ status: 'delivered' }],
    adminNotification: { status: 'sent' },
  }

  const [booking] = mergeBookingRecords([], [enquiry])

  assert.deepEqual(booking.attendees, [{
    name: 'Alex',
    gender: 'Male',
    mobile: '+919876543210',
  }])
  assert.equal('maleMemberConsents' in booking, false)
  assert.equal('femaleMemberConsents' in booking, false)
  assert.equal('attendeeNotifications' in booking, false)
  assert.equal('adminNotification' in booking, false)
})

test('admin booking merge deduplicates shared request and reference identities across collections', () => {
  const currentEnquiry = {
    requestId: 'request-current',
    reference: 'VT-100',
    name: 'Current booking',
    createdAt: new Date('2026-11-12T12:00:00Z'),
  }
  const legacyEnquiry = {
    requestId: 'request-legacy',
    reference: 'VT-100',
    name: 'Duplicate legacy record',
    createdAt: new Date('2026-11-11T12:00:00Z'),
  }
  const booking = {
    requestId: 'request-current',
    reference: 'VT-100',
    customer: 'Duplicate booking collection record',
    createdAt: new Date('2026-11-10T12:00:00Z'),
  }

  const records = mergeBookingRecords([booking], [currentEnquiry], [legacyEnquiry])

  assert.equal(records.length, 1)
  assert.equal(records[0].customer, 'Current booking')

  const identityCollision = mergeBookingRecords([], [
    { requestId: 'request-1', reference: 'request-2', name: 'First' },
    { requestId: 'request-2', reference: 'VT-200', name: 'Second' },
  ])
  assert.equal(identityCollision.length, 2)
})

test('admin overview summarizes unique records from current and legacy collections', () => {
  const summary = summarizeBookingRecords(
    [{ reference: 'VT-200', status: 'confirmed', createdAt: new Date('2026-11-10T12:00:00Z') }],
    [{
      requestId: 'request-current',
      reference: 'VT-200',
      status: 'confirmed',
      createdAt: new Date('2026-11-12T12:00:00Z'),
    }],
    [{
      requestId: 'request-legacy',
      reference: 'VT-201',
      status: 'pending',
      createdAt: new Date('2026-11-11T12:00:00Z'),
    }],
  )

  assert.equal(summary.counts.bookings, 2)
  assert.equal(summary.counts.bookingEnquiries, 2)
  assert.deepEqual(summary.bookingStatuses, { confirmed: 1, pending: 1 })
  assert.deepEqual(summary.bookingTrends, [{ label: '2026-11', value: 2 }])
  assert.equal(summary.recentBookings[1].requestId, 'request-legacy')
})
