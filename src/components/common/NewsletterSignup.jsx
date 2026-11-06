import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { readBookingApiResponse } from '../../services/bookingApiResponse.js'
import './NewsletterSignup.css'

export default function NewsletterSignup() {
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dotLottie, setDotLottie] = useState(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const updateMotionPreference = () => {
      setPrefersReducedMotion(motionPreference.matches)
    }

    motionPreference.addEventListener('change', updateMotionPreference)
    return () => {
      motionPreference.removeEventListener('change', updateMotionPreference)
    }
  }, [])

  useEffect(() => {
    if (!dotLottie) {
      return
    }

    if (prefersReducedMotion) {
      dotLottie.pause()
    } else {
      dotLottie.play()
    }
  }, [dotLottie, prefersReducedMotion])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity()
      return
    }

    const form = event.currentTarget
    const email = new FormData(form).get('email')
    setIsSubmitting(true)
    setFeedback({ type: '', message: '' })
    try {
      const response = await fetch(`${import.meta.env?.VITE_API_BASE_URL ?? '/api'}/newsletter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await readBookingApiResponse(response, 'Newsletter subscription')
      form.reset()
      setFeedback({ type: 'success', message: result.message || 'You are subscribed.' })
    } catch (error) {
      const message =
        error instanceof TypeError
          ? 'Newsletter subscription is temporarily unavailable. Please try again.'
          : error instanceof Error
            ? error.message
            : 'The newsletter subscription could not be saved.'
      setFeedback({
        type: 'error',
        message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="newsletter-section" aria-labelledby="newsletter-title">
      <div className="newsletter-section__container">
        <div className="newsletter-card">
          <div className="newsletter-card__layout">
            <div className="newsletter-card__visual" aria-hidden="true">
              <span className="newsletter-card__particle newsletter-card__particle--one" />
              <span className="newsletter-card__particle newsletter-card__particle--two" />
              <span className="newsletter-card__particle newsletter-card__particle--three" />
              <span className="newsletter-card__particle newsletter-card__particle--four" />
              <span className="newsletter-card__particle newsletter-card__particle--five" />
              <div className="newsletter-card__animation">
                <DotLottieReact
                  autoplay={!prefersReducedMotion}
                  backgroundColor="transparent"
                  className="newsletter-card__lottie"
                  dotLottieRefCallback={setDotLottie}
                  layout={{ fit: 'contain', align: [0.5, 0.5] }}
                  loop
                  src="/assets/folder/ani.lottie"
                />
              </div>
            </div>
            <svg
              className="newsletter-card__divider newsletter-card__divider--desktop"
              viewBox="0 0 120 600"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="newsletter-divider-glow" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#922BFF" stopOpacity=".15" />
                  <stop offset="52%" stopColor="#D026FF" stopOpacity=".72" />
                  <stop offset="100%" stopColor="#465BFF" stopOpacity=".18" />
                </linearGradient>
              </defs>
              <path
                className="newsletter-card__divider-fill"
                d="M67 0 C24 105 105 177 59 292 C12 407 104 503 53 600 L120 600 L120 0 Z"
              />
              <path
                className="newsletter-card__divider-line"
                d="M67 0 C24 105 105 177 59 292 C12 407 104 503 53 600"
                stroke="url(#newsletter-divider-glow)"
              />
            </svg>
            <svg
              className="newsletter-card__divider newsletter-card__divider--mobile"
              viewBox="0 0 600 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="newsletter-divider-glow-mobile" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#922BFF" stopOpacity=".15" />
                  <stop offset="52%" stopColor="#D026FF" stopOpacity=".72" />
                  <stop offset="100%" stopColor="#465BFF" stopOpacity=".18" />
                </linearGradient>
              </defs>
              <path
                className="newsletter-card__divider-fill"
                d="M0 48 C92 3 182 91 292 48 C402 5 497 89 600 42 L600 100 L0 100 Z"
              />
              <path
                className="newsletter-card__divider-line"
                d="M0 48 C92 3 182 91 292 48 C402 5 497 89 600 42"
                stroke="url(#newsletter-divider-glow-mobile)"
              />
            </svg>
            <div className="newsletter-card__content">
              <h2 id="newsletter-title">Stay in the VIBE.</h2>
              <p className="newsletter-card__description">
                Get exclusive event updates, exciting experiences and special
                invitations delivered straight to your inbox.
              </p>
              <form className="newsletter-form" onSubmit={handleSubmit}>
                <label className="newsletter-form__label" htmlFor="newsletter-email">
                  Email address
                </label>
                <div className="newsletter-form__controls">
                  <input
                    autoComplete="email"
                    className="newsletter-form__input"
                    id="newsletter-email"
                    maxLength={254}
                    name="email"
                    placeholder="Enter your email address"
                    required
                    type="email"
                  />
                  <button className="newsletter-form__button" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Subscribing…' : 'Subscribe Now'}
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </div>
                <p className="newsletter-form__note">
                  No spam. Just good vibes and unforgettable experiences.
                </p>
                <p
                  className={`newsletter-form__status${feedback.type ? ` is-${feedback.type}` : ''}`}
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
                >
                  {feedback.message}
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
