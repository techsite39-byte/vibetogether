import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { randomUUID } from 'node:crypto'
import { nextBookingReference } from './bookingReferences.js'

const defaultPricing = {
  paymentAmount: 299,
  paymentAmountPaise: 29_900,
  regularPrice: 299,
  offerPrice: 249,
  diwaliOfferApplied: false,
  offerActivationAt: null,
  offerExpiresAt: null,
}

function sameRequest(existing, enquiry) {
  return (
    existing.name === enquiry.name &&
    existing.mobile === enquiry.mobile &&
    (existing.email ?? '') === (enquiry.email ?? '') &&
    existing.eventId === enquiry.eventId &&
    (existing.categoryId ?? '') === (enquiry.categoryId ?? '') &&
    (existing.ticketType ?? 'general-admission') === (enquiry.ticketType ?? 'general-admission') &&
    (existing.ticketQuantity ?? 1) === enquiry.ticketQuantity &&
    existing.gender === enquiry.gender &&
    (existing.maleCount ?? (existing.gender === 'Male' ? (existing.ticketQuantity ?? 1) : 0)) === enquiry.maleCount &&
    (existing.femaleCount ?? (existing.gender === 'Female' ? (existing.ticketQuantity ?? 1) : 0)) === enquiry.femaleCount &&
    JSON.stringify(existing.maleMemberNames ?? Array(existing.maleCount ?? 0).fill('')) === JSON.stringify(enquiry.maleMemberNames ?? []) &&
    JSON.stringify(existing.femaleMemberNames ?? Array(existing.femaleCount ?? 0).fill('')) === JSON.stringify(enquiry.femaleMemberNames ?? [])
  )
}

function throwIdempotencyConflict() {
  throw Object.assign(
    new Error('A booking request ID was reused with different details.'),
    { status: 409 },
  )
}

export async function saveBookingEnquiry(enquiry, { bookingEnquiryModel = BookingEnquiry } = {}) {
  const existing = await bookingEnquiryModel.findOne({
    requestId: enquiry.requestId,
  }).lean()
  if (existing) {
    if (!sameRequest(existing, enquiry)) {
      throwIdempotencyConflict()
    }

    return { enquiry: existing, duplicate: true }
  }

  try {
    const saved = await bookingEnquiryModel.create({
      ...enquiry,
      email: enquiry.email ?? '',
      paymentStatus: 'unpaid',
      ...defaultPricing,
      ...Object.fromEntries(
        Object.entries(enquiry).filter(([key]) => Object.hasOwn(defaultPricing, key)),
      ),
      paymentOrderAmountPaise: 0,
      paymentOrders: [],
      paymentProvider: null,
      paymentReference: '',
      paidAt: null,
      paymentVerifiedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      whatsappNotification: {
        messageType: 'booking_confirmation',
        bookingReference: '',
        status: 'skipped',
        history: [],
      },
    })
    return { enquiry: saved.toObject(), duplicate: false }
  } catch (error) {
    if (error.code !== 11000) {
      throw error
    }

    const duplicate = await bookingEnquiryModel.findOne({
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

export async function findBookingEnquiry(requestId, bookingEnquiryModel = BookingEnquiry) {
  return bookingEnquiryModel.findOne({ requestId }).lean()
}

export async function findBookingEnquiryByReference(reference, bookingEnquiryModel = BookingEnquiry) {
  return bookingEnquiryModel.findOne({ reference }).lean()
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

export async function markBookingEnquiryDemoPaid(
  requestId,
  {
    bookingEnquiryModel = BookingEnquiry,
    allocateReference = nextBookingReference,
    pricing,
  } = {},
) {
  const now = new Date()
  const attemptId = randomUUID()
  const claimed = await bookingEnquiryModel.findOneAndUpdate(
    {
      requestId,
      status: { $ne: 'cancelled' },
      expiresAt: { $gt: now },
      $and: [
        { $or: [{ reference: { $exists: false } }, { reference: '' }] },
        {
          $or: [
            { paymentStatus: { $in: ['unpaid', 'failed'] } },
            {
              paymentStatus: 'processing',
              paymentAttemptedAt: { $lte: new Date(now.getTime() - 2 * 60 * 1000) },
            },
          ],
        },
      ],
    },
    {
      $set: {
        paymentStatus: 'processing',
        paymentAttemptId: attemptId,
        paymentAttemptedAt: now,
        paymentFailureReason: '',
      },
    },
    { new: true, runValidators: true },
  ).lean()

  if (!claimed) {
    const existing = await findBookingEnquiry(requestId, bookingEnquiryModel)
    if (!existing || existing.status === 'cancelled') {
      return null
    }
    if (existing.paymentStatus === 'demo_paid' && existing.reference) {
      return { enquiry: existing, duplicate: true }
    }
    if (existing.paymentStatus === 'processing') {
      return { enquiry: existing, pending: true, duplicate: false }
    }
    return null
  }

  try {
    const reference = await allocateReference()
    const updated = await bookingEnquiryModel.findOneAndUpdate(
      { _id: claimed._id, paymentStatus: 'processing', paymentAttemptId: attemptId },
      {
        $set: {
          reference,
          paymentStatus: 'demo_paid',
          paymentAmount: pricing?.finalAmount ?? claimed.paymentAmount ?? defaultPricing.paymentAmount,
          paymentAmountPaise: pricing?.paymentAmountPaise ?? claimed.paymentAmountPaise ?? defaultPricing.paymentAmountPaise,
          finalAmount: pricing?.finalAmount ?? claimed.finalAmount ?? claimed.paymentAmount ?? defaultPricing.paymentAmount,
          ticketType: pricing?.ticketType ?? claimed.ticketType ?? 'general-admission',
          ticketTypeName: pricing?.ticketTypeName ?? claimed.ticketTypeName ?? 'General Admission',
          ticketQuantity: pricing?.ticketQuantity ?? claimed.ticketQuantity ?? 1,
          pricePerTicket: pricing?.pricePerTicket ?? claimed.pricePerTicket ?? defaultPricing.regularPrice,
          subtotal: pricing?.subtotal ?? claimed.subtotal ?? defaultPricing.regularPrice,
          discount: pricing?.discount ?? claimed.discount ?? 0,
          regularPrice: pricing?.regularPrice ?? claimed.regularPrice ?? defaultPricing.regularPrice,
          offerPrice: pricing?.offerPrice ?? claimed.offerPrice ?? defaultPricing.offerPrice,
          diwaliOfferApplied: pricing?.diwaliOfferApplied ?? Boolean(claimed.diwaliOfferApplied),
          offerActivationAt: pricing?.offerActivationAt ?? claimed.offerActivationAt ?? null,
          offerExpiresAt: pricing?.offerExpiresAt ?? claimed.offerExpiresAt ?? null,
          paymentProvider: 'razorpay_demo',
          paymentReference: `demo_${randomUUID()}`,
          paymentFailureReason: '',
          paidAt: new Date(),
          paymentVerifiedAt: new Date(),
        },
        $unset: { expiresAt: 1, paymentAttemptId: 1, paymentAttemptedAt: 1 },
      },
      { new: true, runValidators: true },
    ).lean()
    if (updated) {
      return { enquiry: updated, duplicate: false }
    }
    const existing = await findBookingEnquiry(requestId, bookingEnquiryModel)
    if (existing?.paymentStatus === 'demo_paid' && existing.reference) {
      return { enquiry: existing, duplicate: true }
    }
    return existing ? { enquiry: existing, pending: true, duplicate: false } : null
  } catch (error) {
    await bookingEnquiryModel.findOneAndUpdate(
      { _id: claimed._id, paymentStatus: 'processing', paymentAttemptId: attemptId },
      {
        $set: { paymentStatus: 'unpaid' },
        $unset: { paymentAttemptId: 1, paymentAttemptedAt: 1 },
      },
    )
    throw error
  }
}

export async function markBookingEnquiryDemoFailed(
  requestId,
  outcome,
  bookingEnquiryModel = BookingEnquiry,
) {
  return bookingEnquiryModel.findOneAndUpdate(
    {
      requestId,
      status: { $ne: 'cancelled' },
      paymentStatus: { $in: ['unpaid', 'failed'] },
      expiresAt: { $gt: new Date() },
      $or: [{ reference: { $exists: false } }, { reference: '' }],
    },
    {
      $set: {
        paymentStatus: 'failed',
        paymentFailureReason: outcome,
      },
    },
    { new: true, runValidators: true },
  ).lean()
}
