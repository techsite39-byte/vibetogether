import { ArrowUpRight } from 'lucide-react'
import Button from '../common/Button.jsx'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'
import { getResponsiveImageSrcSet } from '../../utils/responsiveImage.js'
import {
  resetInteractiveTilt,
  updateInteractiveTilt,
} from '../../utils/interactiveTilt.js'

export default function CategoryCard({
  description,
  eventCount,
  image,
  imageAlt,
  title,
}) {
  const { openBooking } = useBookingEnquiry()

  return (
    <article
      className="category-card ui-category-card"
      onPointerLeave={resetInteractiveTilt}
      onPointerMove={updateInteractiveTilt}
    >
      <div className="category-card__media image-overlay">
        {image ? (
          <img
            className="category-card__image"
            src={image}
            srcSet={getResponsiveImageSrcSet(image)}
            sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
            alt={imageAlt ?? title ?? ''}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="category-card__image-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="category-card__content">
        {eventCount != null && (
          <p className="category-card__count">
            {typeof eventCount === 'number'
              ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`
              : `${eventCount} events`}
          </p>
        )}
        <h3 className="category-card__title">{title ?? 'Explore events'}</h3>
        {description && (
          <p className="category-card__description">{description}</p>
        )}
        <Button
          className="category-card__action"
          variant="secondary"
          onClick={() => openBooking(title)}
        >
          Book Now <ArrowUpRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}
