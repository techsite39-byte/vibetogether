import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Minus,
  Plus,
  Share2,
  UsersRound,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import WhatsAppLink from '../components/contact/WhatsAppLink.jsx'
import EventCard from '../components/events/EventCard.jsx'
import NotFound from './NotFound.jsx'
import usePublicEvents from '../hooks/usePublicEvents.js'
import { getResponsiveImageSrcSet } from '../utils/responsiveImage.js'
import './EventDetails.css'

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

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function EventLightbox({ images, onClose, selectedIndex, onSelect }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const selectedImage = images[selectedIndex]

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow

      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }

      if (event.key === 'ArrowLeft') {
        onSelect((selectedIndex - 1 + images.length) % images.length)
      }

      if (event.key === 'ArrowRight') {
        onSelect((selectedIndex + 1) % images.length)
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not(:disabled):not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [images.length, onClose, onSelect, selectedIndex])

  return (
    <div
      className="event-lightbox"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-lightbox-caption"
      tabIndex={-1}
    >
      <button
        className="event-lightbox__backdrop"
        type="button"
        tabIndex={-1}
        aria-label="Close image viewer"
        onClick={onClose}
      />
      <div className="event-lightbox__stage">
        <button
          className="event-lightbox__close"
          type="button"
          aria-label="Close image viewer"
          onClick={onClose}
          ref={closeButtonRef}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <button
          className="event-lightbox__previous"
          type="button"
          aria-label="View previous image"
          onClick={() =>
            onSelect((selectedIndex - 1 + images.length) % images.length)
          }
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <figure className="event-lightbox__figure">
          <img
            src={selectedImage.src}
            srcSet={getResponsiveImageSrcSet(selectedImage.src)}
            sizes="80vw"
            alt={selectedImage.alt}
          />
          <figcaption id="event-lightbox-caption">
            {selectedImage.alt}
            <span>
              {selectedIndex + 1} / {images.length}
            </span>
          </figcaption>
        </figure>
        <button
          className="event-lightbox__next"
          type="button"
          aria-label="View next image"
          onClick={() => onSelect((selectedIndex + 1) % images.length)}
        >
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default function EventDetails() {
  const { id } = useParams()
  const { events, loading, error } = usePublicEvents()
  const event = events.find((item) => item.id === id)
  const [ticketSelection, setTicketSelection] = useState({
    eventId: id,
    count: 1,
  })
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [shareStatus, setShareStatus] = useState({ eventId: null, message: '' })
  const closeLightbox = useCallback(
    () => setLightboxIndex(null),
    [setLightboxIndex],
  )

  if (loading) {
    return <Container className="event-details"><p role="status">Loading event details…</p></Container>
  }

  if (!event) {
    return error
      ? <Container className="event-details"><p role="alert">{error}</p><NotFound /></Container>
      : <NotFound />
  }

  const ticketCount =
    ticketSelection.eventId === id ? ticketSelection.count : 1
  const shareMessage =
    shareStatus.eventId === id ? shareStatus.message : ''
  const images = [
    { src: event.image, alt: event.imageAlt },
    ...event.gallery,
  ].filter(
    (image, index, gallery) =>
      gallery.findIndex((item) => item.src === image.src) === index,
  )
  const relatedEvents = events.filter(
    (item) => item.category === event.category && item.id !== event.id,
  )
  const isSoldOut = event.seatsAvailable < 1
  const totalPrice = event.isFree ? 0 : event.priceAmount * ticketCount

  async function handleShare() {
    const shareData = {
      title: event.title,
      text: `Discover ${event.title} with VIBE TOGETHER.`,
      url: window.location.href,
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        setShareStatus({ eventId: id, message: 'Event shared.' })
        return
      } catch (error) {
        if (error.name === 'AbortError') {
          setShareStatus({ eventId: id, message: 'Sharing cancelled.' })
          return
        }
      }
    }

    if (!navigator.clipboard?.writeText) {
      setShareStatus({
        eventId: id,
        message: 'Sharing is unavailable in this browser.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(shareData.url)
      setShareStatus({
        eventId: id,
        message: 'Event link copied to clipboard.',
      })
    } catch {
      setShareStatus({
        eventId: id,
        message: 'Could not copy the event link. Please try again.',
      })
    }
  }

  return (
    <div className="event-detail">
      <section className="event-detail__hero" aria-labelledby="event-title">
        <img
          className="event-detail__hero-image"
          src={event.image}
          srcSet={getResponsiveImageSrcSet(event.image)}
          sizes="100vw"
          alt=""
          fetchPriority="high"
        />
        <div className="event-detail__hero-shade" aria-hidden="true" />
        <Container className="event-detail__hero-content">
          <Link className="event-detail__back" to="/events">
            <ArrowLeft size={16} aria-hidden="true" />
            All events
          </Link>
          <div className="event-detail__hero-copy">
            <p className="event-detail__eyebrow">{event.category}</p>
            <h1 id="event-title">{event.title}</h1>
            <p className="event-detail__hero-description">
              {event.description}
            </p>
            <div className="event-detail__hero-meta">
              <span>
                <CalendarDays size={17} aria-hidden="true" />
                {formatEventDate(event.date)}
              </span>
              <span>
                <Clock3 size={17} aria-hidden="true" />
                {event.time}
              </span>
              <span>
                <MapPin size={17} aria-hidden="true" />
                {event.location}
              </span>
            </div>
            <div className="event-detail__hero-status">
              <span
                className={`event-detail__status-badge${
                  event.isFree ? ' event-detail__status-badge--free' : ''
                }`}
              >
                {event.isFree ? 'Free entry' : `Paid · ${event.price}`}
              </span>
              <span className="event-detail__seat-count">
                <UsersRound size={17} aria-hidden="true" />
                {isSoldOut
                  ? 'Sold out'
                  : `${event.seatsAvailable} ${
                      event.seatsAvailable === 1 ? 'seat' : 'seats'
                    } available`}
              </span>
            </div>
            <div className="event-detail__hero-actions">
              <Button
                type="button"
                variant="outline"
                onClick={handleShare}
                aria-describedby="event-share-status"
              >
                <Share2 size={17} aria-hidden="true" />
                Share event
              </Button>
              <Button
                to={`/booking/${encodeURIComponent(event.id)}`}
                state={{ eventId: event.id, ticketCount }}
                disabled={isSoldOut}
              >
                {isSoldOut ? 'Sold out' : 'Book now'}
              </Button>
            </div>
            <p
              className="event-detail__share-status"
              id="event-share-status"
              role="status"
              aria-live="polite"
            >
              {shareMessage}
            </p>
          </div>
        </Container>
      </section>

      <Container className="event-detail__layout">
        <div className="event-detail__main">
          <section className="event-detail__section" aria-labelledby="about-event">
            <p className="event-detail__section-label">The experience</p>
            <h2 id="about-event">A little more about the gathering</h2>
            <p className="event-detail__body">{event.description}</p>
            <ul className="event-detail__highlights">
              {event.highlights.map((highlight) => (
                <li key={highlight}>
                  <Check size={18} aria-hidden="true" />
                  {highlight}
                </li>
              ))}
            </ul>
          </section>

          <section className="event-detail__section" aria-labelledby="event-gallery">
            <div className="event-detail__section-heading">
              <div>
                <p className="event-detail__section-label">A glimpse</p>
                <h2 id="event-gallery">Moments like these</h2>
              </div>
              <span className="event-detail__gallery-count">
                {images.length} photos
              </span>
            </div>
            <div className="event-gallery">
              {images.map((image, index) => (
                <button
                  className={`event-gallery__item${
                    index === 0 ? ' event-gallery__item--featured' : ''
                  }`}
                  key={image.src}
                  type="button"
                  aria-label={`View image ${index + 1}: ${image.alt}`}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img
                    src={image.src}
                    srcSet={getResponsiveImageSrcSet(image.src)}
                    sizes="(max-width: 48rem) 100vw, 50vw"
                    alt={image.alt}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="event-gallery__zoom" aria-hidden="true">
                    <Plus size={18} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="event-detail__section" aria-labelledby="included">
            <p className="event-detail__section-label">Made for sharing</p>
            <h2 id="included">What to expect</h2>
            <div className="event-detail__activities">
              {event.activities.map((activity, index) => (
                <div className="event-detail__activity" key={activity}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{activity}</h3>
                </div>
              ))}
            </div>
          </section>

          <section className="event-detail__section" aria-labelledby="schedule">
            <p className="event-detail__section-label">Plan your visit</p>
            <h2 id="schedule">The flow of the day</h2>
            <ol className="event-schedule">
              {event.schedule.map((item) => (
                <li className="event-schedule__item" key={item.time}>
                  <time>{item.time}</time>
                  <span>{item.activity}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="event-detail__section" aria-labelledby="venue">
            <p className="event-detail__section-label">Getting there</p>
            <h2 id="venue">The venue</h2>
            <p className="event-detail__body">{event.venueDetails}</p>
            <p className="event-detail__venue-address">
              <MapPin size={18} aria-hidden="true" />
              {event.location}
            </p>
          </section>

          <section className="event-detail__section" aria-labelledby="organizer">
            <p className="event-detail__section-label">The people behind it</p>
            <h2 id="organizer">Your host</h2>
            <div className="event-detail__organizer">
              <span className="event-detail__organizer-mark" aria-hidden="true">
                VT
              </span>
              <div>
                <h3>{event.organizer}</h3>
                <p>Creating room for people to find their shared vibe.</p>
              </div>
            </div>
          </section>

          <section className="event-detail__section" aria-labelledby="guidelines">
            <p className="event-detail__section-label">Good to know</p>
            <h2 id="guidelines">A few friendly guidelines</h2>
            <ul className="event-detail__guidelines">
              {event.guidelines.map((guideline) => (
                <li key={guideline}>{guideline}</li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="event-booking" aria-labelledby="booking-title">
          <p className="event-detail__section-label">Save your spot</p>
          <h2 id="booking-title">Make it a plan.</h2>
          <p className="event-booking__date">
            <CalendarDays size={17} aria-hidden="true" />
            {formatEventDate(event.date)}
          </p>
          <p className="event-booking__price">
            {event.isFree ? 'FREE' : formatPrice(event.priceAmount, event.currency)}
            {!event.isFree && <span> / person</span>}
          </p>
          <p
            className={`event-booking__availability${
              isSoldOut ? ' event-booking__availability--sold-out' : ''
            }`}
          >
            <UsersRound size={17} aria-hidden="true" />
            {isSoldOut
              ? 'No seats currently available'
              : `${event.seatsAvailable} ${
                  event.seatsAvailable === 1 ? 'seat' : 'seats'
                } available`}
          </p>
          <div className="event-booking__quantity">
            <label htmlFor="ticket-count">Tickets</label>
            <div className="event-booking__stepper">
              <Button
                className="event-booking__stepper-button"
                variant="secondary"
                aria-label="Remove one ticket"
                disabled={ticketCount <= 1}
                onClick={() =>
                  setTicketSelection((current) => ({
                    eventId: id,
                    count: Math.max(
                      1,
                      (current.eventId === id ? current.count : 1) - 1,
                    ),
                  }))
                }
              >
                <Minus size={16} aria-hidden="true" />
              </Button>
              <output id="ticket-count" aria-live="polite">
                {ticketCount}
              </output>
              <Button
                className="event-booking__stepper-button"
                variant="secondary"
                aria-label="Add one ticket"
                disabled={isSoldOut || ticketCount >= event.seatsAvailable}
                onClick={() =>
                  setTicketSelection((current) => ({
                    eventId: id,
                    count: Math.min(
                      event.seatsAvailable,
                      (current.eventId === id ? current.count : 1) + 1,
                    ),
                  }))
                }
              >
                <Plus size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="event-booking__total">
            <span>Total</span>
            <strong>
              {event.isFree ? 'FREE' : formatPrice(totalPrice, event.currency)}
            </strong>
          </div>
          <Button
            className="event-booking__submit"
            to={`/booking/${encodeURIComponent(event.id)}`}
            state={{ eventId: event.id, ticketCount }}
            disabled={isSoldOut}
          >
            {isSoldOut ? 'Sold out' : 'Book now'}
          </Button>
          <p className="event-booking__note">
            Booking and payment will be completed in a later step.
          </p>
          <WhatsAppLink
            className="event-booking__whatsapp"
            label="Ask about this event"
            message={`Hi VIBE TOGETHER, I have a question about "${event.title}" (${event.category}, ${formatEventDate(event.date)}).`}
          />
        </aside>
      </Container>

      {relatedEvents.length > 0 && (
        <section
          className="event-detail__related"
          aria-labelledby="related-events-title"
        >
          <Container>
            <div className="event-detail__section-heading">
              <div>
                <p className="event-detail__section-label">More of your vibe</p>
                <h2 id="related-events-title">More {event.category}</h2>
              </div>
              <Link className="event-detail__all-events" to="/events">
                Explore all events <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="event-detail__related-grid">
              {relatedEvents.map((relatedEvent) => (
                <EventCard key={relatedEvent.id} {...relatedEvent} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {lightboxIndex !== null && (
        <EventLightbox
          images={images}
          onClose={closeLightbox}
          onSelect={setLightboxIndex}
          selectedIndex={lightboxIndex}
        />
      )}
    </div>
  )
}
