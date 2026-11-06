import { useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  CalendarDays,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import EventCard from '../components/events/EventCard.jsx'
import { categories } from '../data/categories.js'
import usePublicEvents from '../hooks/usePublicEvents.js'
import { filterEvents } from '../utils/eventDiscovery.js'
import './Events.css'

const PAGE_SIZE = 6
const priceOptions = [
  { value: 'free', label: 'Free events' },
  { value: 'paid', label: 'Paid events' },
]
const sortOptions = [
  { value: 'upcoming', label: 'Upcoming events' },
  { value: 'newest', label: 'Newest events' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'name', label: 'Event name: A to Z' },
]

export default function Events() {
  const { events, loading, error } = usePublicEvents()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [pricing, setPricing] = useState([])
  const [upcomingOnly, setUpcomingOnly] = useState(false)
  const [sortBy, setSortBy] = useState('upcoming')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filteredEvents = useMemo(() => {
    return filterEvents(events, {
      query,
      category,
      pricing,
      upcomingOnly,
      sortBy,
    })
  }, [category, events, pricing, query, sortBy, upcomingOnly])

  const visibleEvents = filteredEvents.slice(0, visibleCount)
  const hasActiveFilters =
    query.trim() !== '' ||
    category !== 'all' ||
    pricing.length > 0 ||
    upcomingOnly

  function togglePricing(type) {
    setVisibleCount(PAGE_SIZE)
    setPricing((currentPricing) =>
      currentPricing.includes(type)
        ? currentPricing.filter((currentType) => currentType !== type)
        : [...currentPricing, type],
    )
  }

  function resetFilters() {
    setQuery('')
    setCategory('all')
    setPricing([])
    setUpcomingOnly(false)
    setSortBy('upcoming')
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="events-discovery">
      <section className="events-hero" aria-labelledby="events-title">
        <div className="events-hero__glow" aria-hidden="true" />
        <Container className="events-hero__content">
          <p className="events-eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            Make a plan. Meet your people.
          </p>
          <h1 id="events-title">
            Find your <span className="gradient-text">next thing.</span>
          </h1>
          <p>
            Music, meetups, trips, and games worth leaving the house for.
          </p>
          <form
            className="events-search"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="event-search">
              Search events by name, location, or category
            </label>
            <input
              autoComplete="off"
              id="event-search"
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
              placeholder="Try “sing along” or “weekend trip”"
              type="search"
              value={query}
            />
            {query && (
              <button
                aria-label="Clear search"
                className="events-search__clear"
                onClick={() => {
                  setQuery('')
                  setVisibleCount(PAGE_SIZE)
                }}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </form>
          <p className="events-hero__hint">
            Search by event, location, or the kind of vibe you’re after.
          </p>
        </Container>
      </section>

      <section
        className="events-listing"
        aria-labelledby="events-listing-title"
      >
        <Container>
          <div className="events-listing__topline">
            <div>
              <p className="events-eyebrow">Good things are happening</p>
              <h2 id="events-listing-title">Explore events</h2>
            </div>
            <label className="events-sort">
              <ArrowDownWideNarrow size={17} aria-hidden="true" />
              <span className="sr-only">Sort events</span>
              <select
                onChange={(event) => setSortBy(event.target.value)}
                value={sortBy}
              >
                {sortOptions.map(({ label, value }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          </div>

          <div
            className={`events-filter-panel${filtersOpen ? ' is-open' : ''}`}
          >
            <button
              aria-controls="events-filter-content"
              aria-expanded={filtersOpen}
              className="events-filter-panel__toggle"
              onClick={() => setFiltersOpen((isOpen) => !isOpen)}
              type="button"
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              Filters
              <span className="events-filter-panel__count">
                {filteredEvents.length}
              </span>
            </button>
            <div
              className="events-filter-panel__content"
              id="events-filter-content"
            >
              <label className="events-filter-category">
                <span>Category</span>
                <select
                  onChange={(event) => {
                    setCategory(event.target.value)
                    setVisibleCount(PAGE_SIZE)
                  }}
                  value={category}
                >
                  <option value="all">All categories</option>
                  {categories.map(({ id, title }) => (
                    <option key={id} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="events-filter-options">
                <legend>Price</legend>
                {priceOptions.map(({ label, value }) => (
                  <label className="events-checkbox" key={value}>
                    <input
                      checked={pricing.includes(value)}
                      onChange={() => togglePricing(value)}
                      type="checkbox"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <label className="events-checkbox events-filter-upcoming">
                <input
                  checked={upcomingOnly}
                  onChange={(event) => {
                    setUpcomingOnly(event.target.checked)
                    setVisibleCount(PAGE_SIZE)
                  }}
                  type="checkbox"
                />
                <CalendarDays size={16} aria-hidden="true" />
                <span>Upcoming only</span>
              </label>

              {hasActiveFilters && (
                <button
                  className="events-filter-reset"
                  onClick={resetFilters}
                  type="button"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <p className="events-results-count" aria-live="polite">
            Showing {visibleEvents.length} of {filteredEvents.length}{' '}
            {filteredEvents.length === 1 ? 'event' : 'events'}
          </p>

          {error && <p className="events-empty" role="alert">{error}</p>}
          {loading ? (
            <p className="events-results-count" role="status">Loading available events…</p>
          ) : !error && visibleEvents.length > 0 ? (
            <div className="events-grid">
              {visibleEvents.map((event) => (
                <EventCard key={event.id} {...event} />
              ))}
            </div>
          ) : (
            <div className="events-empty" role="status">
              <span className="events-empty__icon">
                <Search size={22} aria-hidden="true" />
              </span>
              <h3>No events found this time.</h3>
              <p>
                Try another search or clear a filter. Your next great plan might
                be one small change away.
              </p>
              <Button onClick={resetFilters} variant="secondary">
                Clear search and filters
              </Button>
            </div>
          )}

          {visibleCount < filteredEvents.length && (
            <div className="events-load-more">
              <Button
                onClick={() =>
                  setVisibleCount((count) => count + PAGE_SIZE)
                }
                variant="outline"
              >
                Load more events
              </Button>
            </div>
          )}
        </Container>
      </section>
    </div>
  )
}
