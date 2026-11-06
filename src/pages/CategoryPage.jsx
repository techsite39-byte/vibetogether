import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import EventCard from '../components/events/EventCard.jsx'
import SectionHeading from '../components/common/SectionHeading.jsx'
import { categories } from '../data/categories.js'
import { categoryPages } from '../data/categoryPages.js'
import usePublicEvents from '../hooks/usePublicEvents.js'
import './CategoryPage.css'

export default function CategoryPage({ categoryId }) {
  const { events, loading, error } = usePublicEvents()
  const category = categories.find(({ id }) => id === categoryId)
  const page = categoryPages[categoryId]

  if (!category || !page) {
    return null
  }

  const categoryEvents = events.filter(
    (event) => event.category === category.title,
  )

  return (
    <div className={`category-page category-page--${category.id}`}>
      <section
        className="category-hero"
        style={{ '--category-image': `url("${category.image}")` }}
        aria-labelledby="category-title"
      >
        <div className="category-hero__art" aria-hidden="true" />
        <Container className="category-hero__content">
          <Link className="category-back-link" to="/#discover-categories">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to categories
          </Link>
          <p className="category-hero__eyebrow">{page.eyebrow}</p>
          <h1 className="category-hero__title" id="category-title">
            {category.title}
          </h1>
          <p className="category-hero__headline">{page.headline}</p>
          <p className="category-hero__description">{page.description}</p>
          <div className="category-hero__actions">
            <Button to="/events">
              Explore events <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </div>
          <ul className="category-feature-list" aria-label={`${category.title} experiences`}>
            {page.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </Container>
      </section>

      <section
        className="category-events home-section"
        id="category-events"
        aria-labelledby="category-events-title"
      >
        <Container>
          <div className="category-events__heading">
            <SectionHeading
              label={`${categoryEvents.length} ${
                categoryEvents.length === 1 ? 'experience' : 'experiences'
              }`}
              titleId="category-events-title"
              title={`Explore ${category.title}`}
              description={category.description}
            />
            <Button
              className="category-events__back"
              to="/#discover-categories"
              variant="secondary"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to categories
            </Button>
          </div>

          {loading ? (
            <p role="status">Loading available events…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : categoryEvents.length > 0 ? (
            <div className="category-events__grid">
              {categoryEvents.map((event) => (
                <EventCard key={event.id} {...event} />
              ))}
            </div>
          ) : (
            <div className="category-empty">
              <span className="category-empty__eyebrow">
                New plans are on the way
              </span>
              <h3>No events to show just yet.</h3>
              <p>
                We are putting together more {category.title.toLowerCase()}{' '}
                experiences. Check back soon or explore what else is happening.
              </p>
              <Button to="/events" variant="outline">
                Browse all events
              </Button>
            </div>
          )}
        </Container>
      </section>
    </div>
  )
}
