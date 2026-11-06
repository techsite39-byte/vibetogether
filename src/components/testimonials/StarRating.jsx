import { Star } from 'lucide-react'

const ratingValues = [1, 2, 3, 4, 5]

export default function StarRating({
  id = 'review-rating',
  interactive = false,
  label = 'Rating',
  onChange,
  required = false,
  value = 0,
}) {
  if (!interactive) {
    const accessibleRating = `${value.toFixed(1)} out of 5 stars`

    return (
      <span className="star-rating" role="img" aria-label={accessibleRating}>
        <span className="star-rating__icons" aria-hidden="true">
          {ratingValues.map((rating) => (
            <Star
              className={rating <= value ? 'is-filled' : ''}
              key={rating}
              size={17}
            />
          ))}
        </span>
        <span className="star-rating__value">{value.toFixed(1)}</span>
      </span>
    )
  }

  return (
    <fieldset className="star-rating star-rating--interactive">
      <legend className="sr-only">{label}</legend>
      <div className="star-rating__icons" role="radiogroup" aria-label={label}>
        {ratingValues.map((rating) => (
          <label
            className="star-rating__choice"
            key={rating}
            title={`${rating} star${rating === 1 ? '' : 's'}`}
          >
            <input
              aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
              checked={value === rating}
              name={id}
              onChange={() => onChange(rating)}
              required={required && rating === 1}
              type="radio"
              value={rating}
            />
            <Star
              aria-hidden="true"
              className={rating <= value ? 'is-filled' : ''}
              size={23}
            />
          </label>
        ))}
      </div>
      <span className="star-rating__selection" aria-live="polite">
        {value ? `${value} out of 5 stars selected` : 'Choose a rating'}
      </span>
    </fieldset>
  )
}
