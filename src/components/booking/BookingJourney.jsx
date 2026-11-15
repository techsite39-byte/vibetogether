import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Check,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { categories } from '../../data/categories.js'
import { submitBookingEnquiry } from '../../services/bookingEnquiry.js'
import { formatOfferExpiry, getDiwaliOffer, getOfferRemainingMs } from '../../services/diwaliOffer.js'
import { getResponsiveImageSrcSet } from '../../utils/responsiveImage.js'
import './BookingJourney.css'

const steps = ['Name', 'Mobile', 'Category', 'Gender & attendees', 'Payment']
const bookingCategories = categories.filter(({ id }) => id === 'sing-along')
const draftStorageKey = 'vibe-together-booking-draft'
const fallbackTicketTypes = [{ id: 'general-admission', name: 'General Admission' }]
const countryCodes = [
  { country: 'India', code: '+91' },
  { country: 'United States', code: '+1' },
  { country: 'United Kingdom', code: '+44' },
  { country: 'Australia', code: '+61' },
  { country: 'United Arab Emirates', code: '+971' },
]

function readBookingDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftStorageKey) ?? 'null')
    if (
      !draft ||
      typeof draft.requestId !== 'string' ||
      !draft.form ||
      typeof draft.form !== 'object'
    ) {
      return null
    }
    return draft
  } catch {
    return null
  }
}

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

export default function BookingJourney({ onClose }) {
  const navigate = useNavigate()
  const [restoredDraft] = useState(readBookingDraft)
  const restoredTicketQuantity = Number.isInteger(restoredDraft?.form?.ticketQuantity)
    ? Math.min(10, Math.max(1, restoredDraft.form.ticketQuantity))
    : 1
  const [form, setForm] = useState(() => ({
    name: typeof restoredDraft?.form?.name === 'string' ? restoredDraft.form.name : '',
    email: typeof restoredDraft?.form?.email === 'string' ? restoredDraft.form.email : '',
    mobile: typeof restoredDraft?.form?.mobile === 'string' ? restoredDraft.form.mobile : '',
    categoryId: typeof restoredDraft?.form?.categoryId === 'string' ? restoredDraft.form.categoryId : '',
    gender: typeof restoredDraft?.form?.gender === 'string' ? restoredDraft.form.gender : '',
    ticketType: fallbackTicketTypes[0].id,
    ticketQuantity: restoredTicketQuantity,
    maleCount: Number.isInteger(restoredDraft?.form?.maleCount)
      ? Math.min(restoredTicketQuantity, Math.max(0, restoredDraft.form.maleCount))
      : restoredDraft?.form?.gender === 'Male' ? restoredTicketQuantity : 0,
    femaleCount: Number.isInteger(restoredDraft?.form?.femaleCount)
      ? Math.min(restoredTicketQuantity, Math.max(0, restoredDraft.form.femaleCount))
      : restoredDraft?.form?.gender === 'Female' ? restoredTicketQuantity : 0,
    maleMemberNames: Array.isArray(restoredDraft?.form?.maleMemberNames)
      ? restoredDraft.form.maleMemberNames.filter((name) => typeof name === 'string').slice(0, 10)
      : [],
    femaleMemberNames: Array.isArray(restoredDraft?.form?.femaleMemberNames)
      ? restoredDraft.form.femaleMemberNames.filter((name) => typeof name === 'string').slice(0, 10)
      : [],
    whatsappConsent: restoredDraft?.form?.whatsappConsent === true,
  }))
  const [countryCode, setCountryCode] = useState(restoredDraft?.countryCode ?? '+91')
  const [step, setStep] = useState(() => (
    Number.isInteger(restoredDraft?.step)
      ? Math.min(3, Math.max(0, restoredDraft.step))
      : 0
  ))
  const [transitionStage, setTransitionStage] = useState('enter')
  const [direction, setDirection] = useState(1)
  const [fieldError, setFieldError] = useState('')
  const [memberErrors, setMemberErrors] = useState({})
  const [submissionError, setSubmissionError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [diwaliOffer, setDiwaliOffer] = useState(null)
  const [offerClock, setOfferClock] = useState(Date.now())
  const [offerClockOffset, setOfferClockOffset] = useState(0)
  const [offerError, setOfferError] = useState('')
  const journeyRef = useRef(null)
  const requestId = useRef(restoredDraft?.requestId ?? crypto.randomUUID())
  const submitting = useRef(false)
  const transitioning = useRef(false)
  const transitionTimer = useRef(null)
  const settleTimer = useRef(null)

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
    const controller = new AbortController()
    getDiwaliOffer(controller.signal)
      .then((offer) => {
        const serverTime = new Date(offer.serverTime).getTime()
        if (!Number.isFinite(serverTime)) {
          throw new Error('Current ticket pricing could not be verified.')
        }
        setDiwaliOffer(offer)
        setOfferClockOffset(serverTime - Date.now())
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setOfferError(error.message)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setOfferClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    sessionStorage.setItem(draftStorageKey, JSON.stringify({
      requestId: requestId.current,
      form,
      countryCode,
      step,
    }))
  }, [countryCode, form, step])

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

  function updateTicketQuantity(nextQuantity) {
    resetRequestAfterEdit()
    setForm((current) => {
      const ticketQuantity = Math.min(10, Math.max(1, nextQuantity))
      const maleCount = Math.min(current.maleCount, ticketQuantity)
      const femaleCount = Math.min(current.femaleCount, ticketQuantity - maleCount)
      return {
        ...current,
        ticketQuantity,
        maleCount,
        femaleCount,
        maleMemberNames: current.maleMemberNames.slice(0, maleCount),
        femaleMemberNames: current.femaleMemberNames.slice(0, femaleCount),
      }
    })
    setFieldError('')
  }

  function updateGenderCount(gender, nextCount) {
    resetRequestAfterEdit()
    setForm((current) => {
      const countKey = gender === 'Male' ? 'maleCount' : 'femaleCount'
      const namesKey = gender === 'Male' ? 'maleMemberNames' : 'femaleMemberNames'
      const otherCount = gender === 'Male' ? current.femaleCount : current.maleCount
      const count = Math.min(current.ticketQuantity - otherCount, Math.max(0, nextCount))
      return {
        ...current,
        [countKey]: count,
        [namesKey]: current[namesKey].slice(0, count),
      }
    })
    setFieldError('')
  }

  function updateMemberName(gender, index, value) {
    resetRequestAfterEdit()
    const namesKey = gender === 'Male' ? 'maleMemberNames' : 'femaleMemberNames'
    setForm((current) => {
      const names = [...current[namesKey]]
      names[index] = value
      return { ...current, [namesKey]: names }
    })
    setMemberErrors((current) => {
      const next = { ...current }
      delete next[`${gender}-${index}`]
      return next
    })
    setFieldError('')
  }

  function getMissingMemberNames() {
    return [
      ['Male', form.maleCount, form.maleMemberNames],
      ['Female', form.femaleCount, form.femaleMemberNames],
    ].flatMap(([gender, count, names]) => Array.from({ length: count }, (_, index) => ({
      key: `${gender}-${index}`,
      missing: !String(names[index] ?? '').trim(),
    }))).filter(({ missing }) => missing)
  }

  function validateStep() {
    if (step === 0 && !isValidName(form.name)) {
      return 'Enter your full name to continue.'
    }
    if (step === 0 && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Enter a valid email address or leave it blank.'
    }
    if (step === 1 && !getNormalizedMobile(form.mobile, countryCode)) {
      return 'Enter a valid mobile number with 7 to 15 digits.'
    }
    if (step === 2 && !bookingCategories.some(({ id }) => id === form.categoryId)) {
      return 'Choose one category to continue.'
    }
    if (step === 3 && form.maleCount + form.femaleCount !== form.ticketQuantity) {
      return `Assign all ${form.ticketQuantity} ticket${form.ticketQuantity === 1 ? '' : 's'} to Male or Female.`
    }
    if (step === 3) {
      const missingMembers = getMissingMemberNames()
      if (missingMembers.length > 0) {
        setMemberErrors(Object.fromEntries(missingMembers.map(({ key }) => [key, 'Attendee name is required.'])))
        return 'Enter a name for every attendee before continuing.'
      }
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
      journeyRef.current?.scrollTo(0, 0)
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
        email: form.email.trim(),
        mobile: getNormalizedMobile(form.mobile, countryCode),
        categoryId: form.categoryId,
        gender: form.maleCount > 0 && form.femaleCount > 0
          ? 'Mixed'
          : form.maleCount > 0 ? 'Male' : 'Female',
        maleCount: form.maleCount,
        femaleCount: form.femaleCount,
        maleMemberNames: form.maleMemberNames,
        femaleMemberNames: form.femaleMemberNames,
        ticketType: form.ticketType,
        ticketQuantity: form.ticketQuantity,
        whatsappConsent: form.whatsappConsent,
      })
      onClose()
      navigate(`/booking/payment/${requestId.current}`)
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

  const selectedCategory = bookingCategories.find(
    ({ id }) => id === form.categoryId,
  )
  const serverClock = offerClock + offerClockOffset
  const regularPrice = diwaliOffer?.regularPrice
  const offerPrice = diwaliOffer?.offerPrice
  const pricingAvailable =
    Number.isSafeInteger(regularPrice) &&
    regularPrice > 0 &&
    Number.isSafeInteger(offerPrice) &&
    offerPrice > 0
  const activationAt = new Date(diwaliOffer?.activationAt).getTime()
  const expiresAt = new Date(diwaliOffer?.expiresAt).getTime()
  const offerActive =
    pricingAvailable &&
    Boolean(diwaliOffer?.enabled) &&
    serverClock >= activationAt &&
    serverClock < expiresAt
  const offerRemaining = getOfferRemainingMs(diwaliOffer?.expiresAt, serverClock)
  const countdown = [
    Math.floor(offerRemaining / 86_400_000),
    Math.floor((offerRemaining % 86_400_000) / 3_600_000),
    Math.floor((offerRemaining % 3_600_000) / 60_000),
    Math.floor((offerRemaining % 60_000) / 1000),
  ].map((value) => String(value).padStart(2, '0')).join(':')
  const ticketQuantity = form.ticketQuantity
  const subtotal = pricingAvailable ? regularPrice * ticketQuantity : 0
  const discount = offerActive
    ? (regularPrice - offerPrice) * ticketQuantity
    : 0
  const finalAmount = subtotal - discount
  const ticketPriceSummary = (
    <section className="booking-journey__ticket-summary" aria-live="polite">
      <div className="booking-journey__ticket-summary-heading">
        <span>PRICE SUMMARY</span>
        <Sparkles size={16} aria-hidden="true" />
      </div>
      {pricingAvailable ? (
        <>
          <dl>
            <div><dt>Number of tickets</dt><dd>{ticketQuantity}</dd></div>
            <div>
              <dt>Regular price per ticket</dt>
              <dd>
                {offerActive && <s>₹{regularPrice}</s>}
                <strong>₹{offerActive ? offerPrice : regularPrice}</strong>
              </dd>
            </div>
            <div><dt>Subtotal</dt><dd>₹{subtotal}</dd></div>
            <div><dt>Diwali discount</dt><dd>−₹{discount}</dd></div>
            <div className="booking-journey__ticket-summary-total">
              <dt>Final payable amount</dt><dd>₹{finalAmount}</dd>
            </div>
          </dl>
          {offerActive && <p>Save ₹{discount} with the Diwali offer</p>}
        </>
      ) : (
        <p className="booking-journey__offer-error" role="status">
          {offerError || 'Loading current ticket pricing…'}
        </p>
      )}
    </section>
  )

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
      </header>

      <div className="booking-journey__body">
          {step >= 2 && offerActive && (
            <aside className="booking-journey__diwali-offer" aria-label="Diwali special offer">
              <div className="booking-journey__diwali-copy">
                <span>🪔 DIWALI SPECIAL OFFER</span>
                <strong>Celebrate with Vibe Together!</strong>
                <small>Limited-time offer – 3 days only!</small>
              </div>
              <div className="booking-journey__diwali-price">
                <s>₹{diwaliOffer.regularPrice}</s>
                <strong>₹{diwaliOffer.offerPrice}</strong>
                <small>Save ₹{diwaliOffer.savings}</small>
              </div>
              <p>
                Offer ends in <strong>{countdown}</strong>
                <span> · IST · {formatOfferExpiry(diwaliOffer.expiresAt)}</span>
              </p>
            </aside>
          )}
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
            <h1
              className={`booking-journey__title${step === 2 ? ' booking-journey__title--category' : ''}`}
              id="booking-journey-title"
            >
              {[
                'What’s your name?',
                'What’s your mobile number?',
                'Pick a category',
                'Who’s joining you?',
              ][step]}
            </h1>
            {step > 0 && step < 4 && (
              <p className="booking-journey__support">
                {step === 1
                  ? 'Enter your number so we can contact you about your enquiry.'
                  : step === 2
                    ? 'Choose one category. Our team can match you with a suitable event.'
                    : 'Assign every ticket to Male or Female. Every attendee name is required.'}
              </p>
            )}

            <div className="booking-journey__answer">
              {step === 0 && (
                <>
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
                  <label className="booking-journey__input-wrap">
                    <span className="booking-journey__visually-hidden">Email address (optional)</span>
                    <input
                      autoComplete="email"
                      maxLength={254}
                      name="email"
                      onChange={updateField}
                      placeholder="Email address (optional)"
                      type="email"
                      value={form.email}
                    />
                  </label>
                </>
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
                  <>
                    <fieldset className="booking-journey__category-list">
                      <legend className="booking-journey__visually-hidden">
                        Choose one category of interest
                      </legend>
                      {bookingCategories.map(({ id, title, image, imageAlt }) => (
                        <label
                          className={`booking-category-card${form.categoryId === id ? ' is-selected' : ''}`}
                          key={id}
                        >
                          <input
                            checked={form.categoryId === id}
                            className="booking-category-card__input"
                            data-journey-focus
                            name="categoryId"
                            onChange={() => {
                              resetRequestAfterEdit()
                              setForm((current) => ({ ...current, categoryId: id }))
                              setFieldError('')
                            }}
                            type="radio"
                            value={id}
                          />
                          <span className="booking-category-card__image-wrap">
                            <img
                              alt={imageAlt || `${title} event`}
                              className="booking-category-card__image"
                              src={image}
                              srcSet={getResponsiveImageSrcSet(image)}
                              sizes="(max-width: 48rem) 50vw, 240px"
                              loading="lazy"
                              decoding="async"
                            />
                            <span aria-hidden="true" className="booking-category-card__selected-badge">
                              {form.categoryId === id && <Check size={16} />}
                            </span>
                          </span>
                          <span className="booking-category-card__body">
                            <span className="booking-category-card__label">SING ALONG</span>
                            <span className="booking-category-card__name">{title}</span>
                            <span className="booking-category-card__title">The room becomes the chorus</span>
                            <span className="booking-category-card__description">An evening where every voice finds its place in the song.</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="booking-journey__ticket-controls">
                      <div className="booking-journey__ticket-quantity">
                        <span>Number of Tickets</span>
                        <div className="booking-journey__ticket-stepper">
                          <button
                            aria-label="Decrease number of tickets"
                            disabled={ticketQuantity <= 1}
                            onClick={() => {
                              updateTicketQuantity(ticketQuantity - 1)
                            }}
                            type="button"
                          >
                            <Minus size={18} aria-hidden="true" />
                          </button>
                          <output aria-label="Number of tickets" aria-live="polite">
                            {ticketQuantity}
                          </output>
                          <button
                            aria-label="Increase number of tickets"
                            disabled={ticketQuantity >= 10}
                            onClick={() => {
                              updateTicketQuantity(ticketQuantity + 1)
                            }}
                            type="button"
                          >
                            <Plus size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {ticketPriceSummary}
                  </>
                )}

              {step === 3 && (
                <>
                  <fieldset className="booking-gender-counts">
                    <legend>Ticket mix</legend>
                    {['Male', 'Female'].map((gender, index) => {
                      const count = gender === 'Male' ? form.maleCount : form.femaleCount
                      const atLimit = form.maleCount + form.femaleCount >= ticketQuantity
                      return (
                        <div className="booking-gender-count" key={gender}>
                          <span className="booking-gender-count__label">{gender} tickets</span>
                          <div className="booking-gender-count__stepper">
                            <button
                              aria-label={`Remove one ${gender.toLowerCase()} ticket`}
                              disabled={count === 0}
                              onClick={() => updateGenderCount(gender, count - 1)}
                              type="button"
                            >
                              <Minus size={17} aria-hidden="true" />
                            </button>
                            <output aria-label={`${gender} ticket count`}>{count}</output>
                            <button
                              aria-label={`Add one ${gender.toLowerCase()} ticket`}
                              data-journey-focus={index === 0 ? '' : undefined}
                              disabled={atLimit}
                              onClick={() => updateGenderCount(gender, count + 1)}
                              type="button"
                            >
                              <Plus size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </fieldset>
                  {[
                    ['Male', form.maleCount, form.maleMemberNames],
                    ['Female', form.femaleCount, form.femaleMemberNames],
                  ].map(([gender, count, names]) => count > 0 && (
                    <fieldset className="booking-member-group" key={gender}>
                      <legend>{gender.toUpperCase()} MEMBERS</legend>
                      {Array.from({ length: count }, (_, index) => (
                        <label className="booking-member-field" key={`${gender}-${index}`}>
                          <span>{gender} Member {index + 1}</span>
                          <input
                            autoComplete="off"
                            aria-invalid={Boolean(memberErrors[`${gender}-${index}`])}
                            maxLength={80}
                            onChange={(event) => updateMemberName(gender, index, event.target.value)}
                            placeholder="Enter attendee name"
                            required
                            type="text"
                            value={names[index] ?? ''}
                          />
                          {memberErrors[`${gender}-${index}`] && (
                            <small className="booking-member-field__error" role="alert">
                              {memberErrors[`${gender}-${index}`]}
                            </small>
                          )}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </>
              )}
            </div>

            {selectedCategory && step === 3 && (
              <p className="booking-journey__selected-event">
                Your interest: <strong>{selectedCategory.title}</strong>
              </p>
            )}
            {step === 3 && (
              <p className="booking-journey__price-summary">
                Booking amount for {ticketQuantity} {ticketQuantity === 1 ? 'ticket' : 'tickets'}:
                {offerActive && <s>₹{subtotal}</s>}
                <strong>₹{finalAmount}</strong>
                {offerActive && <span>Save ₹{discount} with the Diwali offer</span>}
              </p>
            )}
            {step === 3 && (
              <label className="booking-journey__whatsapp-consent">
                <input
                  checked={form.whatsappConsent}
                  onChange={(event) => {
                    resetRequestAfterEdit()
                    setForm((current) => ({
                      ...current,
                      whatsappConsent: event.target.checked,
                    }))
                  }}
                  type="checkbox"
                />
                <span>
                  I consent to receive WhatsApp booking updates and payment assistance
                  from Vibe Together at the mobile number I provided. This is optional
                  and I can opt out later.
                </span>
              </label>
            )}
            {(fieldError || submissionError) && (
              <p aria-live="assertive" className="booking-journey__error" role="alert">
                <CircleAlert aria-hidden="true" size={18} />
                <span>{submissionError || fieldError}</span>
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
                disabled={
                  isSubmitting ||
                  isTransitioning ||
                  (step === 2 && (!form.categoryId || !pricingAvailable))
                }
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="booking-journey__spinner" size={18} aria-hidden="true" />
                    Sending…
                  </>
                ) : step === 3 ? (
                  <>Continue <ArrowRight size={18} aria-hidden="true" /></>
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
    </section>
  )
}
