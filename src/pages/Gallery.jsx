import { useCallback, useMemo, useState } from 'react'
import { ArrowDown, Search, Sparkles, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import GalleryCard from '../components/gallery/GalleryCard.jsx'
import GalleryLightbox from '../components/gallery/GalleryLightbox.jsx'
import VideoCard from '../components/gallery/VideoCard.jsx'
import { galleryCategories, galleryMemories, galleryVideos } from '../data/gallery.js'
import './Gallery.css'

const ALL_CATEGORIES = 'all'
const categoryTitleById = new Map(
  galleryCategories.map((category) => [category.id, category.title]),
)
const memoriesWithCategory = galleryMemories.map((memory) => ({
  ...memory,
  category: categoryTitleById.get(memory.categoryId) ?? '',
}))

export default function Gallery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedMemoryId = searchParams.get('memory')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [query, setQuery] = useState('')
  const [shareMessage, setShareMessage] = useState('')

  const filteredMemories = useMemo(() => {
    const searchTerm = query.trim().toLocaleLowerCase()

    return memoriesWithCategory
      .filter(
        (memory) =>
          selectedCategory === ALL_CATEGORIES ||
          memory.categoryId === selectedCategory,
      )
      .filter((memory) => {
        const searchableText = [
          memory.title,
          memory.caption,
          categoryTitleById.get(memory.categoryId),
        ]
          .join(' ')
          .toLocaleLowerCase()

        return !searchTerm || searchableText.includes(searchTerm)
      })
  }, [query, selectedCategory])

  const filteredVideos = useMemo(() => {
    const searchTerm = query.trim().toLocaleLowerCase()

    return galleryVideos
      .filter(
        (video) =>
          selectedCategory === ALL_CATEGORIES ||
          video.categoryId === selectedCategory,
      )
      .filter((video) => {
        const searchableText = [
          video.title,
          video.description,
          categoryTitleById.get(video.categoryId),
        ]
          .join(' ')
          .toLocaleLowerCase()

        return !searchTerm || searchableText.includes(searchTerm)
      })
      .map((video) => ({
        ...video,
        category: categoryTitleById.get(video.categoryId) ?? '',
      }))
  }, [query, selectedCategory])

  const selectedIndex = memoriesWithCategory.findIndex(
    (memory) => memory.id === linkedMemoryId,
  )

  const closeLightbox = useCallback(() => {
    setSearchParams(
      (currentParams) => {
        const nextParams = new URLSearchParams(currentParams)
        nextParams.delete('memory')
        return nextParams
      },
      { preventScrollReset: true },
    )
  }, [setSearchParams])

  const openMemory = useCallback(
    (memoryId) => {
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams)
          nextParams.set('memory', memoryId)
          return nextParams
        },
        { preventScrollReset: true },
      )
    },
    [setSearchParams],
  )

  const navigateLightbox = useCallback(
    (index) => {
      const memory = memoriesWithCategory[index]

      if (memory) {
        openMemory(memory.id)
      }
    },
    [openMemory],
  )

  async function shareMemory(memory) {
    const shareData = {
      title: memory.title,
      text: `${memory.caption} · ${memory.category} with VIBE TOGETHER.`,
      url: `${window.location.origin}/gallery?memory=${encodeURIComponent(
        memory.id,
      )}`,
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        setShareMessage(`Shared “${memory.title}”.`)
        return
      } catch (error) {
        if (error.name === 'AbortError') {
          setShareMessage('Sharing cancelled.')
          return
        }
      }
    }

    if (!navigator.clipboard?.writeText) {
      setShareMessage('Sharing is unavailable in this browser.')
      return
    }

    try {
      await navigator.clipboard.writeText(shareData.url)
      setShareMessage(`Link to “${memory.title}” copied to clipboard.`)
    } catch {
      setShareMessage('Could not copy the memory link. Please try again.')
    }
  }

  const featuredMemories = galleryMemories
    .filter((memory) => memory.featured)
    .map((memory) => ({
      ...memory,
      category: categoryTitleById.get(memory.categoryId) ?? '',
    }))

  return (
    <div className="memories-page">
      <section className="memories-hero" aria-labelledby="memories-title">
        <div className="memories-hero__orb memories-hero__orb--one" aria-hidden="true" />
        <div className="memories-hero__orb memories-hero__orb--two" aria-hidden="true" />
        <div className="memories-hero__grain" aria-hidden="true" />
        <Container className="memories-hero__content">
          <p className="memories-hero__eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            Life looks better together
          </p>
          <h1 id="memories-title">
            EVERY MOMENT
            <br />
            HAS A <span className="gradient-text">VIBE.</span>
          </h1>
          <p className="memories-hero__subtitle">
            Memories, friendships and adventures created together.
          </p>
          <a className="button button--primary memories-hero__cta" href="#photo-gallery">
            Explore gallery <ArrowDown size={17} aria-hidden="true" />
          </a>
          <span className="memories-hero__side-note" aria-hidden="true">
            DIFFERENT PEOPLE · ONE VIBE
          </span>
        </Container>
      </section>

      <section
        className="memories-featured memories-section"
        aria-labelledby="featured-memories-title"
      >
        <Container>
          <div className="memories-section__heading">
            <div>
              <p className="memories-section__eyebrow">Little things, big memories</p>
              <h2 id="featured-memories-title">The moments that stay.</h2>
              <p>
                Four kinds of plans. Countless ways to find your people.
              </p>
            </div>
            <span className="memories-section__count">
              {galleryMemories.length} moments
            </span>
          </div>
          <div className="memories-featured__grid">
            {featuredMemories.map((memory) => (
              <GalleryCard
                category={memory.category}
                key={memory.id}
                memory={memory}
                onOpen={openMemory}
                onShare={shareMemory}
              />
            ))}
          </div>
        </Container>
      </section>

      <section
        className="memories-gallery memories-section"
        id="photo-gallery"
        aria-labelledby="photo-gallery-title"
      >
        <Container>
          <div className="memories-section__heading memories-gallery__heading">
            <div>
              <p className="memories-section__eyebrow">The photo album</p>
              <h2 id="photo-gallery-title">Every frame, a feeling.</h2>
              <p>Find a moment by category or search the memory wall.</p>
            </div>
          </div>

          <div className="memories-toolbar">
            <div
              className="memories-filters"
              role="group"
              aria-label="Filter memories by event category"
            >
              <button
                className={`memories-filter${
                  selectedCategory === ALL_CATEGORIES ? ' is-active' : ''
                }`}
                type="button"
                aria-pressed={selectedCategory === ALL_CATEGORIES}
                onClick={() => setSelectedCategory(ALL_CATEGORIES)}
              >
                All moments
              </button>
              {galleryCategories.map((category) => (
                <button
                  className={`memories-filter${
                    selectedCategory === category.id ? ' is-active' : ''
                  }`}
                  type="button"
                  aria-pressed={selectedCategory === category.id}
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.title}
                </button>
              ))}
            </div>

            <div className="memories-search">
              <Search size={18} aria-hidden="true" />
              <label className="sr-only" htmlFor="memory-search">
                Search gallery by title or caption
              </label>
              <input
                id="memory-search"
                type="search"
                autoComplete="off"
                placeholder="Search memories"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  className="memories-search__clear"
                  type="button"
                  aria-label="Clear gallery search"
                  onClick={() => setQuery('')}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <p className="memories-gallery__result-count" role="status" aria-live="polite">
            {filteredMemories.length}{' '}
            {filteredMemories.length === 1 ? 'moment' : 'moments'}
            {query ? ` matching “${query.trim()}”` : ''}
          </p>

          {filteredMemories.length > 0 ? (
            <div className="memories-photo-grid">
              {filteredMemories.map((memory) => (
                <GalleryCard
                  category={memory.category}
                  key={memory.id}
                  memory={memory}
                  onOpen={openMemory}
                  onShare={shareMemory}
                />
              ))}
            </div>
          ) : (
            <div className="memories-empty">
              <Search size={25} aria-hidden="true" />
              <h3>No moments found just yet.</h3>
              <p>Try another title or choose a different category.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setSelectedCategory(ALL_CATEGORIES)
                }}
              >
                Show all moments
              </Button>
            </div>
          )}
          <p className="memories-gallery__share-status" role="status" aria-live="polite">
            {shareMessage}
          </p>
        </Container>
      </section>

      <section
        className="memories-video memories-section"
        aria-labelledby="video-gallery-title"
      >
        <Container>
          <div className="memories-section__heading">
            <div>
              <p className="memories-section__eyebrow">Press play, feel it again</p>
              <h2 id="video-gallery-title">A little more in motion.</h2>
              <p>
                YouTube player samples are labeled clearly and can be replaced
                with approved event footage.
              </p>
            </div>
            <span className="memories-video__platform">YOUTUBE · ON DEMAND</span>
          </div>
          {filteredVideos.length > 0 ? (
            <div className="memories-video__grid">
              {filteredVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          ) : (
            <p className="memories-video__empty">
              No videos match this filter. Try another category or search.
            </p>
          )}
        </Container>
      </section>

      <section className="memories-closing">
        <Container className="memories-closing__inner">
          <div>
            <p className="memories-section__eyebrow">Still making memories</p>
            <h2>The next one could be yours.</h2>
            <p>
              Come for the experience. Leave with a story to tell together.
            </p>
          </div>
          <Button to="/events" variant="primary">
            Find your next event <Sparkles size={17} aria-hidden="true" />
          </Button>
          <Link className="memories-closing__events-link" to="/events">
            Browse upcoming events
          </Link>
        </Container>
      </section>
      {selectedIndex >= 0 && (
        <GalleryLightbox
          images={memoriesWithCategory}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onShare={shareMemory}
          selectedIndex={selectedIndex}
        />
      )}
    </div>
  )
}
