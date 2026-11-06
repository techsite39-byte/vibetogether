import { CalendarDays, Clock3, MapPin, Users, UsersRound } from 'lucide-react'
import Button from '../common/Button.jsx'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'
import {
  resetInteractiveTilt,
  updateInteractiveTilt,
} from '../../utils/interactiveTilt.js'

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

export default function EventCard({
  category,
  date,
  description,
  id,
  image,
  imageAlt,
  isFree,
  location,
  organizer,
  price,
  seatsAvailable,
  startsAt,
  time,
  title,
  to,
  showDescription = false,
}) {
  const { openBooking } = useBookingEnquiry()
  const isFreeEvent =
    isFree ?? (price === 0 || (typeof price === 'string' && price.toLowerCase() === 'free'))
  const eventTo = to ?? (id != null ? `/events/${encodeURIComponent(id)}` : undefined)

  return (
    <article
      className="event-card ui-event-card"
      onPointerLeave={resetInteractiveTilt}
      onPointerMove={updateInteractiveTilt}
    >
      <div className="event-card__media image-overlay">
        {image ? (
          <img
            className="event-card__image"
            src={image}
            alt={imageAlt ?? title ?? ''}
            loading="lazy"
          />
        ) : (
          <div className="event-card__image-placeholder" aria-hidden="true" />
        )}
        {category && <span className="event-card__category">{category}</span>}
        <span
          className={`event-card__price-tag${
            isFreeEvent ? ' event-card__price-tag--free' : ''
          }`}
        >
          {isFreeEvent ? 'Free' : price != null ? `Paid · ${price}` : 'Paid'}
        </span>
      </div>

      <div className="event-card__content">
        <h3 className="event-card__title">{title ?? 'Event'}</h3>
        {showDescription && description && (
          <p className="event-card__description">{description}</p>
        )}
        <div className="event-card__details">
          {date && (
            <p className="event-card__detail">
              <CalendarDays size={16} aria-hidden="true" />
              <span>
                <time dateTime={startsAt ?? date}>
                  {formatEventDate(date)}
                </time>
              </span>
            </p>
          )}
          {time && (
            <p className="event-card__detail">
              <Clock3 size={16} aria-hidden="true" />
              <span>{time}</span>
            </p>
          )}
          {location && (
            <p className="event-card__detail">
              <MapPin size={16} aria-hidden="true" />
              <span>{location}</span>
            </p>
          )}
          {organizer && (
            <p className="event-card__detail">
              <Users size={16} aria-hidden="true" />
              <span>{organizer}</span>
            </p>
          )}
          {seatsAvailable != null && (
            <p className="event-card__detail">
              <UsersRound size={16} aria-hidden="true" />
              <span>
                {seatsAvailable} {seatsAvailable === 1 ? 'seat' : 'seats'} left
              </span>
            </p>
          )}
        </div>
        <div className="event-card__footer">
          {organizer && (
            <span className="event-card__organizer">{organizer}</span>
          )}
          <div className="event-card__actions">
            <Button
              className="event-card__book"
              onClick={() => openBooking(id)}
              variant="secondary"
            >
              Book Now
            </Button>
            <Button
              className="event-card__action"
              to={eventTo}
              disabled={!eventTo}
            >
              View Details
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
