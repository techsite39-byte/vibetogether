import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { PlatformSetting } from '../models/adminRecords.js'
import { randomUUID } from 'node:crypto'
import { nextBookingReference } from './bookingReferences.js'

const demoPaymentAmount = 299

function sameRequest(existing, enquiry) {
  return (
    existing.name === enquiry.name &&
    existing.mobile === enquiry.mobile &&
    existing.eventId === enquiry.eventId &&
    (existing.categoryId ?? '') === (enquiry.categoryId ?? '') &&
    existing.gender === enquiry.gender
  )
}

function throwIdempotencyConflict() {
  throw Object.assign(
    new Error('A booking request ID was reused with different details.'),
    { status: 409 },
  )
}

export async function saveBookingEnquiry(enquiry) {
  const existing = await BookingEnquiry.findOne({
    requestId: enquiry.requestId,
  }).lean()
  if (existing) {
    if (!sameRequest(existing, enquiry)) {
      throwIdempotencyConflict()
    }

    return { enquiry: existing, duplicate: true }
  }

  try {
    const reference = await nextBookingReference()
    const saved = await BookingEnquiry.create({
      ...enquiry,
      reference,
      whatsappNotification: {
        messageType: 'booking_confirmation',
        bookingReference: reference,
        status: enquiry.whatsappConsent ? 'pending' : 'skipped',
        history: [{
          status: enquiry.whatsappConsent ? 'pending' : 'skipped',
          at: new Date(),
          source: 'system',
          note: enquiry.whatsappConsent ? 'Booking confirmation queued.' : 'Customer did not consent.',
        }],
      },
    })
    return { enquiry: saved.toObject(), duplicate: false }
  } catch (error) {
    if (error.code !== 11000) {
      throw error
    }

    const duplicate = await BookingEnquiry.findOne({
      requestId: enquiry.requestId,
    }).lean()
    if (!duplicate) {
      throw error
    }

    if (!sameRequest(duplicate, enquiry)) {
      throwIdempotencyConflict()
    }

    return { enquiry: duplicate, duplicate: true }
  }
}

export async function findBookingEnquiry(requestId) {
  return BookingEnquiry.findOne({ requestId }).lean()
}

export async function findBookingEnquiryByReference(reference) {
  return BookingEnquiry.findOne({ reference }).lean()
}

export async function claimWhatsAppAttempt(
  requestId,
  { retryFailed = false, source = retryFailed ? 'admin' : 'system' } = {},
) {
  const statuses = retryFailed ? ['pending', 'failed'] : ['pending']
  const query = {
    requestId,
    whatsappConsent: true,
    'whatsappNotification.status': { $in: statuses },
    'whatsappNotification.inProgress': { $ne: true },
  }
  if (!retryFailed) {
    query['whatsappNotification.attemptCount'] = 0
  }
  return BookingEnquiry.findOneAndUpdate(
    query,
    {
      $set: {
        'whatsappNotification.status': 'pending',
        'whatsappNotification.inProgress': true,
        'whatsappNotification.lastAttemptAt': new Date(),
        'whatsappNotification.failureReason': '',
        'whatsappNotification.retryable': false,
        'whatsappNotification.nextRetryAt': null,
      },
      $inc: { 'whatsappNotification.attemptCount': 1 },
      $push: {
        'whatsappNotification.history': {
          status: 'pending',
          at: new Date(),
          source,
          note: retryFailed ? 'Admin requested a retry.' : 'WhatsApp send attempt started.',
        },
      },
    },
    { new: true, runValidators: true },
  ).lean()
}

export async function completeWhatsAppAttempt(requestId, result, source = 'system') {
  const at = new Date()
  const status = ['sent', 'skipped'].includes(result.status) ? result.status : 'failed'
  return BookingEnquiry.findOneAndUpdate(
    { requestId, 'whatsappNotification.inProgress': true },
    {
      $set: {
        'whatsappNotification.status': status,
        'whatsappNotification.inProgress': false,
        'whatsappNotification.providerMessageId': result.messageId ?? '',
        'whatsappNotification.failureReason': status === 'failed' ? result.reason : '',
        'whatsappNotification.retryable': status === 'failed' && result.retryable === true,
        'whatsappNotification.nextRetryAt': status === 'failed' && result.retryable === true
          ? new Date(Date.now() + 60_000)
          : null,
      },
      $push: {
        'whatsappNotification.history': {
          status,
          at,
          source,
          note: status === 'sent'
            ? 'Accepted by WhatsApp Cloud API.'
            : result.reason ?? 'Notification was skipped.',
        },
      },
    },
    { new: true, runValidators: true },
  ).lean()
}

const webhookStatusRank = { sent: 1, delivered: 2, read: 3 }

export async function updateWhatsAppDeliveryStatus({
  messageId,
  status,
  timestamp,
  failureReason = '',
}) {
  if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(status)) {
    return null
  }
  const existing = await BookingEnquiry.findOne({
    'whatsappNotification.providerMessageId': messageId,
  }).lean()
  if (!existing) {
    return null
  }
  const currentStatus = existing.whatsappNotification?.status
  if (
    webhookStatusRank[currentStatus] &&
    webhookStatusRank[status] &&
    webhookStatusRank[currentStatus] >= webhookStatusRank[status]
  ) {
    return existing
  }
  if (currentStatus === status) {
    return existing
  }

  const at = Number.isFinite(Number(timestamp)) && Number(timestamp) > 0
    ? new Date(Number(timestamp) * 1000)
    : new Date()
  const update = {
    $set: { 'whatsappNotification.status': status },
    $push: {
      'whatsappNotification.history': {
        status,
        at,
        source: 'webhook',
        note: failureReason.slice(0, 300),
      },
    },
  }
  if (status === 'delivered' || status === 'read') {
    update.$set['whatsappNotification.deliveredAt'] ??= at
    update.$set['whatsappNotification.failureReason'] = ''
  } else if (status === 'failed') {
    update.$set['whatsappNotification.failureReason'] = failureReason.slice(0, 300)
  }
  return BookingEnquiry.findOneAndUpdate(
    {
      _id: existing._id,
      'whatsappNotification.status': currentStatus,
    },
    update,
    { new: true, runValidators: true },
  ).lean()
}

export async function getWhatsAppSettings() {
  const record = await PlatformSetting.findOne({ key: 'whatsapp' }).lean()
  return {
    enabled: record?.value?.enabled ?? true,
    displayNumber: record?.value?.displayNumber ?? '',
    businessContact: record?.value?.businessContact ?? '',
    templateName: record?.value?.templateName ?? '',
    templateLanguage: record?.value?.templateLanguage ?? '',
  }
}

export async function findDueWhatsAppRetries(limit = 20) {
  return BookingEnquiry.find({
    whatsappConsent: true,
    $or: [
      {
        'whatsappNotification.status': 'pending',
        'whatsappNotification.attemptCount': 0,
      },
      {
        'whatsappNotification.status': 'failed',
        'whatsappNotification.retryable': true,
        'whatsappNotification.attemptCount': { $lt: 4 },
        'whatsappNotification.nextRetryAt': { $lte: new Date() },
      },
    ],
  })
    .select('requestId whatsappNotification.status')
    .limit(limit)
    .lean()
}

export async function optOutWhatsAppByPhone(mobile) {
  const bookings = await BookingEnquiry.find({
    mobile,
    whatsappConsent: true,
  }).select('requestId whatsappNotification').lean()
  const at = new Date()
  await Promise.all(bookings.map((booking) => {
    const notification = booking.whatsappNotification ?? {}
    const pending = notification.status === 'pending' && notification.inProgress !== true
    const updates = {
      whatsappConsent: false,
      whatsappOptedOutAt: at,
    }
    if (pending) {
      updates['whatsappNotification.status'] = 'skipped'
      updates['whatsappNotification.inProgress'] = false
      updates['whatsappNotification.failureReason'] = ''
    }
    const update = { $set: updates }
    if (pending) {
      update.$push = {
        'whatsappNotification.history': {
          status: 'skipped',
          at,
          source: 'webhook',
          note: 'Customer opted out of WhatsApp updates.',
        },
      }
    }
    return BookingEnquiry.updateOne(
      { requestId: booking.requestId, whatsappConsent: true },
      update,
    )
  }))
  return bookings.length
}

export async function optOutBookingWhatsApp(requestId) {
  const enquiry = await BookingEnquiry.findOne({ requestId }).lean()
  if (!enquiry) {
    return null
  }
  const at = new Date()
  const pending = enquiry.whatsappNotification?.status === 'pending' &&
    enquiry.whatsappNotification?.inProgress !== true
  const updates = {
    whatsappConsent: false,
    whatsappOptedOutAt: at,
  }
  if (pending) {
    updates['whatsappNotification.status'] = 'skipped'
    updates['whatsappNotification.inProgress'] = false
    updates['whatsappNotification.failureReason'] = ''
  }
  const update = { $set: updates }
  if (pending) {
    update.$push = {
      'whatsappNotification.history': {
        status: 'skipped',
        at,
        source: 'system',
        note: 'Customer opted out of WhatsApp updates.',
      },
    }
  }
  return BookingEnquiry.findOneAndUpdate(
    { requestId },
    update,
    { new: true, runValidators: true },
  ).lean()
}

export async function markBookingEnquiryDemoPaid(requestId) {
  const updated = await BookingEnquiry.findOneAndUpdate(
    {
      requestId,
      status: { $ne: 'cancelled' },
      paymentStatus: { $ne: 'demo_paid' },
    },
    {
      $set: {
        paymentStatus: 'demo_paid',
        paymentAmount: demoPaymentAmount,
        paymentProvider: 'razorpay_demo',
        paymentReference: `demo_${randomUUID()}`,
        paidAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  ).lean()

  if (updated) {
    return { enquiry: updated, duplicate: false }
  }

  const existing = await findBookingEnquiry(requestId)
  if (!existing || existing.status === 'cancelled') {
    return null
  }
  if (existing.paymentStatus === 'demo_paid') {
    return { enquiry: existing, duplicate: true }
  }

  throw new Error('The demo payment status could not be updated.')
}
