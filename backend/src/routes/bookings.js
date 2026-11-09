import { Router } from 'express'
import { Booking, BookingReferenceCounter } from '../models/adminRecords.js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { Event } from '../models/event.js'
import { nextBookingReference } from '../services/bookingReferences.js'

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const mobilePattern = /^\+?[0-9][0-9\s().-]{6,23}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const windowMs = 15 * 60 * 1000
const maxRequests = 8

function createRateLimiter() {
  const clients = new Map()
  return function rateLimit(request, response, next) {
    const now = Date.now()
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    const current = clients.get(key)
    const record =
      !current || now - current.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : current
    record.count += 1
    clients.set(key, record)

    if (record.count > maxRequests) {
      response.set('Retry-After', String(windowMs / 1000))
      response.status(429).json({ message: 'Too many booking requests. Try again later.' })
      return
    }
    next()
  }
}

function normalizeText(value, maximumLength) {
  if (typeof value !== 'string') {
    return ''
  }
  const text = value.normalize('NFKC').trim()
  return (
    text.length <= maximumLength &&
    ![...text].some((character) => {
      const codePoint = character.codePointAt(0)
      return character === '<' || character === '>' || codePoint <= 31 || codePoint === 127
    })
  )
    ? text
    : ''
}

function sameRequest(booking, input) {
  return (
    booking.eventId === input.eventId &&
    booking.attendee.fullName === input.attendee.fullName &&
    booking.attendee.email === input.attendee.email &&
    booking.attendee.mobile === input.attendee.mobile &&
    booking.ticketCount === input.ticketCount
  )
}

function publicBooking(booking) {
  return {
    reference: booking.reference,
    eventId: booking.eventId,
    event: booking.event,
    attendee: { fullName: booking.attendee.fullName },
    ticketCount: booking.ticketCount,
    subtotal: booking.subtotal,
    fees: booking.fees,
    total: booking.total,
    currency: booking.currency,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt,
  }
}

async function validateRequest(body, eventModel) {
  const eventId = normalizeText(body?.eventId, 80)
  const fullName = normalizeText(body?.attendee?.fullName, 80)
  const email = normalizeText(body?.attendee?.email, 254).toLowerCase()
  const mobile = normalizeText(body?.attendee?.mobile, 24)
  const specialRequests = normalizeText(body?.specialRequests ?? '', 1000)
  const ticketCount = body?.ticketCount

  if (typeof body?.requestId !== 'string' || !requestIdPattern.test(body.requestId)) {
    return { error: 'The booking request could not be verified. Please retry.' }
  }
  if (eventId.length < 1) {
    return { error: 'Choose an available event.' }
  }
  if (fullName.length < 2) {
    return { error: 'Enter a valid full name.' }
  }
  if (!emailPattern.test(email)) {
    return { error: 'Enter a valid email address.' }
  }
  if (
    !mobilePattern.test(mobile) ||
    mobile.replace(/\D/g, '').length < 7 ||
    mobile.replace(/\D/g, '').length > 15
  ) {
    return { error: 'Enter a valid mobile number.' }
  }
  if (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > 20) {
    return { error: 'Choose between 1 and 20 attendees.' }
  }
  if (typeof body?.specialRequests === 'string' && !specialRequests && body.specialRequests.trim()) {
    return { error: 'Special requests are not valid.' }
  }

  const event = await eventModel.findOne({ id: eventId, status: 'published' }).lean()
  if (!event) {
    return { error: 'The selected event is not available.' }
  }
  if (!event.isFree || event.priceAmount > 0) {
    return { error: 'Online payment is not available for this event.' }
  }

  return {
    value: {
      requestId: body.requestId,
      eventId,
      event,
      attendee: { fullName, email, mobile },
      ticketCount,
      specialRequests,
    },
  }
}

export function createBookingsRouter({
  bookingModel = Booking,
  eventModel = Event,
  bookingReferenceCounterModel = BookingReferenceCounter,
} = {}) {
  const router = Router()
  const rateLimit = createRateLimiter()

  router.post('/', rateLimit, async (request, response, next) => {
    let reservedEventId = ''
    let reservedSeats = 0
    try {
      const validation = await validateRequest(request.body, eventModel)
      if (validation.error) {
        response.status(400).json({ message: validation.error })
        return
      }

      const input = validation.value
      const existing = await bookingModel.findOne({ requestId: input.requestId }).lean()
      if (existing) {
        if (!sameRequest(existing, input)) {
          response.status(409).json({ message: 'This request ID was used for different booking details.' })
          return
        }
        response.status(200).json({ booking: publicBooking(existing), duplicate: true })
        return
      }

      const updatedEvent = await eventModel.findOneAndUpdate(
        {
          id: input.eventId,
          status: 'published',
          isFree: true,
          seatsAvailable: { $gte: input.ticketCount },
        },
        { $inc: { seatsAvailable: -input.ticketCount } },
        { new: true },
      ).lean()
      if (!updatedEvent) {
        response.status(409).json({ message: 'There are not enough seats remaining for this event.' })
        return
      }

      reservedEventId = input.eventId
      reservedSeats = input.ticketCount
      const eventSnapshot = {
        ...input.event,
        seatsAvailable: updatedEvent.seatsAvailable,
      }
      const reference = await nextBookingReference({
        bookingModel,
        bookingEnquiryModel: BookingEnquiry,
        counterModel: bookingReferenceCounterModel,
      })
      const booking = await bookingModel.create({
        ...input,
        reference,
        event: eventSnapshot,
        subtotal: 0,
        fees: 0,
        total: 0,
        currency: input.event.currency || 'INR',
        paymentStatus: 'not_required',
        status: 'confirmed',
      })
      reservedEventId = ''
      reservedSeats = 0
      response.status(201).json({ booking: publicBooking(booking), duplicate: false })
    } catch (error) {
      if (reservedEventId && reservedSeats) {
        await eventModel.updateOne(
          { id: reservedEventId },
          { $inc: { seatsAvailable: reservedSeats } },
        )
      }
      if (error.code === 11000) {
        try {
          const duplicate = await bookingModel.findOne({
            requestId: request.body?.requestId,
          }).lean()
          if (duplicate) {
            const validation = await validateRequest(request.body, eventModel)
            if (validation.value && sameRequest(duplicate, validation.value)) {
              response.status(200).json({ booking: publicBooking(duplicate), duplicate: true })
              return
            }
          }
        } catch (lookupError) {
          next(lookupError)
          return
        }
      }
      next(error)
    }
  })

  router.get('/:reference', async (request, response, next) => {
    try {
      const booking = await bookingModel.findOne({
        reference: request.params.reference,
      }).lean()
      if (!booking) {
        response.status(404).json({ message: 'Booking was not found.' })
        return
      }
      response.json({ booking: publicBooking(booking) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:reference/cancel', rateLimit, async (request, response, next) => {
    try {
      let booking = await bookingModel.findOne({ reference: request.params.reference }).exec()
      if (!booking) {
        response.status(404).json({ message: 'Booking was not found.' })
        return
      }
      if (booking.status === 'cancelled') {
        response.json({ booking: publicBooking(booking) })
        return
      }
      if (booking.paymentStatus !== 'not_required') {
        response.status(409).json({ message: 'Paid bookings must be cancelled by the payment service.' })
        return
      }
      const cancelled = await bookingModel.findOneAndUpdate(
        {
          reference: request.params.reference,
          status: { $ne: 'cancelled' },
          paymentStatus: 'not_required',
        },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
        { new: true },
      ).exec()
      if (cancelled) {
        await eventModel.updateOne(
          { id: cancelled.eventId },
          { $inc: { seatsAvailable: cancelled.ticketCount } },
        )
        booking = cancelled
      } else {
        booking = await bookingModel.findOne({ reference: request.params.reference }).exec()
        if (!booking || booking.status !== 'cancelled') {
          response.status(409).json({ message: 'The booking status changed. Refresh and retry.' })
          return
        }
      }
      response.json({ booking: publicBooking(booking) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
