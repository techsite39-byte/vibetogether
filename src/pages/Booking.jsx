import { useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  LockKeyhole,
  MapPin,
  ShieldAlert,
  Ticket,
  UsersRound,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import WhatsAppLink from '../components/contact/WhatsAppLink.jsx'
import FormField from '../components/common/FormField.jsx'
import {
  bookingConfig,
  bookingConfigErrors,
  isPaymentBackendConfigured,
} from '../config/booking.js'
import {
  calculateBookingTotals,
  formatBookingAmount,
} from '../utils/bookingTotals.js'
import {
  rememberBookingReference,
} from '../utils/bookingStorage.js'
import { validateBookingForm } from '../utils/bookingValidation.js'
import { createCheckoutSession } from '../services/paymentCheckout.js'
import { createBooking } from '../services/bookingRecords.js'
import usePublicEvents from '../hooks/usePublicEvents.js'
import NotFound from './NotFound.jsx'
import './Booking.css'

const initialForm = {
  fullName: '',
  email: '',
  mobile: '',
  ticketCount: 1,
  specialRequests: '',
}

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
  const requestId = useRef(crypto.randomUUID())
  const eventId = routeEventId || stateEventId || selectedEventId
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

  function validateForm() {
    const nextErrors = validateBookingForm(form, availableSeats)
    setErrors(nextErrors)
    setHasSubmitted(true)
    return Object.keys(nextErrors).length === 0
  }

  function validateField(field) {
    const nextErrors = validateBookingForm(form, availableSeats)
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
    setSubmitError('')

    if (!validateForm() || !event) {
      return
    }

    if (availableSeats < 1) {
      setSubmitError('This event is full. Please explore another event.')
      return
    }

    setIsSubmitting(true)

    try {
      const attendee = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
      }

      if (event.isFree) {
        const booking = await createBooking({
          requestId: requestId.current,
          eventId: event.id,
          attendee,
          specialRequests: form.specialRequests,
          ticketCount,
        })
        let referenceStorageWarning = ''
        try {
          rememberBookingReference(booking.reference)
        } catch (error) {
          referenceStorageWarning = error instanceof Error ? error.message : 'The booking reference could not be saved on this device.'
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

      if (!isPaymentBackendConfigured) {
        setSubmitError(
          `Online payment is not available yet. Configure a booking backend to create and verify a secure ${bookingConfig.paymentProvider} checkout.`,
        )
        return
      }

      const checkout = await createCheckoutSession({
        attendee,
        eventId: event.id,
        specialRequests: form.specialRequests.trim(),
        ticketCount,
      })

      window.location.assign(checkout.checkoutUrl)
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

  return (
    <div className="booking-page">
      <section className="booking-page__intro">
        <Container>
          <Link className="booking-page__back" to={event ? `/events/${event.id}` : '/events'}>
            <ArrowLeft size={17} aria-hidden="true" />
            {event ? 'Back to event' : 'Explore events'}
          </Link>
          <p className="booking-page__eyebrow">A good plan starts here</p>
          <h1>Save your <span className="gradient-text">spot.</span></h1>
          <p>Share a few details and get ready for something memorable.</p>
        </Container>
      </section>

      <Container className="booking-layout">
        <form className="booking-form glass-card" onSubmit={handleSubmit} noValidate>
          <section className="booking-form__section" aria-labelledby="event-selection-title">
            <div className="booking-form__section-heading">
              <span className="booking-form__step">01</span>
              <div>
                <h2 id="event-selection-title">Your event</h2>
                <p>Choose the experience you want to join.</p>
              </div>
            </div>

            <FormField id="booking-event" label="Event" required>
              {(fieldProps) => (
                <select
                  {...fieldProps}
                  value={event?.id ?? ''}
                  onChange={(changeEvent) => {
                    requestId.current = crypto.randomUUID()
                    setSelectedEventId(changeEvent.target.value)
                    setForm(initialForm)
                    setErrors({})
                    setHasSubmitted(false)
                    setSubmitError('')
                  }}
                  disabled={Boolean(routeEventId)}
                >
                  <option value="" disabled>
                    Select an event
                  </option>
                  {availableEvents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.isFree ? 'Free' : item.price}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {eventsError && <p className="booking-alert booking-alert--error" role="alert">{eventsError}</p>}
            {eventsLoading && <p role="status">Loading available events…</p>}

            {event && (
              <div className="booking-event">
                <img
                  src={event.image}
                  alt={event.imageAlt}
                  loading="lazy"
                />
                <div className="booking-event__content">
                  <span className="booking-event__category">{event.category}</span>
                  <h3>{event.title}</h3>
                  <p>
                    <CalendarDays size={16} aria-hidden="true" />
                    {formatEventDate(event.date)}
                  </p>
                  <p>
                    <Clock3 size={16} aria-hidden="true" />
                    {event.time}
                  </p>
                  <p>
                    <MapPin size={16} aria-hidden="true" />
                    {event.location}
                  </p>
                  <p className="booking-event__seats">
                    <UsersRound size={16} aria-hidden="true" />
                    {availableSeats} {availableSeats === 1 ? 'seat' : 'seats'} left
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="booking-form__section" aria-labelledby="attendee-title">
            <div className="booking-form__section-heading">
              <span className="booking-form__step">02</span>
              <div>
                <h2 id="attendee-title">Attendee details</h2>
                <p>We’ll use these details for your booking information.</p>
              </div>
            </div>

            <div className="booking-form__fields">
              <FormField
                id="booking-full-name"
                label="Full name"
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
                    value={form.fullName}
                  />
                )}
              </FormField>
              <FormField
                id="booking-email"
                label="Email address"
                required
                error={activeFieldError('email')}
                hint="Your booking reference will be shown on screen. Email delivery needs backend setup."
              >
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    autoComplete="email"
                    maxLength={254}
                    onBlur={() => validateField('email')}
                    onChange={(changeEvent) =>
                      updateForm('email', changeEvent.target.value)
                    }
                    type="email"
                    value={form.email}
                  />
                )}
              </FormField>
              <FormField
                id="booking-mobile"
                label="Mobile number"
                required
                error={activeFieldError('mobile')}
                hint="Include a country code if you are booking from outside India."
              >
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={24}
                    onBlur={() => validateField('mobile')}
                    onChange={(changeEvent) =>
                      updateForm('mobile', changeEvent.target.value)
                    }
                    type="tel"
                    value={form.mobile}
                  />
                )}
              </FormField>
              <FormField
                id="booking-ticket-count"
                label="Number of attendees"
                required
                error={activeFieldError('ticketCount')}
                hint={
                  event
                    ? `${availableSeats} ${
                        availableSeats === 1 ? 'seat is' : 'seats are'
                      } currently available.`
                    : 'Select an event to see available seats.'
                }
              >
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    disabled={!event || availableSeats < 1}
                    inputMode="numeric"
                    max={availableSeats}
                    min="1"
                    onBlur={() => validateField('ticketCount')}
                    onChange={(changeEvent) => {
                      const value = changeEvent.target.value
                      updateForm(
                        'ticketCount',
                        value === '' ? '' : Number(value),
                      )
                    }}
                    type="number"
                    value={form.ticketCount}
                  />
                )}
              </FormField>
              <FormField
                id="booking-special-requests"
                label="Special requests"
                error={activeFieldError('specialRequests')}
                hint="Optional · Please don’t include sensitive or payment information."
              >
                {(fieldProps) => (
                  <textarea
                    {...fieldProps}
                    maxLength={500}
                    onBlur={() => validateField('specialRequests')}
                    onChange={(changeEvent) =>
                      updateForm('specialRequests', changeEvent.target.value)
                    }
                    rows={4}
                    value={form.specialRequests}
                  />
                )}
              </FormField>
            </div>
          </section>

          {submitError && (
            <p className="booking-alert booking-alert--error" role="alert">
              {submitError}
            </p>
          )}

          {event && !event.isFree && (
            <div className="booking-alert booking-alert--info" role="status">
              <ShieldAlert size={20} aria-hidden="true" />
              <p>
                Payment is not collected or confirmed here. Secure checkout and
                payment verification require a configured backend.
              </p>
            </div>
          )}
          {event &&
            !event.isFree &&
            bookingConfigErrors.map((configError) => (
              <p
                className="booking-alert booking-alert--error"
                key={configError}
                role="alert"
              >
                {configError}
              </p>
            ))}

          <div className="booking-form__actions">
            <Button to={event ? `/events/${event.id}` : '/events'} variant="secondary">
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
              loadingText={
                event?.isFree ? 'Saving reservation...' : 'Preparing checkout...'
              }
            >
              {event?.isFree ? (
                <>
                  <Ticket size={17} aria-hidden="true" />
                  Reserve free tickets
                </>
              ) : (
                <>
                  <LockKeyhole size={17} aria-hidden="true" />
                  Continue to payment
                </>
              )}
            </Button>
          </div>
          <p className="booking-form__privacy">
            {event?.isFree
              ? 'Development preview: free booking details are stored only in this browser and are not sent to an organizer.'
              : 'No card details are collected or stored on this page.'}
          </p>
        </form>

        <aside className="booking-summary glass-card" aria-labelledby="summary-title">
          <p className="booking-summary__eyebrow">Booking summary</p>
          <h2 id="summary-title">{event?.title ?? 'Choose your experience'}</h2>
          {event ? (
            <>
              <div className="booking-summary__line">
                <span>
                  {event.isFree ? 'Free admission' : 'Ticket price'}
                  {ticketCount > 0 && ` × ${ticketCount}`}
                </span>
                <strong>
                  {event.isFree
                    ? 'FREE'
                    : formatBookingAmount(totals.subtotal, totals.currency)}
                </strong>
              </div>
              <div className="booking-summary__line">
                <span>Booking fee</span>
                <strong>
                  {formatBookingAmount(totals.fees, totals.currency)}
                </strong>
              </div>
              <div className="booking-summary__total">
                <span>Total</span>
                <strong>
                  {event.isFree
                    ? 'FREE'
                    : formatBookingAmount(totals.total, totals.currency)}
                </strong>
              </div>
              {!event.isFree && (
                <p className="booking-summary__note">
                  Fees are configurable and verified by the booking service.
                  Current configured fee:{' '}
                  {formatBookingAmount(
                    bookingConfig.feePerPaidTicket,
                    totals.currency,
                  )}{' '}
                  per ticket.
                </p>
              )}
            </>
          ) : (
            <p className="booking-summary__note">
              Event pricing, tickets, and any fees will appear here.
            </p>
          )}
          <div className="booking-summary__trust">
            <LockKeyhole size={18} aria-hidden="true" />
            <span>
              {event?.isFree
                ? 'No payment details required'
                : 'No payment details are stored by this frontend'}
            </span>
          </div>
          <WhatsAppLink
            className="booking-summary__whatsapp"
            label="Ask about this booking"
            message={
              event
                ? `Hi VIBE TOGETHER, I need help with my booking for "${event.title}" (event ID: ${event.id}).`
                : 'Hi VIBE TOGETHER, I have a question about booking an event.'
            }
          />
        </aside>
      </Container>
    </div>
  )
}
