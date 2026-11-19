import { BookingResult } from '../models/bookingResult.js'

function execute(query) {
  return typeof query?.lean === 'function' ? query.lean() : query
}

function createResult(booking, details, now) {
  const amount = Number(
    booking.paymentAmount ?? booking.finalAmount ?? booking.subtotal ?? 0,
  )

  if (!booking.requestId || !Number.isFinite(amount) || amount < 0) {
    throw new Error('Booking result is missing a valid request ID or amount.')
  }

  return {
    bookingReference: booking.reference || booking.bookingReference || '',
    customerName: booking.name,
    customerMobile: booking.mobile,
    customerEmail: booking.email || '',
    eventId: booking.eventId || '',
    eventName: booking.event || '',
    ticketType: booking.ticketType || '',
    ticketTypeName: booking.ticketTypeName || '',
    ticketQuantity: Number(booking.ticketQuantity || 1),
    amount,
    currency: details.currency || 'INR',
    paymentProvider: details.paymentProvider,
    providerPaymentId: details.providerPaymentId || '',
    providerOrderId: details.providerOrderId || '',
    paymentStatus: ['paid', 'failed'].includes(booking.paymentStatus)
      ? booking.paymentStatus
      : details.paymentStatus,
    bookingStatus: booking.status || 'pending',
    failureReason: details.paymentStatus === 'FAILED'
      ? details.failureReason || booking.paymentFailureReason || 'failed'
      : '',
    failureCode: details.paymentStatus === 'FAILED' ? details.failureCode || '' : '',
    updatedAt: now,
  }
}

export async function persistBookingResult(
  booking,
  details,
  {
    bookingResultModel = BookingResult,
    session,
    now = new Date(),
  } = {},
) {
  if (!booking || !['SUCCESS', 'FAILED'].includes(details?.paymentStatus)) {
    throw new Error('A booking and terminal payment status are required.')
  }

  const fields = createResult(booking, details, now)
  const identity = { requestId: booking.requestId }
  const createdAt = booking.createdAt ? new Date(booking.createdAt) : now

  if (details.paymentStatus === 'FAILED') {
    const updated = await execute(
      bookingResultModel.findOneAndUpdate(
        { ...identity, paymentStatus: { $nin: ['SUCCESS', 'paid'] } },
        { $set: fields },
        { new: true, runValidators: true, session },
      ),
    )
    if (updated) return updated

    try {
      return await execute(
        bookingResultModel.findOneAndUpdate(
          identity,
          {
            $setOnInsert: {
              requestId: booking.requestId,
              ...fields,
              createdAt,
            },
          },
          { new: true, upsert: true, runValidators: true, session },
        ),
      )
    } catch (error) {
      if (error?.code !== 11000) throw error
      const existingQuery = bookingResultModel.findOne(identity)
      const existing = await execute(
        session && typeof existingQuery?.session === 'function'
          ? existingQuery.session(session)
          : existingQuery,
      )
      if (!existing) throw error
      return existing
    }
  }

  const successUpdate = {
    $set: fields,
    $unset: { expiresAt: 1 },
    $setOnInsert: {
      requestId: booking.requestId,
      createdAt,
    },
  }

  try {
    return await execute(
      bookingResultModel.findOneAndUpdate(
        identity,
        successUpdate,
        { new: true, upsert: true, runValidators: true, session },
      ),
    )
  } catch (error) {
    if (error?.code !== 11000) throw error
    const updated = await execute(
      bookingResultModel.findOneAndUpdate(
        identity,
        { $set: fields, $unset: { expiresAt: 1 } },
        { new: true, runValidators: true, session },
      ),
    )
    if (!updated) throw error
    return updated
  }
}
