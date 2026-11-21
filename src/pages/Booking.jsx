import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  LockKeyhole,
  Minus,
  Plus,
  Ticket,
  UsersRound,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import FormField from '../components/common/FormField.jsx'
import { bookingConfig } from '../config/booking.js'
import {
  calculateBookingTotals,
  formatBookingAmount,
} from '../utils/bookingTotals.js'
import {
  rememberBookingReference,
} from '../utils/bookingStorage.js'
import { getResponsiveImageSrcSet } from '../utils/responsiveImage.js'
import { submitBookingEnquiry } from '../services/bookingEnquiry.js'
import { createBooking } from '../services/bookingRecords.js'
import usePublicEvents from '../hooks/usePublicEvents.js'
import NotFound from './NotFound.jsx'
import './Booking.css'

const initialForm = {
  fullName: '',
  mobile: '',
  ticketCount: 1,
}

function normalizeIndiaMobile(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `+91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`
  }
  return value?.trim()?.startsWith('+') ? value.trim() : `+91${digits}`
}

function validateBookingInputs(form, availableSeats) {
  const errors = {}
  const name = (form.fullName || '').trim()
  const phoneDigits = (form.mobile || '').replace(/\D/g, '')
  const ticketCount = Number(form.ticketCount)

  if (name.length < 2 || name.length > 100) {
    errors.fullName = 'Enter your full name (2 to 100 characters).'
  }

  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    errors.mobile = 'Enter a valid 10-digit mobile number.'
  }

  if (!Number.isInteger(ticketCount) || ticketCount < 1) {
    errors.ticketCount = 'Choose at least 1 ticket.'
  } else if (ticketCount > availableSeats) {
    errors.ticketCount = `Only ${availableSeats} ${
      availableSeats === 1 ? 'seat is' : 'seats are'
    } available.`
  }

  return errors
}

export default function Booking() {
  const { eventId: routeEventId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const stateEventId = location.state?.eventId
  const [selectedEventId, setSelectedEventId] = useState(
    routeEventId || stateEventId || '',
  )
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { events: availableEvents, error: eventsError, loading: eventsLoading } = usePublicEvents()
  const searchParams = new URLSearchParams(location.search)
  const queryEventId = searchParams.get('eventId') || searchParams.get('event')
  const queryCategory = searchParams.get('category')

  const categoryMatchedEventId = queryCategory
    ? availableEvents.find(
        (item) =>
          (item.category || '').toLowerCase() === queryCategory.toLowerCase() &&
          (item.seatsAvailable ?? 0) > 0,
      )?.id
    : ''

  const defaultAvailableEventId =
    availableEvents.find((item) => (item.seatsAvailable ?? 0) > 0)?.id ||
    availableEvents[0]?.id ||
    ''

  const requestId = useRef(crypto.randomUUID())
  const eventId =
    routeEventId ||
    stateEventId ||
    selectedEventId ||
    queryEventId ||
    categoryMatchedEventId ||
    defaultAvailableEventId
  const event = availableEvents.find((item) => item.id === eventId)
  const invalidRequestedEvent =
    !eventsLoading &&
    ((Boolean(routeEventId) && !event) ||
      Boolean(stateEventId && !availableEvents.some((item) => item.id === stateEventId)))
  const availableSeats = event ? event.seatsAvailable ?? 0 : 0
  const ticketCount = Number(form.ticketCount)
  const totals = event
    ? calculateBookingTotals(event, ticketCount)
    : { subtotal: 0, fees: 0, total: 0, currency: bookingConfig.currency }

  if (invalidRequestedEvent && !event && !eventsError) {
    return <NotFound />
  }

  function updateForm(field, value) {
    requestId.current = crypto.randomUUID()
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) {
        return current
      }
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
    setSubmitError('')
  }

  function validateField(field) {
    const nextErrors = validateBookingInputs(form, availableSeats)
    setErrors((current) => {
      const updatedErrors = { ...current }
      if (nextErrors[field]) {
        updatedErrors[field] = nextErrors[field]
      } else {
        delete updatedErrors[field]
      }
      return updatedErrors
    })
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault()
    if (isSubmitting) {
      return
    }
    setSubmitError('')

    const nextErrors = validateBookingInputs(form, availableSeats)
    setErrors(nextErrors)
    setHasSubmitted(true)

    if (Object.keys(nextErrors).length > 0 || !event) {
      return
    }

    if (availableSeats < 1) {
      setSubmitError('This event is full. Please explore another event.')
      return
    }

    setIsSubmitting(true)

    try {
      const normalizedMobile = normalizeIndiaMobile(form.mobile)
      const attendee = {
        fullName: form.fullName.trim(),
        email: '',
        mobile: normalizedMobile,
      }

      if (event.isFree) {
        const booking = await createBooking({
          requestId: requestId.current,
          eventId: event.id,
          attendee,
          specialRequests: '',
          ticketCount,
        })
        let referenceStorageWarning = ''
        try {
          rememberBookingReference(booking.reference)
        } catch (error) {
          referenceStorageWarning =
            error instanceof Error
              ? error.message
              : 'The booking reference could not be saved on this device.'
        }

        navigate(
          `/booking/confirmation/${encodeURIComponent(booking.reference)}`,
          {
            replace: true,
            state: { booking, referenceStorageWarning },
          },
        )
        return
      }

      // Paid booking flow: submit booking enquiry and navigate to payment page
      const enquiryResult = await submitBookingEnquiry({
        requestId: requestId.current,
        name: attendee.fullName,
        email: '',
        mobile: normalizedMobile,
        eventId: event.id,
        ticketQuantity: ticketCount,
        maleCount: ticketCount,
        femaleCount: 0,
        maleMemberNames: Array(ticketCount).fill(attendee.fullName),
        femaleMemberNames: [],
      })

      const targetRequestId = enquiryResult?.booking?.requestId || requestId.current
      navigate(`/booking/payment/${encodeURIComponent(targetRequestId)}`, {
        state: {
          eventId: event.id,
          attendee,
          ticketCount,
        },
      })
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'The booking could not be completed. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeFieldError = (field) =>
    hasSubmitted || errors[field] ? errors[field] : undefined
  const selectableEvents = routeEventId
    ? availableEvents.filter((item) => item.id === routeEventId)
    : availableEvents

  return (
    <div className="booking-page">
      <div className="booking-page__ambient" aria-hidden="true" />
      <div className="booking-page__container">
        <header className="booking-page__topbar">
          <Link className="booking-page__brand" to="/" aria-label="VibeTogether home">
            <img
              src="/assets/optimized/favicon-256-v1.webp"
              alt=""
              width="42"
              height="42"
            />
            <span>VibeTogether</span>
          </Link>
          <span className="booking-page__tagline">Music <i /> Events <i /> Together</span>
        </header>

        <section className="booking-page__hero">
          <p className="booking-page__eyebrow">BOOK YOUR SPOT</p>
          <h1>What&apos;s your name?</h1>
          <p>Let&apos;s get you registered for an amazing event!</p>
        </section>

        <form className="booking-form" onSubmit={handleSubmit} noValidate>
          <div className="booking-form__panel">
            {/* Section B: Your Details */}
            <section className="booking-form__section" aria-labelledby="attendee-title">
              <div className="booking-form__section-heading">
                <span className="booking-form__section-icon"><UsersRound size={17} aria-hidden="true" /></span>
                <h2 id="attendee-title">Your Details</h2>
              </div>

              <div className="booking-form__fields">
                <FormField
                  id="booking-full-name"
                  label="Full Name"
                  required
                  error={activeFieldError('fullName')}
                >
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      autoComplete="name"
                      maxLength={100}
                      onBlur={() => validateField('fullName')}
                      onChange={(changeEvent) =>
                        updateForm('fullName', changeEvent.target.value)
                      }
                      placeholder="Enter your full name"
                      value={form.fullName}
                    />
                  )}
                </FormField>
                <FormField
                  id="booking-mobile"
                  label="Mobile Number"
                  required
                  error={activeFieldError('mobile')}
                >
                  {(fieldProps) => (
                    <div className="booking-form__phone-wrap">
                      <span className="booking-form__country-code" aria-hidden="true">+91</span>
                      <input
                        {...fieldProps}
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={15}
                        onBlur={() => validateField('mobile')}
                        onChange={(changeEvent) =>
                          updateForm('mobile', changeEvent.target.value)
                        }
                        placeholder="Enter 10-digit mobile number"
                        type="tel"
                        value={form.mobile}
                      />
                    </div>
                  )}
                </FormField>
              </div>
            </section>

            {/* Section C: Select Event */}
            <section className="booking-form__section" aria-labelledby="event-selection-title">
              <div className="booking-form__section-heading">
                <span className="booking-form__section-icon"><CalendarDays size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="event-selection-title">Select Event</h2>
                  <p>Choose the experience you want to join.</p>
                </div>
              </div>

              {eventsLoading && <p className="booking-form__status" role="status">Loading available events…</p>}
              {eventsError && <p className="booking-alert booking-alert--error" role="alert">{eventsError}</p>}
              {!eventsLoading && !eventsError && selectableEvents.length === 0 && (
                <p className="booking-form__status">No events are available right now.</p>
              )}
              <div className="booking-form__event-grid">
                {selectableEvents.map((item) => {
                  const isSelected = item.id === event?.id
                  const isAvailable = (item.seatsAvailable ?? 0) > 0
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`booking-form__event-card${isSelected ? ' is-selected' : ''}`}
                      disabled={!isAvailable || eventsLoading}
                      key={item.id}
                      onClick={() => {
                        if (routeEventId) return
                        requestId.current = crypto.randomUUID()
                        setSelectedEventId(item.id)
                        setForm((prev) => ({
                          ...prev,
                          ticketCount: Math.min(prev.ticketCount || 1, item.seatsAvailable || 1),
                        }))
                        setErrors((prev) => {
                          const next = { ...prev }
                          delete next.ticketCount
                          return next
                        })
                        setSubmitError('')
                      }}
                      type="button"
                    >
                      <span className="booking-form__event-image-wrap">
                        <img
                          src={item.image}
                          srcSet={getResponsiveImageSrcSet(item.image)}
                          sizes="(max-width: 35rem) 50vw, (max-width: 60rem) 33vw, 25vw"
                          alt={item.imageAlt || item.title}
                          loading="lazy"
                          decoding="async"
                        />
                        {isSelected && <span className="booking-form__event-check"><Check size={14} aria-hidden="true" /></span>}
                      </span>
                      <span className="booking-form__event-info">
                        <span className="booking-form__event-title">{item.title}</span>
                        <span className="booking-form__event-category">{item.category}</span>
                        <span className="booking-form__event-price">
                          {item.isFree ? 'Free' : formatBookingAmount(item.priceAmount, item.currency)}
                        </span>
                        <span className={`booking-form__event-availability${isAvailable ? '' : ' is-unavailable'}`}>
                          <span aria-hidden="true" />
                          {isAvailable ? `${item.seatsAvailable} available` : 'Sold out'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Section D: Number of Tickets */}
            <section className="booking-form__section" aria-labelledby="ticket-count-title">
              <div className="booking-form__section-heading">
                <span className="booking-form__section-icon"><Ticket size={17} aria-hidden="true" /></span>
                <div>
                  <h2 id="ticket-count-title">Number of Tickets</h2>
                  <p>{event ? `${availableSeats} ${availableSeats === 1 ? 'seat is' : 'seats are'} currently available.` : 'Select an event to see availability.'}</p>
                </div>
              </div>
              <FormField
                id="booking-ticket-count"
                label="Tickets"
                required
                error={activeFieldError('ticketCount')}
              >
                {(fieldProps) => (
                  <div className="booking-form__quantity">
                    <button
                      aria-label="Remove one ticket"
                      disabled={!event || availableSeats < 1 || ticketCount <= 1}
                      onClick={() => updateForm('ticketCount', Math.max(1, ticketCount - 1))}
                      type="button"
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <input
                      {...fieldProps}
                      aria-label="Number of tickets"
                      disabled={!event || availableSeats < 1}
                      inputMode="numeric"
                      max={availableSeats}
                      min="1"
                      onBlur={() => validateField('ticketCount')}
                      onChange={(changeEvent) => {
                        const value = changeEvent.target.value
                        updateForm('ticketCount', value === '' ? '' : Number(value))
                      }}
                      type="number"
                      value={form.ticketCount}
                    />
                    <button
                      aria-label="Add one ticket"
                      disabled={!event || availableSeats < 1 || ticketCount >= availableSeats}
                      onClick={() => updateForm('ticketCount', Math.min(availableSeats, ticketCount + 1))}
                      type="button"
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </FormField>
            </section>

            {/* Section E: Price Summary */}
            <section className="booking-summary" aria-labelledby="summary-title">
              <div className="booking-form__section-heading">
                <span className="booking-form__section-icon"><Ticket size={17} aria-hidden="true" /></span>
                <h2 id="summary-title">Price Summary</h2>
              </div>
              <div className="booking-summary__line">
                <span>Selected Event</span>
                <strong>{event?.title ?? 'Choose an event'}</strong>
              </div>
              <div className="booking-summary__line">
                <span>Price per Ticket</span>
                <strong>{event ? (event.isFree ? 'Free' : formatBookingAmount(event.priceAmount, event.currency)) : '—'}</strong>
              </div>
              <div className="booking-summary__line">
                <span>Number of Tickets</span>
                <strong>{ticketCount || 0}</strong>
              </div>
              {event && totals.fees > 0 && (
                <div className="booking-summary__line">
                  <span>Booking Fee</span>
                  <strong>{formatBookingAmount(totals.fees, totals.currency)}</strong>
                </div>
              )}
              <div className="booking-summary__total">
                <span>Total Booking Amount</span>
                <strong>
                  {event
                    ? (event.isFree ? 'Free' : formatBookingAmount(totals.total, totals.currency))
                    : '—'}
                </strong>
              </div>
            </section>
          </div>

          {submitError && (
            <p className="booking-alert booking-alert--error" role="alert">{submitError}</p>
          )}

          {/* Section F: Confirm Booking */}
          <div className="booking-form__actions">
            <Button to={event ? `/events/${event.id}` : '/events'} variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" />
              Keep exploring
            </Button>
            <Button
              type="submit"
              disabled={
                !event ||
                availableSeats < 1 ||
                eventsLoading ||
                Boolean(eventsError)
              }
              loading={isSubmitting}
              loadingText={event?.isFree ? 'Saving reservation...' : 'Preparing payment...'}
            >
              Confirm Booking
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </div>
          <p className="booking-form__privacy">
            <LockKeyhole size={14} aria-hidden="true" />
            Your details are safe and secure. No payment details are collected or stored on this page.
          </p>
        </form>
      </div>
    </div>
  )
}
