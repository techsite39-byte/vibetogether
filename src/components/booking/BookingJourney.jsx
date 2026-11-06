import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Sparkles,
  X,
} from 'lucide-react'
import {
  getBookingEvents,
  submitBookingEnquiry,
} from '../../services/bookingEnquiry.js'
import './BookingJourney.css'

const steps = ['Name', 'Mobile', 'Event', 'Gender']
const countryCodes = [
  { country: 'India', code: '+91' },
  { country: 'United States', code: '+1' },
  { country: 'United Kingdom', code: '+44' },
  { country: 'Australia', code: '+61' },
  { country: 'United Arab Emirates', code: '+971' },
]

function isValidName(value) {
  const name = value.normalize('NFKC').trim()
  return (
    /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,79}$/u.test(name) &&
    ![...name].some((character) => {
      const codePoint = character.codePointAt(0)
      return (
        character === '<' ||
        character === '>' ||
        codePoint <= 31 ||
        codePoint === 127
      )
    })
  )
}

function getNormalizedMobile(value, countryCode) {
  const trimmed = value.trim()
  const phone = trimmed.startsWith('+')
    ? trimmed
    : `${countryCode} ${trimmed}`
  const digits = phone.replace(/\D/g, '')
  if (!/^\+?[0-9][0-9\s().-]{6,23}$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return ''
  }

  return `+${digits}`
}

export default function BookingJourney({ initialEventId = '', onClose }) {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState('')
  const [eventLoadAttempt, setEventLoadAttempt] = useState(0)
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    eventId: initialEventId,
    gender: '',
  })
  const [countryCode, setCountryCode] = useState('+91')
  const [step, setStep] = useState(0)
  const [transitionStage, setTransitionStage] = useState('enter')
  const [direction, setDirection] = useState(1)
  const [fieldError, setFieldError] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const journeyRef = useRef(null)
  const requestId = useRef(crypto.randomUUID())
  const submitting = useRef(false)
  const transitioning = useRef(false)
  const transitionTimer = useRef(null)
  const settleTimer = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    getBookingEvents(controller.signal)
      .then((availableEvents) => {
        setEvents(availableEvents)
        setForm((current) => ({
          ...current,
          eventId: availableEvents.some(({ id }) => id === initialEventId)
            ? initialEventId
            : current.eventId,
        }))
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setEventsError(
            error instanceof Error
              ? error.message
              : 'We could not load experiences right now. Please try again.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEventsLoading(false)
        }
      })

    return () => controller.abort()
  }, [eventLoadAttempt, initialEventId])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !submitting.current) {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !journeyRef.current) {
        return
      }

      const focusable = [
        ...journeyRef.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
        ),
      ]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(transitionTimer.current)
      window.clearTimeout(settleTimer.current)
      document.body.style.overflow = previousOverflow
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    if (transitionStage !== 'enter') {
      return undefined
    }

    const focusTimer = window.setTimeout(() => {
      journeyRef.current
        ?.querySelector('[data-journey-focus]')
        ?.focus()
    }, 50)
    return () => window.clearTimeout(focusTimer)
  }, [step, transitionStage])

  function updateField(event) {
    const { name, value } = event.target
    resetRequestAfterEdit()
    setForm((current) => ({ ...current, [name]: value }))
    setFieldError('')
  }

  function resetRequestAfterEdit() {
    if (submissionError) {
      requestId.current = crypto.randomUUID()
      setSubmissionError('')
    }
  }

  function validateStep() {
    if (step === 0 && !isValidName(form.name)) {
      return 'Enter your full name to continue.'
    }
    if (step === 1 && !getNormalizedMobile(form.mobile, countryCode)) {
      return 'Enter a valid mobile number with 7 to 15 digits.'
    }
    if (step === 2) {
      if (eventsLoading) {
        return 'Please wait while events load.'
      }
      if (eventsError) {
        return 'Events could not be loaded. Please retry.'
      }
      if (!events.some(({ id }) => id === form.eventId)) {
        return 'Choose an event to continue.'
      }
    }
    if (step === 3 && !['Male', 'Female'].includes(form.gender)) {
      return 'Choose an option to continue.'
    }
    return ''
  }

  function animateToStep(nextStep) {
    if (transitioning.current || nextStep < 0 || nextStep > steps.length - 1) {
      return
    }

    transitioning.current = true
    setIsTransitioning(true)
    setDirection(nextStep > step ? 1 : -1)
    setFieldError('')
    setTransitionStage('exit')
    window.clearTimeout(transitionTimer.current)
    window.clearTimeout(settleTimer.current)
    transitionTimer.current = window.setTimeout(() => {
      setStep(nextStep)
      setTransitionStage('enter')
      settleTimer.current = window.setTimeout(() => {
        setTransitionStage('idle')
        transitioning.current = false
        setIsTransitioning(false)
      }, 520)
    }, 190)
  }

  function handleContinue(event) {
    event.preventDefault()
    const error = validateStep()
    if (error) {
      setFieldError(error)
      return
    }
    animateToStep(step + 1)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const error = validateStep()
    if (error) {
      setFieldError(error)
      return
    }
    if (submitting.current || isTransitioning) {
      return
    }

    submitting.current = true
    setIsSubmitting(true)
    setSubmissionError('')
    try {
      await submitBookingEnquiry({
        requestId: requestId.current,
        name: form.name.normalize('NFKC').trim(),
        mobile: getNormalizedMobile(form.mobile, countryCode),
        eventId: form.eventId,
        gender: form.gender,
      })
      setForm({ name: '', mobile: '', eventId: '', gender: '' })
      setIsSubmitted(true)
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'We could not submit your request. Please try again.',
      )
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  const selectedEvent = events.find(({ id }) => id === form.eventId)

  return (
    <section
      aria-label="Vibe Together booking journey"
      className="booking-journey"
      ref={journeyRef}
    >
      <div className="booking-journey__glow booking-journey__glow--one" aria-hidden="true" />
      <div className="booking-journey__glow booking-journey__glow--two" aria-hidden="true" />
      <div className="booking-journey__particles" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
      </div>
      <svg
        aria-hidden="true"
        className="booking-journey__waves"
        preserveAspectRatio="none"
        viewBox="0 0 1440 190"
      >
        <defs>
          <linearGradient id="booking-journey-wave" x1="0" x2="1">
            <stop offset="0" stopColor="#773BFF" stopOpacity=".1" />
            <stop offset=".5" stopColor="#D12AFF" stopOpacity=".8" />
            <stop offset="1" stopColor="#343BFF" stopOpacity=".15" />
          </linearGradient>
        </defs>
        <path d="M0 112 C180 35 260 170 440 105 S700 42 890 105 1210 165 1440 72" />
        <path d="M0 142 C190 75 295 192 480 129 S750 74 950 132 1230 176 1440 105" />
        <path d="M0 165 C200 112 320 210 530 151 S810 108 1010 154 1260 198 1440 133" />
      </svg>

      <header className="booking-journey__header">
        <span className="booking-journey__brand">
          <Sparkles size={16} aria-hidden="true" />
          VIBE TOGETHER
        </span>
        {!isSubmitted && (
          <button
            aria-label="Cancel booking journey"
            className="booking-journey__close"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X size={20} aria-hidden="true" />
            <span>Close</span>
          </button>
        )}
      </header>

      {isSubmitted ? (
        <div className="booking-journey__success" role="status">
          <span className="booking-journey__success-icon">
            <Check size={34} aria-hidden="true" />
          </span>
          <p className="booking-journey__eyebrow">REQUEST RECEIVED</p>
          <h1>You&apos;re one step closer to a new experience!</h1>
          <p className="booking-journey__support">
            Your booking request has been received.
          </p>
          <p className="booking-journey__privacy">
            This is an enquiry, not a confirmed event booking.
          </p>
          <button
            className="booking-journey__primary"
            onClick={onClose}
            type="button"
          >
            Continue Exploring <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="booking-journey__body">
          <nav aria-label="Booking progress" className="booking-journey__progress">
            {steps.map((label, index) => (
              <div
                aria-current={index === step ? 'step' : undefined}
                className={`booking-journey__progress-step${index < step ? ' is-complete' : ''}${index === step ? ' is-active' : ''}`}
                key={label}
              >
                <span className="booking-journey__progress-dot">
                  {index < step ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}
                </span>
                <span className="booking-journey__progress-label">{label}</span>
              </div>
            ))}
          </nav>

          <form
            className={`booking-journey__screen is-${transitionStage}`}
            onSubmit={step === 3 ? handleSubmit : handleContinue}
            style={{ '--journey-direction': direction }}
            noValidate
          >
            <p className="booking-journey__eyebrow">
              {step < 3 ? `LET’S GET TO KNOW YOU · STEP 0${step + 1}` : 'YOUR NEXT STORY STARTS HERE'}
            </p>
            <h1 className="booking-journey__title" id="booking-journey-title">
              {[
                'What’s your name?',
                'What’s your mobile number?',
                'Which event would you like to experience?',
                'How do you identify?',
              ][step]}
            </h1>
            {step > 0 && step < 4 && (
              <p className="booking-journey__support">
                {step === 1
                  ? 'Enter your number so we can contact you about your event.'
                  : step === 2
                    ? 'Choose the experience that matches your vibe.'
                    : 'Select one option to complete your enquiry.'}
              </p>
            )}

            <div className="booking-journey__answer">
              {step === 0 && (
                <label className="booking-journey__input-wrap">
                  <span className="booking-journey__visually-hidden">Full name</span>
                  <input
                    autoComplete="name"
                    data-journey-focus
                    maxLength={80}
                    name="name"
                    onChange={updateField}
                    placeholder="Enter your full name"
                    value={form.name}
                  />
                </label>
              )}

              {step === 1 && (
                <div className="booking-journey__phone">
                  <label className="booking-journey__visually-hidden" htmlFor="booking-country-code">
                    Country calling code
                  </label>
                  <select
                    id="booking-country-code"
                    onChange={(event) => {
                      resetRequestAfterEdit()
                      setCountryCode(event.target.value)
                    }}
                    value={countryCode}
                  >
                    {countryCodes.map(({ country, code }) => (
                      <option key={code} value={code}>{country} ({code})</option>
                    ))}
                  </select>
                  <label className="booking-journey__visually-hidden" htmlFor="booking-mobile">
                    Mobile number
                  </label>
                  <input
                    autoComplete="tel-national"
                    data-journey-focus
                    id="booking-mobile"
                    inputMode="tel"
                    maxLength={24}
                    name="mobile"
                    onChange={updateField}
                    placeholder="Enter your mobile number"
                    type="tel"
                    value={form.mobile}
                  />
                </div>
              )}

              {step === 2 && (
                <div aria-label="Available events" className="booking-journey__event-list" role="radiogroup">
                  {eventsLoading && (
                    <p className="booking-journey__loading">
                      <LoaderCircle size={18} aria-hidden="true" />
                      Finding experiences…
                    </p>
                  )}
                  {eventsError && (
                    <div className="booking-journey__event-error" role="alert">
                      <span>{eventsError}</span>
                      <button
                        onClick={() => {
                          setEventsLoading(true)
                          setEventsError('')
                          setEventLoadAttempt((attempt) => attempt + 1)
                        }}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!eventsLoading && !eventsError && events.map(({
                    description,
                    id,
                    image,
                    imageAlt,
                    title,
                  }) => (
                    <button
                      aria-checked={form.eventId === id}
                      className={`booking-journey__event${form.eventId === id ? ' is-selected' : ''}`}
                      key={id}
                      onClick={() => {
                        resetRequestAfterEdit()
                        setForm((current) => ({ ...current, eventId: id }))
                        setFieldError('')
                      }}
                      role="radio"
                      type="button"
                    >
                      {image && (
                        <img
                          alt={imageAlt}
                          className="booking-journey__event-image"
                          loading="lazy"
                          src={image}
                        />
                      )}
                      <span className="booking-journey__event-copy">
                        <span className="booking-journey__event-title">{title}</span>
                        {description && (
                          <span className="booking-journey__event-description">
                            {description}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true" className="booking-journey__event-check">
                        {form.eventId === id && <Check size={17} />}
                      </span>
                    </button>
                  ))}
                  {!eventsLoading && !eventsError && events.length === 0 && (
                    <p className="booking-journey__loading">
                      No experiences are available right now. Please check back soon.
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <fieldset className="booking-journey__gender">
                  <legend className="booking-journey__visually-hidden">Gender</legend>
                  {['Male', 'Female'].map((gender) => (
                    <label
                      className={`booking-journey__gender-option${form.gender === gender ? ' is-selected' : ''}`}
                      key={gender}
                    >
                      <input
                        checked={form.gender === gender}
                        data-journey-focus={gender === 'Male' ? '' : undefined}
                        name="gender"
                        onChange={updateField}
                        type="radio"
                        value={gender}
                      />
                      <span>{gender}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>

            {selectedEvent && step === 3 && (
              <p className="booking-journey__selected-event">
                Your experience: <strong>{selectedEvent.title}</strong>
              </p>
            )}
            {(fieldError || submissionError) && (
              <p className="booking-journey__error" role="alert">
                {submissionError || fieldError}
              </p>
            )}
            <p className="booking-journey__privacy">
              Your details are stored securely to handle this booking enquiry.
            </p>

            <div className="booking-journey__actions">
              {step > 0 && (
                <button
                  className="booking-journey__back"
                  disabled={isSubmitting || isTransitioning}
                  onClick={() => animateToStep(step - 1)}
                  type="button"
                >
                  <ArrowLeft size={17} aria-hidden="true" /> Back
                </button>
              )}
              <button
                className="booking-journey__primary"
                disabled={isSubmitting || isTransitioning}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="booking-journey__spinner" size={18} aria-hidden="true" />
                    Sending…
                  </>
                ) : step === 3 ? (
                  <>Submit Booking <ArrowRight size={18} aria-hidden="true" /></>
                ) : (
                  <>Continue <ArrowRight size={18} aria-hidden="true" /></>
                )}
              </button>
            </div>
          </form>

          <div className="booking-journey__step-count" aria-live="polite">
            {`0${step + 1}`} <span>/ 04</span>
          </div>
        </div>
      )}
    </section>
  )
}
