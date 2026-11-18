import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Compass, X } from 'lucide-react'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'
import './EventPosterModal.css'

const STORAGE_KEY = 'vibetogether:poster-popup-v1'

const POSTERS = [
  {
    step: 1,
    id: 'poster-1',
    mobile: '/m1.webp',
    desktop: '/p1.webp',
    mobileWidth: 941,
    mobileHeight: 1672,
    desktopWidth: 1672,
    desktopHeight: 941,
    alt: 'VibeTogether Featured Experience — Event Announcement',
    badge: 'FEATURED EXPERIENCE',
  },
  {
    step: 2,
    id: 'poster-2',
    mobile: '/m2.webp',
    desktop: '/p2.webp',
    mobileWidth: 941,
    mobileHeight: 1672,
    desktopWidth: 1672,
    desktopHeight: 941,
    alt: 'VibeTogether Community Gathering — Upcoming Event',
    badge: 'UPCOMING EVENT',
  },
]

function readStoredStep() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return 'dismissed'
    }
    const val = window.sessionStorage.getItem(STORAGE_KEY)
    if (val === 'dismissed' || val === '2') {
      return val
    }
    return '1'
  } catch {
    // In incognito or restricted storage environments, fail safely
    return 'dismissed'
  }
}

function writeStoredStep(step) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, String(step))
    }
  } catch {
    // Graceful error handling for storage quota / security exceptions
  }
}

export default function EventPosterModal() {
  const navigate = useNavigate()
  const { openBooking } = useBookingEnquiry()
  const [currentStep, setCurrentStep] = useState(null)
  const dialogRef = useRef(null)

  // Initialize from sessionStorage on client mount
  useEffect(() => {
    const stored = readStoredStep()
    if (stored === 'dismissed') {
      setCurrentStep(null)
    } else if (stored === '2') {
      setCurrentStep(2)
    } else {
      setCurrentStep(1)
    }
  }, [])

  // Lock background body scroll while the popup is visible
  useEffect(() => {
    if (currentStep === null) return undefined

    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    // Prevent layout shift from scrollbar disappearing
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [currentStep])

  // Transition from Poster 1 to Poster 2
  const handleAdvanceSequence = useCallback(() => {
    if (currentStep === 1) {
      writeStoredStep('2')
      setCurrentStep(2)
    } else {
      writeStoredStep('dismissed')
      setCurrentStep(null)
    }
  }, [currentStep])

  // Fully dismiss popup (e.g. clicking backdrop outside the poster)
  const handleDismissEntirely = useCallback(() => {
    writeStoredStep('dismissed')
    setCurrentStep(null)
  }, [])

  // Handle keyboard events (Escape follows sequence: step 1 -> step 2 -> dismiss)
  useEffect(() => {
    if (currentStep === null) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleAdvanceSequence()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep, handleAdvanceSequence])

  // Explore Events navigation handler
  const handleExploreEvents = useCallback(() => {
    writeStoredStep('dismissed')
    setCurrentStep(null)
    navigate('/events')
  }, [navigate])

  const handlePosterClick = useCallback(() => {
    writeStoredStep('dismissed')
    setCurrentStep(null)
    openBooking()
  }, [openBooking])

  const activePoster = useMemo(() => {
    return POSTERS.find((p) => p.step === currentStep) || null
  }, [currentStep])

  if (!activePoster) {
    return null
  }

  return (
    <div
      className="event-poster-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={activePoster.alt}
      onClick={handleDismissEntirely}
    >
      <div
        className="event-poster-dialog"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="event-poster-glow" aria-hidden="true" />

        <div className="event-poster-card">
          {/* Header Status & Badge */}
          <div className="event-poster-header">
            <span className="event-poster-badge">
              <span className="event-poster-badge__pulse" aria-hidden="true" />
              <span>{activePoster.badge}</span>
            </span>
          </div>

          {/* Top-Right Circular Close Button */}
          <button
            type="button"
            className="event-poster-close-btn"
            onClick={handleAdvanceSequence}
            aria-label={currentStep === 1 ? 'Next event poster' : 'Close poster popup'}
            title="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>

          {/* Interactive Poster Image with Responsive Picture */}
          <div
            className="event-poster-media-wrap"
            onClick={handlePosterClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handlePosterClick()
              }
            }}
            title="Click to explore event details"
          >
            <picture className="event-poster-picture">
              {/* Mobile Portrait Variant */}
              <source
                media="(max-width: 768px)"
                srcSet={activePoster.mobile}
                type="image/webp"
                width={activePoster.mobileWidth}
                height={activePoster.mobileHeight}
              />
              {/* Desktop Landscape Variant */}
              <source
                media="(min-width: 769px)"
                srcSet={activePoster.desktop}
                type="image/webp"
                width={activePoster.desktopWidth}
                height={activePoster.desktopHeight}
              />
              {/* Fallback Image */}
              <img
                src={activePoster.desktop}
                alt={activePoster.alt}
                width={activePoster.desktopWidth}
                height={activePoster.desktopHeight}
                // Poster 2 is not mounted or downloaded until it becomes active.
                loading="eager"
                fetchPriority={currentStep === 1 ? 'high' : 'auto'}
                decoding="async"
                className="event-poster-image"
              />
            </picture>
          </div>

          {/* Footer Action Bar */}
          <div className="event-poster-footer">
            <div className="event-poster-step-dots" aria-label={`Poster ${currentStep} of 2`}>
              <span
                className={`event-poster-dot${currentStep === 1 ? ' is-active' : ''}`}
                aria-hidden="true"
              />
              <span
                className={`event-poster-dot${currentStep === 2 ? ' is-active' : ''}`}
                aria-hidden="true"
              />
            </div>

            <button
              type="button"
              className="event-poster-cta-btn"
              onClick={handleExploreEvents}
            >
              <Compass size={16} aria-hidden="true" />
              <span>Explore Events</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
