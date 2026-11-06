import { CalendarDays, Quote } from 'lucide-react'
import StarRating from './StarRating.jsx'

function formatEventDate(date) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

export default function TestimonialCard({ review, featured = false }) {
  const initials = review.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <article
      className={`testimonial-card${featured ? ' testimonial-card--featured' : ''}`}
    >
      {featured && (
        <Quote
          className="testimonial-card__quote-mark"
          size={36}
          aria-hidden="true"
        />
      )}
      <div className="testimonial-card__topline">
        <span className="testimonial-card__category">{review.category}</span>
        <StarRating value={review.rating} />
      </div>
      <h3>{review.title}</h3>
      <blockquote>{review.quote}</blockquote>
      <div className="testimonial-card__event">
        <span>Attended</span>
        <strong>{review.event}</strong>
      </div>
      <footer className="testimonial-card__footer">
        <span className="testimonial-card__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="testimonial-card__identity">
          <strong>{review.name}</strong>
          <span className="testimonial-card__date">
            <CalendarDays size={14} aria-hidden="true" />
            <time dateTime={review.eventDate}>
              {formatEventDate(review.eventDate)}
            </time>
          </span>
        </span>
        <span className="testimonial-card__demo">Demo</span>
      </footer>
    </article>
  )
}
