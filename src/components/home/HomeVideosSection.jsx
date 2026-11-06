import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Play } from 'lucide-react'
import { categories } from '../../data/categories.js'
import { galleryVideos } from '../../data/gallery.js'
import './HomeVideosSection.css'

function YouTubeMark({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        rx="4.5"
        fill="currentColor"
      />
      <path d="M10 9v6l5-3-5-3Z" fill="#10091b" />
    </svg>
  )
}

const featuredSample = {
  ...galleryVideos[0],
  thumbnail: categories.find(({ id }) => id === 'strangers-meet').image,
  thumbnailAlt: 'Friends meeting outdoors and enjoying each other’s company',
}
const videoCards = [
  {
    id: 'dream-bigger',
    title: 'Dream Bigger',
    duration: '03:24',
    thumbnail: categories.find(({ id }) => id === 'strangers-meet').image,
    thumbnailAlt: 'Friends sharing an outdoor community moment',
  },
  {
    id: 'feel-the-music',
    title: 'Feel the Music',
    duration: '04:10',
    thumbnail: categories.find(({ id }) => id === 'sing-along').image,
    thumbnailAlt: 'Singer sharing a song with the crowd',
  },
  {
    id: 'adventure-awaits',
    title: 'Adventure Awaits',
    duration: '03:50',
    thumbnail: categories.find(({ id }) => id === 'strangers-trip').image,
    thumbnailAlt: 'Mountain landscape ready to be explored',
  },
  {
    id: 'cute-moments',
    title: 'Cute Moments',
    duration: '02:58',
    thumbnail: categories.find(({ id }) => id === 'fun-games').image,
    thumbnailAlt: 'A colorful tabletop game ready for friends',
  },
]

export default function HomeVideosSection() {
  const sectionRef = useRef(null)
  const [isVisible, setIsVisible] = useState(
    () => !('IntersectionObserver' in window),
  )
  const [featuredVideo, setFeaturedVideo] = useState(featuredSample)
  const [isPlayerActive, setIsPlayerActive] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section || !('IntersectionObserver' in window)) {
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    observer.observe(section)

    return () => observer.disconnect()
  }, [])

  function selectVideo(video) {
    setFeaturedVideo(video)
    setIsPlayerActive(Boolean(video.videoId))
  }

  const embedUrl = featuredVideo.videoId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(featuredVideo.videoId)}?autoplay=1&controls=1&playsinline=1&rel=0`
    : null

  return (
    <section
      className={`home-videos${isVisible ? ' is-visible' : ''}`}
      id="discover-categories"
      aria-labelledby="home-videos-title"
      ref={sectionRef}
    >
      <div className="home-videos__backdrop" aria-hidden="true">
        <svg
          aria-hidden="true"
          className="home-videos__light-lines"
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 1440 760"
        >
          <defs>
            <linearGradient id="home-video-wave" x1="0" x2="1">
              <stop offset="0%" stopColor="#922BFF" stopOpacity="0" />
              <stop offset="48%" stopColor="#D026FF" stopOpacity=".72" />
              <stop offset="100%" stopColor="#465BFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="home-videos__light-line home-videos__light-line--one"
            d="M-60 150 C140 34 284 205 464 118 S784 92 936 164 S1228 218 1510 60"
            stroke="url(#home-video-wave)"
          />
          <path
            className="home-videos__light-line home-videos__light-line--two"
            d="M-80 655 C132 540 286 716 490 620 S828 548 1004 632 S1286 728 1510 558"
            stroke="url(#home-video-wave)"
          />
        </svg>
        <span className="home-videos__sphere home-videos__sphere--one" />
        <span className="home-videos__sphere home-videos__sphere--two" />
        <span className="home-videos__sphere home-videos__sphere--three" />
        <span className="home-videos__dots home-videos__dots--left" />
        <span className="home-videos__dots home-videos__dots--right" />
      </div>

      <div className="home-videos__content container">
        <header className="home-videos__header">
          <p className="home-videos__badge">
            <YouTubeMark />
            Our Videos
          </p>
          <h2 id="home-videos-title">
            Watch Our Latest <span>Videos</span>
          </h2>
          <p className="home-videos__subtitle">
            Explore amazing stories, memories, and more. Don&apos;t miss out!
          </p>
          <span className="home-videos__underline" aria-hidden="true" />
        </header>

        <div className="home-videos__gallery">
          <article className="home-videos__featured">
            <div
              className="home-videos__featured-media"
              key={featuredVideo.id}
            >
              {isPlayerActive && embedUrl ? (
                <iframe
                  className="home-videos__player"
                  src={embedUrl}
                  title={featuredVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <>
                  <img
                    className="home-videos__featured-image"
                    src={featuredVideo.thumbnail}
                    alt={featuredVideo.thumbnailAlt}
                    fetchPriority="high"
                    decoding="async"
                  />
                  <span className="home-videos__youtube-mark">
                    <YouTubeMark />
                    YouTube
                  </span>
                  {featuredVideo.videoId ? (
                    <button
                      className="home-videos__featured-play"
                      type="button"
                      aria-label={`Play ${featuredVideo.title}`}
                      onClick={() => setIsPlayerActive(true)}
                    >
                      <Play size={26} fill="currentColor" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="home-videos__placeholder-notice" role="status">
                      <YouTubeMark />
                      YouTube link coming soon
                    </div>
                  )}
                  {featuredVideo.videoId && (
                    <span className="home-videos__sample-label">
                      Existing sample embed
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="home-videos__featured-caption">
              <div>
                <p className="home-videos__eyebrow">
                  {featuredVideo.videoId ? 'Featured sample' : 'Video preview'}
                </p>
                <h3>{featuredVideo.title}</h3>
              </div>
              {featuredVideo.videoId && (
                <span className="home-videos__sample-tag">Sample video</span>
              )}
            </div>
          </article>

          <div className="home-videos__grid" aria-label="More videos">
            {videoCards.map((video) => (
              <button
                className={`home-videos__card${featuredVideo.id === video.id ? ' is-selected' : ''}`}
                key={video.id}
                type="button"
                aria-label={`Preview ${video.title}, ${video.duration}. YouTube link coming soon.`}
                aria-pressed={featuredVideo.id === video.id}
                onClick={() => selectVideo(video)}
              >
                <span className="home-videos__card-image-wrap">
                  <img
                    className="home-videos__card-image"
                    src={video.thumbnail}
                    alt={video.thumbnailAlt}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="home-videos__card-play">
                    <Play size={17} fill="currentColor" aria-hidden="true" />
                  </span>
                  <span className="home-videos__duration">{video.duration}</span>
                  <span className="home-videos__card-placeholder">
                    Link coming soon
                  </span>
                </span>
                <span className="home-videos__card-title">{video.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="home-videos__cta-wrap">
          <button
            className="home-videos__channel-button"
            type="button"
            disabled
            aria-describedby="home-videos-channel-note"
          >
            <YouTubeMark />
            Visit Our YouTube Channel
            <ArrowUpRight size={17} aria-hidden="true" />
          </button>
          <p className="home-videos__channel-note" id="home-videos-channel-note">
            Channel link coming soon
          </p>
        </div>
      </div>
    </section>
  )
}
