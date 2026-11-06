import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Heart, MessageCircle, Search, Sparkles } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import StarRating from '../components/testimonials/StarRating.jsx'
import TestimonialCard from '../components/testimonials/TestimonialCard.jsx'
import { categories } from '../data/categories.js'
import {
  demoReviewEvents,
  demoTestimonials,
} from '../data/testimonials.js'
import { getDemoReviews, saveDemoReview } from '../utils/reviewStorage.js'
import './Testimonials.css'

const initialForm = {
  name: '',
  eventId: '',
  rating: 0,
  title: '',
  quote: '',
}

function readLocalReviews() {
  try {
    return { reviews: getDemoReviews(), error: '' }
  } catch (error) {
    return {
      reviews: [],
      error:
        error instanceof Error
          ? error.message
          : 'Local demo reviews could not be loaded.',
    }
  }
}

function createReviewId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function validateReview(form) {
  const errors = {}
  const name = form.name.trim()
  const title = form.title.trim()
  const quote = form.quote.trim()

  if (name.length < 2 || name.length > 60) {
    errors.name = 'Enter a name between 2 and 60 characters.'
  }

  if (!demoReviewEvents.some((event) => event.id === form.eventId)) {
    errors.eventId = 'Choose the event you attended.'
  }

  if (!Number.isInteger(form.rating) || form.rating < 1 || form.rating > 5) {
    errors.rating = 'Choose a star rating from 1 to 5.'
  }

  if (title.length < 4 || title.length > 100) {
    errors.title = 'Enter a title between 4 and 100 characters.'
  }

  if (quote.length < 20 || quote.length > 1000) {
    errors.quote = 'Write between 20 and 1,000 characters.'
  }

  return errors
}

function AnimatedStat({ decimals = 0, suffix = '', value }) {
  const [displayValue, setDisplayValue] = useState(0)
  const frameId = useRef(null)

  useEffect(() => {
    const startTime = performance.now()
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    function updateNumber(now) {
      const progress = reducedMotion
        ? 1
        : Math.min((now - startTime) / 900, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      setDisplayValue(value * easedProgress)

      if (progress < 1) {
        frameId.current = requestAnimationFrame(updateNumber)
      }
    }

    frameId.current = requestAnimationFrame(updateNumber)
    return () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current)
      }
    }
  }, [value])

  const formattedValue =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toLocaleString('en')

  return <strong>{formattedValue}{suffix}</strong>
}

export default function Testimonials() {
  const [initialReviews] = useState(readLocalReviews)
  const [localReviews, setLocalReviews] = useState(initialReviews.reviews)
  const [storageError, setStorageError] = useState(initialReviews.error)
  const [form, setForm] = useState(initialForm)
  const [formErrors, setFormErrors] = useState({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')

  const allReviews = useMemo(
    () => [...demoTestimonials, ...localReviews],
    [localReviews],
  )

  const filteredReviews = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase()

    return allReviews
      .filter(
        (review) =>
          ratingFilter === 'all' || review.rating === Number(ratingFilter),
      )
      .filter(
        (review) =>
          categoryFilter === 'all' || review.categoryId === categoryFilter,
      )
      .filter((review) => {
        const searchableText = [
          review.name,
          review.event,
          review.title,
          review.quote,
          review.category,
        ]
          .join(' ')
          .toLocaleLowerCase()

        return !searchTerm || searchableText.includes(searchTerm)
      })
      .sort((first, second) => {
        if (sortOrder === 'highest-rated') {
          return (
            second.rating - first.rating ||
            new Date(second.createdAt ?? second.eventDate) -
              new Date(first.createdAt ?? first.eventDate)
          )
        }

        return (
          new Date(second.createdAt ?? second.eventDate) -
          new Date(first.createdAt ?? first.eventDate)
        )
      })
  }, [allReviews, categoryFilter, ratingFilter, search, sortOrder])

  const featuredReview = demoTestimonials.find((review) => review.featured)
  const averageRating =
    allReviews.reduce((total, review) => total + review.rating, 0) /
    (allReviews.length || 1)
  const fiveStarPercentage = Math.round(
    (allReviews.filter((review) => review.rating === 5).length /
      (allReviews.length || 1)) *
      100,
  )

  function updateForm(field, value) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
    setSubmitMessage('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    const errors = validateReview(form)
    setFormErrors(errors)
    setSubmitMessage('')

    if (Object.keys(errors).length > 0) {
      return
    }

    const eventAttended = demoReviewEvents.find(
      (reviewEvent) => reviewEvent.id === form.eventId,
    )
    const review = {
      id: createReviewId(),
      name: form.name.trim(),
      event: eventAttended.title,
      eventId: eventAttended.id,
      category: eventAttended.category,
      categoryId: eventAttended.categoryId,
      rating: form.rating,
      title: form.title.trim(),
      quote: form.quote.trim(),
      eventDate: eventAttended.date,
      createdAt: new Date().toISOString(),
      demo: true,
    }

    try {
      saveDemoReview(review)
      setLocalReviews((currentReviews) => [...currentReviews, review])
      setStorageError('')
      setForm(initialForm)
      setFormErrors({})
      setRatingFilter('all')
      setCategoryFilter('all')
      setSearch('')
      setSortOrder('newest')
      setSubmitMessage(
        'Saved as a local demo review in this browser only. It has not been published or verified.',
      )
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : 'Your demo review could not be saved.',
      )
    }
  }

  return (
    <div className="testimonials-page">
      <section
        className="testimonials-hero"
        aria-labelledby="testimonials-page-title"
      >
        <div
          className="testimonials-hero__orb testimonials-hero__orb--one"
          aria-hidden="true"
        />
        <div
          className="testimonials-hero__orb testimonials-hero__orb--two"
          aria-hidden="true"
        />
        <Container className="testimonials-hero__content">
          <p className="testimonials-eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            Notes from the community
          </p>
          <h1 id="testimonials-page-title">
            REAL PEOPLE.
            <br />
            <span className="gradient-text">REAL CONNECTIONS.</span>
          </h1>
          <p className="testimonials-hero__subtitle">
            Discover the experiences and memories created by our community.
          </p>
          <p className="testimonials-demo-notice">
            Demonstration content only — these sample stories and statistics
            are not verified customer reviews.
          </p>
          <a
            className="button button--primary testimonials-hero__cta"
            href="#community-reviews"
          >
            Read the stories <ArrowDown size={17} aria-hidden="true" />
          </a>
          <div className="testimonials-stats" aria-label="Demonstration review statistics">
            <div className="testimonials-stat">
              <AnimatedStat decimals={1} value={averageRating} />
              <StarRating value={averageRating} />
              <span>Average demo rating</span>
            </div>
            <div className="testimonials-stat">
              <AnimatedStat value={allReviews.length} />
              <span>Sample + local demo reviews</span>
            </div>
            <div className="testimonials-stat">
              <AnimatedStat suffix="%" value={fiveStarPercentage} />
              <span>Sample reviews rated 5 stars</span>
            </div>
            <div className="testimonials-stat">
              <AnimatedStat value={1240} />
              <span>Illustrative community members</span>
            </div>
          </div>
        </Container>
      </section>

      <section
        className="testimonials-featured testimonials-section"
        aria-labelledby="featured-review-title"
      >
        <Container>
          <div className="testimonials-section__heading">
            <p className="testimonials-eyebrow">One story to start with</p>
            <h2 id="featured-review-title">A little more than a night out.</h2>
          </div>
          <TestimonialCard featured review={featuredReview} />
        </Container>
      </section>

      <section
        className="testimonials-reviews testimonials-section"
        id="community-reviews"
        aria-labelledby="community-reviews-title"
      >
        <Container>
          <div className="testimonials-section__heading">
            <div>
              <p className="testimonials-eyebrow">The community, in their words</p>
              <h2 id="community-reviews-title">Stories worth sharing.</h2>
              <p>
                Browse demonstration reviews by event, rating, or a name you
                recognize.
              </p>
            </div>
            <span className="testimonials-section__count">
              {filteredReviews.length}{' '}
              {filteredReviews.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          <div className="testimonials-toolbar">
            <div className="testimonials-toolbar__filters">
              <div
                className="testimonials-filter-group"
                role="group"
                aria-label="Filter by star rating"
              >
                {[
                  { id: 'all', label: 'All ratings' },
                  { id: '5', label: '5 stars' },
                  { id: '4', label: '4 stars' },
                ].map((filter) => (
                  <button
                    aria-pressed={ratingFilter === filter.id}
                    className={`testimonials-filter${
                      ratingFilter === filter.id ? ' is-active' : ''
                    }`}
                    key={filter.id}
                    onClick={() => setRatingFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="testimonials-select">
                <span className="sr-only">Filter by event category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="testimonials-toolbar__search-sort">
              <label className="testimonials-search">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Search reviews by name or event</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or event"
                  type="search"
                  value={search}
                />
              </label>
              <label className="testimonials-select">
                <span className="sr-only">Sort reviews</span>
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="highest-rated">Highest rated</option>
                </select>
              </label>
            </div>
          </div>

          <p className="testimonials-results" role="status" aria-live="polite">
            Showing {filteredReviews.length} of {allReviews.length} demo reviews
          </p>

          {filteredReviews.length > 0 ? (
            <div className="testimonials-grid">
              {filteredReviews.map((review) => (
                <TestimonialCard key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <div className="testimonials-empty">
              <Search size={25} aria-hidden="true" />
              <h3>No matching reviews.</h3>
              <p>Try another search or clear one of the selected filters.</p>
              <Button
                onClick={() => {
                  setRatingFilter('all')
                  setCategoryFilter('all')
                  setSearch('')
                }}
                variant="outline"
              >
                Show all reviews
              </Button>
            </div>
          )}
        </Container>
      </section>

      <section
        className="testimonials-write testimonials-section"
        id="write-review"
        aria-labelledby="write-review-title"
      >
        <Container className="testimonials-write__layout">
          <div className="testimonials-write__intro">
            <p className="testimonials-eyebrow">
              <MessageCircle size={16} aria-hidden="true" />
              Your turn to tell the story
            </p>
            <h2 id="write-review-title">Leave a little love.</h2>
            <p>
              Share a demonstration review to see how the experience works.
              Your submission stays in this browser and is not published,
              verified, or sent to a server.
            </p>
            <div className="testimonials-write__privacy">
              <Heart size={18} aria-hidden="true" />
              <span>Local-only demo. No account or backend is connected.</span>
            </div>
          </div>

          <form
            className="testimonial-form"
            noValidate
            onSubmit={handleSubmit}
          >
            <p className="testimonial-form__notice">
              Demo submissions are saved locally on this device only.
            </p>
            {storageError && (
              <p className="testimonial-form__error" role="alert">
                {storageError}
              </p>
            )}
            <div className="testimonial-form__grid">
              <div className="testimonial-form__field">
                <label htmlFor="reviewer-name">Your name</label>
                <input
                  autoComplete="name"
                  id="reviewer-name"
                  maxLength={60}
                  onChange={(event) => updateForm('name', event.target.value)}
                  value={form.name}
                  aria-invalid={Boolean(formErrors.name)}
                  aria-describedby={formErrors.name ? 'reviewer-name-error' : undefined}
                />
                {formErrors.name && (
                  <span className="testimonial-form__error" id="reviewer-name-error">
                    {formErrors.name}
                  </span>
                )}
              </div>
              <div className="testimonial-form__field">
                <label htmlFor="review-event">Event attended</label>
                <select
                  id="review-event"
                  onChange={(event) => updateForm('eventId', event.target.value)}
                  value={form.eventId}
                  aria-invalid={Boolean(formErrors.eventId)}
                  aria-describedby={formErrors.eventId ? 'review-event-error' : undefined}
                >
                  <option value="">Choose a demonstration event</option>
                  {demoReviewEvents.map((reviewEvent) => (
                    <option key={reviewEvent.id} value={reviewEvent.id}>
                      {reviewEvent.title} · {reviewEvent.category}
                    </option>
                  ))}
                </select>
                {formErrors.eventId && (
                  <span className="testimonial-form__error" id="review-event-error">
                    {formErrors.eventId}
                  </span>
                )}
              </div>
              <div className="testimonial-form__field testimonial-form__field--rating">
                <span className="testimonial-form__label">Your rating</span>
                <StarRating
                  id="new-review-rating"
                  interactive
                  label="Choose a star rating"
                  onChange={(rating) => updateForm('rating', rating)}
                  required
                  value={form.rating}
                />
                {formErrors.rating && (
                  <span className="testimonial-form__error" role="alert">
                    {formErrors.rating}
                  </span>
                )}
              </div>
              <div className="testimonial-form__field">
                <label htmlFor="review-title">Review title</label>
                <input
                  id="review-title"
                  maxLength={100}
                  onChange={(event) => updateForm('title', event.target.value)}
                  value={form.title}
                  aria-invalid={Boolean(formErrors.title)}
                  aria-describedby={formErrors.title ? 'review-title-error' : undefined}
                />
                {formErrors.title && (
                  <span className="testimonial-form__error" id="review-title-error">
                    {formErrors.title}
                  </span>
                )}
              </div>
              <div className="testimonial-form__field testimonial-form__field--full">
                <label htmlFor="review-feedback">Your experience</label>
                <textarea
                  id="review-feedback"
                  maxLength={1000}
                  onChange={(event) => updateForm('quote', event.target.value)}
                  rows={5}
                  value={form.quote}
                  aria-invalid={Boolean(formErrors.quote)}
                  aria-describedby={formErrors.quote ? 'review-feedback-error' : undefined}
                />
                <span className="testimonial-form__character-count">
                  {form.quote.length}/1,000 characters
                </span>
                {formErrors.quote && (
                  <span className="testimonial-form__error" id="review-feedback-error">
                    {formErrors.quote}
                  </span>
                )}
              </div>
            </div>
            {submitMessage && (
              <p className="testimonial-form__success" role="status">
                {submitMessage}
              </p>
            )}
            <Button className="testimonial-form__submit" type="submit">
              Save demo review <Sparkles size={17} aria-hidden="true" />
            </Button>
          </form>
        </Container>
      </section>

      <section className="testimonials-closing">
        <Container className="testimonials-closing__inner">
          <div>
            <p className="testimonials-eyebrow">Different people. One vibe.</p>
            <h2>Your next story starts out there.</h2>
          </div>
          <Button to="/events" variant="primary">
            Explore events <Sparkles size={17} aria-hidden="true" />
          </Button>
        </Container>
      </section>
    </div>
  )
}
