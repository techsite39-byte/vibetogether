import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Download,
  MapPin,
  Printer,
  Ticket,
  UsersRound,
} from 'lucide-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import useBookings from '../hooks/useBookings.js'
import { isPaymentBackendConfigured } from '../config/booking.js'
import { events } from '../data/events.js'
import { verifyPayment } from '../services/paymentCheckout.js'
import { getBooking } from '../services/bookingRecords.js'
import { downloadBookingTicket } from '../utils/bookingTicket.js'
import { findBooking } from '../utils/bookingStorage.js'
import NotFound from './NotFound.jsx'
import './Booking.css'

function formatEventDate(date) {
  const parsedDate = new Date(`${date}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate)
}

function formatBookingDate(date) {
  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

export default function BookingConfirmation() {
  const { bookingReference: routeReference } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const paymentReference = searchParams.get('payment_reference')
  const reference = routeReference || paymentReference
  const { bookings, error: storageError } = useBookings()
  const [verification, setVerification] = useState({
    reference: '',
    status: 'idle',
    booking: null,
    error: '',
  })
  const [bookingLookup, setBookingLookup] = useState({
    reference: '',
    status: 'idle',
    booking: null,
    error: '',
  })
  const localBooking = useMemo(
    () => (reference ? findBooking(reference, bookings) : null),
    [bookings, reference],
  )
  const stateBooking = location.state?.booking?.reference === reference
    ? location.state.booking
    : null

  useEffect(() => {
    if (!reference || paymentReference || localBooking || stateBooking) {
      return undefined
    }

    const controller = new AbortController()
    setBookingLookup({ reference, status: 'loading', booking: null, error: '' })
    getBooking(reference, controller.signal)
      .then((booking) => setBookingLookup({ reference, status: 'found', booking, error: '' }))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setBookingLookup({
            reference,
            status: 'error',
            booking: null,
            error: error instanceof Error ? error.message : 'Booking details could not be loaded.',
          })
        }
      })
    return () => controller.abort()
  }, [localBooking, paymentReference, reference, stateBooking])

  useEffect(() => {
    if (
      !paymentReference ||
      localBooking ||
      !isPaymentBackendConfigured
    ) {
      return undefined
    }

    const controller = new AbortController()

    verifyPayment(paymentReference, controller.signal)
      .then((result) => {
        if (
          result.verified !== true ||
          result.paymentStatus !== 'paid' ||
          result.booking?.status !== 'confirmed'
        ) {
          setVerification({
            reference: paymentReference,
            status: 'unverified',
            booking: null,
            error: '',
          })
          return
        }

        if (
          !result.booking ||
          typeof result.booking.reference !== 'string' ||
          result.booking.reference !== paymentReference ||
          !result.booking.event ||
          !result.booking.attendee ||
          !Number.isInteger(result.booking.ticketCount)
        ) {
          throw new Error(
            'The booking service returned an incomplete verified booking.',
          )
        }

        setVerification({
          reference: paymentReference,
          status: 'verified',
          booking: result.booking,
          error: '',
        })
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return
        }

        setVerification({
          reference: paymentReference,
          status: 'error',
          booking: null,
          error:
            error instanceof Error
              ? error.message
              : 'Payment verification could not be completed.',
        })
      })

    return () => controller.abort()
  }, [localBooking, paymentReference])

  if (!reference) {
    return <NotFound />
  }

  const currentVerification =
    verification.reference === paymentReference ? verification : null
  const currentLookup =
    bookingLookup.reference === reference ? bookingLookup : null
  const booking = localBooking ?? stateBooking ?? currentLookup?.booking ?? currentVerification?.booking ?? null
  const isPendingVerification =
    Boolean(paymentReference) &&
    !localBooking &&
    isPaymentBackendConfigured &&
    (!currentVerification || currentVerification.status === 'idle')
  const isVerifiedPayment =
    currentVerification?.status === 'verified' && Boolean(booking)

  if (!booking && isPendingVerification) {
    return (
      <Container className="booking-result">
        <div className="booking-result__status-icon booking-result__status-icon--pending">
          <Ticket size={28} aria-hidden="true" />
        </div>
        <p className="booking-page__eyebrow">Secure payment check</p>
        <h1>Verifying your booking.</h1>
        <p>
          Your payment provider is checking the transaction with the booking
          service. This page will show a confirmation only after the backend
          verifies it.
        </p>
        <Button to="/my-bookings" variant="outline">
          View my bookings
        </Button>
      </Container>
    )
  }

  if (!booking && currentVerification?.status === 'error') {
    return (
      <Container className="booking-result">
        <div className="booking-alert booking-alert--error" role="alert">
          {currentVerification.error}
        </div>
        <p>
          This page cannot confirm a paid booking without a verified response
          from the booking backend.
        </p>
        <Button to="/my-bookings" variant="outline">
          View my bookings
        </Button>
      </Container>
    )
  }

  if (!booking && currentLookup?.status === 'loading') {
    return (
      <Container className="booking-result" aria-live="polite">
        <p className="booking-page__eyebrow">Booking reference</p>
        <h1>Loading your booking.</h1>
      </Container>
    )
  }

  if (!booking) {
    return (
      <Container className="booking-result">
        <p className="booking-page__eyebrow">Booking reference</p>
        <h1>Booking details aren’t available.</h1>
        <p>
          {currentLookup?.error || 'The booking service could not find this reference.'}
          {storageError && ` ${storageError}`}
        </p>
        <Button to="/my-bookings" variant="outline">
          View my bookings
        </Button>
      </Container>
    )
  }

  const event = events.find((item) => item.id === booking.eventId)
  const eventInfo = booking.event ?? event
  const isCancelled = booking.status === 'cancelled'
  const isPaid = booking.paymentStatus === 'paid' && isVerifiedPayment

  if (!eventInfo || !booking.attendee) {
    return <NotFound />
  }

  function printTicket() {
    window.print()
  }

  return (
    <div className="booking-confirmation">
      <Container className="booking-confirmation__container">
        <div
          className={`booking-result__status-icon${
            isCancelled
              ? ' booking-result__status-icon--cancelled'
              : ' booking-result__status-icon--success'
          }`}
          aria-hidden="true"
        >
          {isCancelled ? <Ticket size={28} /> : <Check size={28} />}
        </div>
        <p className="booking-page__eyebrow">
          {isCancelled ? 'Reservation cancelled' : 'You’re on the list'}
        </p>
        <h1>
          {isCancelled
            ? 'This booking has been cancelled.'
            : 'Your next memory is official.'}
        </h1>
        <p className="booking-confirmation__lead">
          {isCancelled
            ? 'This ticket is no longer valid. The released seats can be booked by someone else.'
            : 'Keep this ticket handy. Your event details and booking reference are below.'}
        </p>

        {storageError && (
          <p className="booking-alert booking-alert--info" role="status">
            {storageError}
          </p>
        )}
        {location.state?.referenceStorageWarning && (
          <p className="booking-alert booking-alert--info" role="status">
            {location.state.referenceStorageWarning} Save this reference to access your ticket later.
          </p>
        )}

        <article className="booking-ticket glass-card">
          <div className="booking-ticket__top">
            <div>
              <span className="booking-ticket__eyebrow">VIBE TOGETHER</span>
              <h2>{eventInfo.title}</h2>
              <p>{eventInfo.category}</p>
            </div>
            <span
              className={`booking-ticket__status${
                isCancelled
                  ? ' booking-ticket__status--cancelled'
                  : ' booking-ticket__status--confirmed'
              }`}
            >
              {isCancelled
                ? 'Cancelled'
                : isPaid
                  ? 'Paid · verified'
                  : 'Confirmed · free'}
            </span>
          </div>
          {eventInfo.image && (
            <img
              className="booking-ticket__image"
              src={eventInfo.image}
              alt={eventInfo.imageAlt ?? ''}
            />
          )}
          <div className="booking-ticket__reference">
            <span>Booking reference</span>
            <strong>{booking.reference}</strong>
          </div>
          <div className="booking-ticket__details">
            <p>
              <CalendarDays size={17} aria-hidden="true" />
              {formatEventDate(eventInfo.date)}
            </p>
            <p>
              <Clock3 size={17} aria-hidden="true" />
              {eventInfo.time}
            </p>
            <p>
              <MapPin size={17} aria-hidden="true" />
              {eventInfo.location}
            </p>
            <p>
              <UsersRound size={17} aria-hidden="true" />
              {booking.ticketCount}{' '}
              {booking.ticketCount === 1 ? 'attendee' : 'attendees'}
            </p>
          </div>
          <div className="booking-ticket__attendee">
            <span>Booked for</span>
            <strong>{booking.attendee.fullName}</strong>
            {booking.attendee.email && (
              <a href={`mailto:${booking.attendee.email}`}>
                {booking.attendee.email}
              </a>
            )}
            {booking.attendee.mobile && <span>{booking.attendee.mobile}</span>}
          </div>
          <div className="booking-ticket__footer">
            <div>
              <span>Payment status</span>
              <strong>
                {isCancelled
                  ? isPaid
                    ? 'Paid · contact support about cancellation'
                    : 'Not charged · free booking'
                  : isPaid
                    ? 'Paid · verified by booking backend'
                    : 'Not required · free event'}
              </strong>
            </div>
            <div>
              <span>Booking date</span>
              <strong>{formatBookingDate(booking.createdAt)}</strong>
            </div>
          </div>
        </article>

        <div className="booking-confirmation__actions">
          {!isCancelled && (
            <>
              <Button
                type="button"
                onClick={() => downloadBookingTicket(booking)}
              >
                <Download size={17} aria-hidden="true" />
                Download ticket
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={printTicket}
              >
                <Printer size={17} aria-hidden="true" />
                Print ticket
              </Button>
            </>
          )}
          <Button to="/my-bookings" variant="secondary">
            View my bookings
          </Button>
          <Link className="booking-page__back" to="/events">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to events
          </Link>
        </div>
      </Container>
    </div>
  )
}
