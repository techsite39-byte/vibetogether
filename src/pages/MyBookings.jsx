import { useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Ticket,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import useBookings from '../hooks/useBookings.js'
import { events } from '../data/events.js'
import { cancelBooking as cancelBookingRecord } from '../services/bookingRecords.js'
import { getResponsiveImageSrcSet } from '../utils/responsiveImage.js'
import './Booking.css'

const CURRENT_TIMESTAMP = Date.now()

function getEvent(booking) {
  const event = events.find((item) => item.id === booking.eventId)
  if (event) return event
  if (booking.event && typeof booking.event === 'object') return booking.event
  if (booking.event || booking.category) {
    return {
      title: booking.event || booking.category,
      category: booking.category || '',
      date: '',
      time: '',
      location: '',
    }
  }
  return null
}

function getEventTimestamp(booking) {
  const event = getEvent(booking)
  const timestamp = new Date(event?.startsAt ?? event?.date ?? '').getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function formatEventDate(date) {
  const parsedDate = new Date(`${date}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate)
}

function BookingCard({ booking, canCancel, onCancel }) {
  const event = getEvent(booking)
  const [confirming, setConfirming] = useState(false)

  if (!event) {
    return null
  }

  const isCancelled = booking.status === 'cancelled'
  const upiStatus = booking.upiPayment?.status
  const paymentLabel = upiStatus === 'Submitted for Verification'
    ? 'Awaiting verification'
    : upiStatus === 'Rejected'
      ? 'Payment rejected'
      : upiStatus === 'Verified' || ['paid', 'verified'].includes(booking.paymentStatus)
        ? 'Paid'
        : booking.paymentStatus === 'not_required'
          ? 'Confirmed · free'
          : 'Awaiting payment'
  const paymentIsPending = ['Awaiting verification', 'Awaiting payment'].includes(paymentLabel)

  return (
    <article className="my-booking-card glass-card">
      {event.image && (
        <img
          className="my-booking-card__image"
          src={event.image}
          srcSet={getResponsiveImageSrcSet(event.image)}
          sizes="(max-width: 48rem) 100vw, 50vw"
          alt={event.imageAlt ?? ''}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="my-booking-card__body">
        <div className="my-booking-card__topline">
          <span className="my-booking-card__category">{event.category}</span>
          <span
            className={`booking-ticket__status${
              isCancelled
                ? ' booking-ticket__status--cancelled'
                : paymentIsPending
                  ? ' booking-ticket__status--pending'
                  : ' booking-ticket__status--confirmed'
            }`}
          >
              {isCancelled ? 'Cancelled' : paymentLabel}
          </span>
        </div>
        <h3>{event.title}</h3>
        <div className="my-booking-card__details">
          {event.date && <span>
            <CalendarDays size={16} aria-hidden="true" />
            {formatEventDate(event.date)}
          </span>}
          {event.time && <span>
            <Clock3 size={16} aria-hidden="true" />
            {event.time}
          </span>}
          {event.location && <span>
            <MapPin size={16} aria-hidden="true" />
            {event.location}
          </span>}
          <span>
            <UsersRound size={16} aria-hidden="true" />
            {booking.ticketCount}{' '}
            {booking.ticketCount === 1 ? 'attendee' : 'attendees'}
          </span>
        </div>
        <p className="my-booking-card__reference">
          Reference <strong>{booking.reference}</strong>
        </p>
        <div className="my-booking-card__actions">
          {booking.status === 'confirmed' ? (
            <Button
              to={`/booking/confirmation/${encodeURIComponent(booking.reference)}`}
              variant="outline"
            >
              <Ticket size={16} aria-hidden="true" />
              View ticket
            </Button>
          ) : booking.requestId ? (
            <Button
              to={`/booking/payment/${encodeURIComponent(booking.requestId)}`}
              variant="outline"
            >
              <Ticket size={16} aria-hidden="true" />
              View payment status
            </Button>
          ) : null}
          {canCancel && !isCancelled && booking.paymentStatus === 'not_required' && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming((current) => !current)}
            >
              Cancel booking
            </Button>
          )}
        </div>
        {confirming && !isCancelled && (
          <div
            className="my-booking-card__confirm"
            role="group"
            aria-label={`Confirm cancellation for ${event.title}`}
          >
            <p>
              Cancel this reservation? {booking.ticketCount}{' '}
              {booking.ticketCount === 1 ? 'seat will' : 'seats will'} be
              released.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              Keep booking
            </Button>
            <Button
              type="button"
              onClick={() => {
                onCancel(booking.reference)
                setConfirming(false)
              }}
            >
              Confirm cancellation
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

export default function MyBookings() {
  const { bookings, error, loading, refresh } = useBookings()
  const [actionError, setActionError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const upcoming = bookings.filter(
    (booking) =>
      booking.status === 'confirmed' &&
      getEventTimestamp(booking) >= CURRENT_TIMESTAMP,
  )
  const past = bookings.filter(
    (booking) =>
      booking.status === 'confirmed' &&
      getEventTimestamp(booking) < CURRENT_TIMESTAMP,
  )
  const cancelled = bookings.filter((booking) => booking.status === 'cancelled')
  const awaitingPayment = bookings.filter(
    (booking) =>
      booking.status === 'pending' &&
      booking.paymentStatus !== 'not_required' &&
      booking.paymentStatus !== 'paid',
  )

  async function cancelBooking(reference) {
    setActionError('')
    setStatusMessage('')

    try {
      await cancelBookingRecord(reference)
      refresh()
      setStatusMessage('Booking cancelled. The seats have been released.')
    } catch (cancelError) {
      setActionError(
        cancelError instanceof Error
          ? cancelError.message
          : 'The booking could not be cancelled.',
      )
    }
  }

  function renderGroup(title, description, items, allowCancellation = false) {
    return (
      <section className="my-bookings__section" aria-label={title}>
        <div className="my-bookings__section-heading">
          <div>
            <p className="booking-page__eyebrow">Your plans</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <span className="my-bookings__count">
            {items.length} {items.length === 1 ? 'booking' : 'bookings'}
          </span>
        </div>
        {items.length > 0 ? (
          <div className="my-bookings__grid">
            {items.map((booking) => (
              <BookingCard
                booking={booking}
                canCancel={allowCancellation}
                key={booking.reference}
                onCancel={cancelBooking}
              />
            ))}
          </div>
        ) : (
          <div className="my-bookings__empty">
            <Ticket size={22} aria-hidden="true" />
            <p>No bookings here yet.</p>
            <Link to="/events">
              Explore events <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="my-bookings">
      <section className="booking-page__intro">
        <Container>
          <p className="booking-page__eyebrow">Your plans</p>
          <h1>My <span className="gradient-text">bookings.</span></h1>
          <p>
            Find your event details, tickets, and booking references in one
            place.
          </p>
          <p className="my-bookings__notice" role="note">
            Your booking details are retrieved from the platform using
            references saved on this device.
          </p>
        </Container>
      </section>

      <Container className="my-bookings__content">
        {error && (
          <p className="booking-alert booking-alert--error" role="alert">
            {error}
          </p>
        )}
        {actionError && (
          <p className="booking-alert booking-alert--error" role="alert">
            {actionError}
          </p>
        )}
        {statusMessage && (
          <p className="booking-alert booking-alert--success" role="status">
            {statusMessage}
          </p>
        )}
        {loading && <p role="status">Loading your saved bookings…</p>}
        {!loading && (
          <>
        {awaitingPayment.length > 0 &&
          renderGroup(
            'Payments awaiting confirmation',
            'Your booking will be confirmed only after the payment is verified.',
            awaitingPayment,
          )}
        {renderGroup(
          'Upcoming bookings',
          'The next experiences on your calendar.',
          upcoming,
          true,
        )}
        {renderGroup('Past bookings', 'A little history of where you’ve been.', past)}
        {cancelled.length > 0 &&
          renderGroup(
            'Cancelled bookings',
            'Reservations you chose not to keep.',
            cancelled,
          )}
          </>
        )}
      </Container>
    </div>
  )
}
