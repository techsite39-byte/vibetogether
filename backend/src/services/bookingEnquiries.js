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

function latestUpiPayment(enquiry) {
  return enquiry?.upiPayments?.at(-1) ?? null
}

function throwUpiConflict(message = 'This UPI payment cannot be submitted in its current state.') {
  throw Object.assign(new Error(message), { status: 409 })
}

export async function submitBookingEnquiryUpiPayment(
  requestId,
  { utr, upiId, pricing },
  {
    bookingEnquiryModel = BookingEnquiry,
    now = new Date(),
  } = {},
) {
  const normalizedUtr = typeof utr === 'string' ? utr.trim().replace(/\s+/g, '').toUpperCase() : ''
  if (!/^[A-Z0-9]{8,32}$/.test(normalizedUtr)) {
    throw Object.assign(new Error('Enter a valid UPI transaction reference number.'), { status: 400 })
  }
  const existing = await bookingEnquiryModel.findOne({ requestId }).lean()
  const previousPayment = latestUpiPayment(existing)
  if (previousPayment?.utr === normalizedUtr) {
    return { enquiry: existing, duplicate: true }
  }
  if (
    !existing ||
    existing.status === 'cancelled' ||
    existing.reference ||
    existing.paymentStatus === 'paid' ||
    previousPayment?.status === 'Submitted for Verification' ||
    previousPayment?.status === 'Verified' ||
    existing.paymentOrderId ||
    existing.paymentProvider === 'razorpay'
  ) {
    throwUpiConflict()
  }

  const amount = Number(pricing?.finalAmount)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(Number(pricing?.paymentAmountPaise))) {
    throw Object.assign(new Error('The booking amount could not be verified.'), { status: 409 })
  }

  const payment = {
    bookingId: requestId,
    customerId: existing.customerId ?? '',
    eventId: existing.eventId ?? '',
    amount,
    upiId,
    utr: normalizedUtr,
    paymentMethod: 'UPI',
    status: 'Submitted for Verification',
    submittedAt: now,
  }
  try {
    const updated = await bookingEnquiryModel.findOneAndUpdate(
      {
        requestId,
        status: { $ne: 'cancelled' },
        paymentStatus: { $in: ['unpaid', 'failed'] },
        $and: [
          { $or: [{ reference: { $exists: false } }, { reference: '' }] },
          { $or: [{ paymentOrderId: { $exists: false } }, { paymentOrderId: '' }] },
          { 'upiPayments.status': { $ne: 'Submitted for Verification' } },
        ],
        expiresAt: { $gt: now },
      },
      {
        $push: { upiPayments: payment },
        $set: {
          paymentAmount: amount,
          paymentAmountPaise: Math.round(Number(pricing.paymentAmountPaise)),
          finalAmount: amount,
          ticketType: pricing.ticketType,
          ticketTypeName: pricing.ticketTypeName,
          ticketQuantity: pricing.ticketQuantity,
          pricePerTicket: pricing.pricePerTicket,
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          regularPrice: pricing.regularPrice,
          offerPrice: pricing.offerPrice,
          diwaliOfferApplied: Boolean(pricing.diwaliOfferApplied),
          offerActivationAt: pricing.offerActivationAt ?? null,
          offerExpiresAt: pricing.offerExpiresAt ?? null,
          paymentStatus: 'processing',
          paymentProvider: 'upi',
          paymentFailureReason: '',
          expiresAt: null,
        },
      },
      { new: true, runValidators: true },
    ).lean()
    if (updated) {
      return { enquiry: updated, duplicate: false }
    }
  } catch (error) {
    if (error.code === 11000) {
      throwUpiConflict('This UPI transaction reference has already been submitted.')
    }
    throw error
  }

  const latest = await bookingEnquiryModel.findOne({ requestId }).lean()
  if (latest && latestUpiPayment(latest)?.utr === normalizedUtr) {
    return { enquiry: latest, duplicate: true }
  }
  throwUpiConflict()
}

export async function verifyBookingEnquiryUpiPayment(
  requestId,
  { decision, rejectionReason = '', adminId = '' },
  {
    bookingEnquiryModel = BookingEnquiry,
    allocateReference = nextBookingReference,
    now = new Date(),
  } = {},
) {
  if (!['approve', 'reject'].includes(decision)) {
    throw Object.assign(new Error('Choose approve or reject for this UPI payment.'), { status: 400 })
  }
  if (decision === 'reject' && !rejectionReason.trim()) {
    throw Object.assign(new Error('Provide a reason when rejecting a UPI payment.'), { status: 400 })
  }

  const existing = await bookingEnquiryModel.findOne({ requestId }).lean()
  const payment = latestUpiPayment(existing)
  if (
    payment?.status === 'Verified' &&
    existing.reference &&
    decision === 'approve'
  ) {
    return { enquiry: existing, duplicate: true }
  }
  if (!existing || payment?.status !== 'Submitted for Verification') {
    throwUpiConflict('This UPI payment is no longer awaiting verification.')
  }

  const reference = decision === 'approve' ? await allocateReference() : ''
  const paymentPath = `upiPayments.${existing.upiPayments.length - 1}`
  const updates = {
    [`${paymentPath}.status`]: decision === 'approve' ? 'Verified' : 'Rejected',
    [`${paymentPath}.adminVerifiedAt`]: now,
    [`${paymentPath}.adminId`]: adminId,
    [`${paymentPath}.rejectionReason`]: decision === 'reject' ? rejectionReason.trim() : '',
    paymentStatus: decision === 'approve' ? 'paid' : 'failed',
    paymentProvider: 'upi',
    paymentFailureReason: decision === 'reject' ? 'failed' : '',
  }
  if (decision === 'approve') {
    Object.assign(updates, {
      reference,
      status: 'confirmed',
      paymentReference: payment.utr,
      paidAt: now,
      paymentVerifiedAt: now,
      expiresAt: null,
    })
  }

  const result = await bookingEnquiryModel.findOneAndUpdate(
    {
      requestId,
      status: { $ne: 'cancelled' },
      [`${paymentPath}.utr`]: payment.utr,
      [`${paymentPath}.status`]: 'Submitted for Verification',
    },
    { $set: updates },
    { new: true, runValidators: true },
  ).lean()
  if (result) {
    return { enquiry: result, duplicate: false }
  }

  const current = await bookingEnquiryModel.findOne({ requestId }).lean()
  if (decision === 'approve' && current?.reference && latestUpiPayment(current)?.status === 'Verified') {
    return { enquiry: current, duplicate: true }
  }
  throwUpiConflict('The UPI payment changed while it was being reviewed. Refresh and retry.')
}
