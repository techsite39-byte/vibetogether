import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'
import { getResponsiveImageSrcSet } from '../../utils/responsiveImage.js'
import './HomeCategoriesSection.css'

// The signature experiences featuring the exact 4 categories + curated club adventures
const baseExperiences = [
  {
    id: 'sing-along',
    title: 'Sing Along',
    category: 'Live Music',
    description: 'Big choruses, familiar songs, and voices raised together.',
    image:
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/hero/h1-480-v1.webp',
    imageAlt: 'Microphone and singer under warm concert stage lights',
    link: '/sing-along',
  },
  {
    id: 'strangers-meet',
    title: 'Strangers Meet',
    category: 'Community',
    description: 'Easy-going gatherings where new conversations begin.',
    image:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/hero/h2-480-v1.webp',
    imageAlt: 'Friends meeting and enjoying each other’s company outdoors',
    link: '/strangers-meet',
  },
  {
    id: 'strangers-trip',
    title: 'Strangers Trip',
    category: 'Getaway',
    description: 'Take the long way round with a crew you just met.',
    image:
      'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/hero/h3-480-v1.webp',
    imageAlt: 'Scenic mountain lake and cabin in the hills',
    link: '/strangers-trip',
  },
  {
    id: 'fun-games',
    title: 'Fun Games',
    category: 'Social Play',
    description: 'A little friendly competition and a lot of shared laughs.',
    image:
      'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/hero/h4-480-v1.webp',
    imageAlt: 'People having fun under a colorful rainbow canopy outdoors',
    link: '/fun-games',
  },
  {
    id: 'acoustic-jam',
    title: 'Acoustic Jam',
    category: 'Unplugged',
    description: 'Warm chords, soulful vocals, and candlelit sets.',
    image:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/music-speakers-720-v1.webp',
    imageAlt: 'Acoustic guitar and musician in warm lighting',
    link: '/events',
  },
  {
    id: 'the-open-table',
    title: 'The Open Table',
    category: 'Dinner & Talks',
    description: 'Good food, honest talks, and chairs pulled close.',
    image:
      'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/sub-480-v1.webp',
    imageAlt: 'Warmly lit dinner table ready for dinner and conversation',
    link: '/events',
  },
  {
    id: 'campfire-stories',
    title: 'Campfire Night',
    category: 'Starlit Skies',
    description: 'Crackling embers, midnight skies, and stories shared.',
    image:
      'https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/outdoor-dj-festival-480-v1.webp',
    imageAlt: 'Bonfire outdoors with friends gathered under night sky',
    link: '/events',
  },
  {
    id: 'wilderness-trail',
    title: 'Wilderness Hike',
    category: 'Sunrise Trek',
    description: 'Chasing morning light with an adventurous crew.',
    image:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/image-480-v1.webp',
    imageAlt: 'Dramatic alpine mountain peaks under morning sun',
    link: '/events',
  },
  {
    id: 'festival-energy',
    title: 'Festival Rhythm',
    category: 'Electric Vibe',
    description: 'Feel the bass, ride the rhythm, and lose track of time.',
    image:
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/dj-party-650-v1.webp',
    imageAlt: 'Joyful festival crowd with warm golden lighting',
    link: '/events',
  },
  {
    id: 'game-arena',
    title: 'Game Arena',
    category: 'Strategy Play',
    description: 'Roll the dice, plan your move, and share the win.',
    image:
      'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=800&q=82',
    fallbackImage: '/assets/optimized/festival-crowd-480-v1.webp',
    imageAlt: 'Tabletop board game with dice and tokens',
    link: '/events',
  },
]

export default function HomeCategoriesSection() {
  const { openBooking } = useBookingEnquiry()
  const stageRef = useRef(null)

  // Continuous 20-card ring (360° / 20 = 18° spacing) for a seamless infinite rotating arch
  const ringCards = useMemo(() => {
    return [...baseExperiences, ...baseExperiences].map((item, idx) => ({
      ...item,
      uniqueId: `${item.id}-ring-${idx}`,
      originalIndex: idx % baseExperiences.length,
    }))
  }, [])

  // Drag tracking
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartRotationRef = useRef(0)
  const lastPointerXRef = useRef(0)
  const velocityRef = useRef(0)

  // Hover state (controls auto-scroll: ONLY scrolls on hover!)
  const isHoveredRef = useRef(false)

  // Rotation angle state
  const [rotation, setRotation] = useState(0)
  const [activeCardId, setActiveCardId] = useState(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dimensions, setDimensions] = useState({
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: 520,
  })
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Responsive stage measurement
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDimensions({
        width: Math.max(320, width || window.innerWidth || 1200),
        height: Math.max(420, height || 520),
      })
    })
    observer.observe(stage)

    return () => observer.disconnect()
  }, [])

  // Animation Loop: STRICT REQUIREMENT: "if hover only auto scroll"
  useEffect(() => {
    if (!isAnimating) return undefined

    const frame = { id: 0 }
    const loopState = { lastTime: 0, autoSpeed: 0 }

    function step(timestamp) {
      if (!loopState.lastTime) loopState.lastTime = timestamp
      const delta = Math.min(40, timestamp - loopState.lastTime)
      loopState.lastTime = timestamp

      if (!isDraggingRef.current) {
        if (Math.abs(velocityRef.current) > 0.005) {
          setRotation((prev) => prev + velocityRef.current * (delta / 16))
          velocityRef.current *= Math.pow(0.92, delta / 16)
        } else {
          velocityRef.current = 0
          const isHoveredNow = isHoveredRef.current
          const targetSpeed =
            isHoveredNow && !prefersReducedMotion ? 0.038 : 0
          loopState.autoSpeed +=
            (targetSpeed - loopState.autoSpeed) * 0.08

          if (Math.abs(loopState.autoSpeed) > 0.0004) {
            setRotation(
              (prev) => prev + loopState.autoSpeed * (delta / 16),
            )
          } else if (!isHoveredNow || prefersReducedMotion) {
            setIsAnimating(false)
            return
          }
        }
      }

      frame.id = requestAnimationFrame(step)
    }

    frame.id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.id)
  }, [isAnimating, prefersReducedMotion])

  // Responsive Arc Geometry: Overhead fan crown arch
  const { width } = dimensions
  const isMobile = width < 720
  const isTablet = width >= 720 && width < 1120

  const arcGeometry = useMemo(() => {
    let rx, ry, cy, cardW, cardH, borderRadius, maxAngle

    const stepAngle = 360 / ringCards.length // 18 degrees per card

    if (isMobile) {
      rx = width * 0.44
      ry = 150
      cy = 210
      cardW = Math.max(88, Math.min(108, width * 0.24))
      cardH = cardW * 1.18
      borderRadius = 18
      maxAngle = 72
    } else if (isTablet) {
      rx = width * 0.44
      ry = 210
      cy = 280
      cardW = 124
      cardH = 148
      borderRadius = 22
      maxAngle = 70
    } else {
      // Desktop: Wide panoramic crown arch gracefully spanning above the center content
      rx = Math.min(640, width * 0.42)
      ry = 220
      cy = 295
      cardW = 144
      cardH = 172
      borderRadius = 24
      maxAngle = 72
    }

    const cx = width / 2
    return { rx, ry, cx, cy, cardW, cardH, borderRadius, stepAngle, maxAngle }
  }, [width, isMobile, isTablet, ringCards.length])

  // Mouse & Touch Drag Handlers
  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX || e.touches?.[0]?.clientX || 0
    dragStartRotationRef.current = rotation
    lastPointerXRef.current = dragStartXRef.current
    velocityRef.current = 0
  }

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return
    const currentX = e.clientX || e.touches?.[0]?.clientX || 0
    const deltaX = currentX - dragStartXRef.current
    const instantDeltaX = currentX - lastPointerXRef.current
    lastPointerXRef.current = currentX

    const angleSensitivity = 0.15
    setRotation(dragStartRotationRef.current + deltaX * angleSensitivity)
    velocityRef.current = instantDeltaX * 0.13
  }

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsAnimating(
      Math.abs(velocityRef.current) > 0.005 ||
        (isHoveredRef.current && !prefersReducedMotion),
    )
  }

  // Step cards with arrows
  const stepCard = (direction) => {
    const step = arcGeometry.stepAngle * direction
    velocityRef.current = 0
    setRotation((prev) => prev + step)
  }

  // Rotate specific card to apex top
  const handleCardClick = (cardIndex) => {
    if (Math.abs(velocityRef.current) > 0.05) return

    const { stepAngle } = arcGeometry
    const rawAngle = (cardIndex * stepAngle + rotation) % 360
    let normAngle = rawAngle
    if (normAngle > 180) normAngle -= 360
    if (normAngle < -180) normAngle += 360

    velocityRef.current = 0
    setRotation((prev) => prev - normAngle)
    setActiveCardId(ringCards[cardIndex].uniqueId)
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stepCard(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      stepCard(1)
    }
  }

  const handleMouseEnter = () => {
    isHoveredRef.current = true
    if (!prefersReducedMotion) setIsAnimating(true)
  }

  const handleMouseLeave = () => {
    isHoveredRef.current = false
    setActiveCardId(null)
  }

  const handleTouchStart = () => {
    isHoveredRef.current = true
    if (!prefersReducedMotion) setIsAnimating(true)
  }

  const handleTouchEnd = () => {
    window.setTimeout(() => {
      isHoveredRef.current = false
    }, 2500)
  }

  return (
    <section
      id="discover-categories"
      className="home-section home-experiences-arc"
      aria-labelledby="experiences-arc-title"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Ambient background glows seamlessly blending into dark theme */}
      <div className="experiences-arc__ambient" aria-hidden="true">
        <div className="experiences-arc__glow-top" />
        <div className="experiences-arc__glow-left" />
        <div className="experiences-arc__glow-right" />
      </div>

      {/* STAGE: Contains the rotating overhead arc cards & centered dome CTA */}
      <div
        className="experiences-arc__stage"
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-roledescription="curved rotating experience carousel"
      >
        {/* Floating Rotating Arc Cards (Tangent-tilted overhead crown) */}
        <div className="experiences-arc__track">
          {ringCards.map((card, index) => {
            const {
              rx,
              ry,
              cx,
              cy,
              cardW,
              cardH,
              borderRadius,
              stepAngle,
              maxAngle,
            } = arcGeometry

            const rawAngle = (index * stepAngle + rotation) % 360
            let angle = rawAngle
            if (angle > 180) angle -= 360
            if (angle < -180) angle += 360

            // Semicircle visibility bounds
            const absAngle = Math.abs(angle)
            if (absAngle > maxAngle) return null

            const rad = (angle * Math.PI) / 180
            const x = cx + rx * Math.sin(rad)
            const y = cy - ry * Math.cos(rad)

            // Dynamic opacity & scale at arc extremes for smooth ribbon fade
            let opacity = 1
            let scale = 1

            if (absAngle > maxAngle - 18) {
              const falloff = (absAngle - (maxAngle - 18)) / 18
              opacity = Math.max(0, 1 - falloff)
              scale = 1 - 0.12 * falloff
            }

            const isCardActive = activeCardId === card.uniqueId
            if (isCardActive) {
              scale *= 1.06
            }

            return (
              <div
                key={card.uniqueId}
                className={`arc-card ${isCardActive ? 'is-active' : ''}`}
                style={{
                  width: `${cardW}px`,
                  height: `${cardH}px`,
                  borderRadius: `${borderRadius}px`,
                  left: `${x}px`,
                  top: `${y}px`,
                  opacity,
                  transform: `translate(-50%, -50%) rotate(${angle}deg) scale(${scale})`,
                  zIndex: Math.round(100 - absAngle),
                }}
                onClick={() => handleCardClick(index)}
                onMouseEnter={() => setActiveCardId(card.uniqueId)}
                title={`${card.title} — ${card.category}`}
              >
                <div className="arc-card__inner">
                  <img
                    className="arc-card__image"
                    src={card.image}
                    srcSet={getResponsiveImageSrcSet(card.image)}
                    sizes="(max-width: 720px) 25vw, 144px"
                    alt={card.imageAlt || card.title}
                    loading="lazy"
                    decoding="async"
                    width="450"
                    height="540"
                    draggable={false}
                    onError={(e) => {
                      if (card.fallbackImage && e.currentTarget.src !== card.fallbackImage) {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = card.fallbackImage
                      }
                    }}
                  />
                  <div className="arc-card__glare" />

                  {/* Elegant overlay on hover / active */}
                  <div className="arc-card__overlay">
                    <span className="arc-card__badge">{card.category}</span>
                    <h4 className="arc-card__title">{card.title}</h4>
                    <p className="arc-card__desc">{card.description}</p>
                    <Link
                      to={card.link}
                      className="arc-card__explore-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Explore →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Central Content: Properly Aligned Under the Arch Dome */}
        <div className="experiences-arc__center">
          <div className="experiences-arc__eyebrow">
            <Sparkles size={13} className="experiences-arc__eyebrow-icon" />
            <span>Curated Experiences</span>
          </div>

          <h2 className="experiences-arc__title" id="experiences-arc-title">
            Experience Unforgettable<br />Moments Together
          </h2>

          <p className="experiences-arc__subtitle">
            Turn ordinary weekends into extraordinary memories with handpicked
            live music, spontaneous adventures, and authentic community gatherings.
          </p>

          <div className="experiences-arc__cta-wrap">
            <button
              type="button"
              className="experiences-arc__cta-btn"
              onClick={() => openBooking()}
              aria-label="Explore experiences and start booking"
            >
              <span>Explore Experiences</span>
              <ArrowRight
                size={16}
                className="experiences-arc__cta-arrow"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Prev / Next Nav Arrows */}
        <button
          type="button"
          className="experiences-arc__nav-arrow experiences-arc__nav-arrow--prev"
          onClick={() => stepCard(-1)}
          aria-label="Previous experiences"
          title="Rotate left"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          className="experiences-arc__nav-arrow experiences-arc__nav-arrow--next"
          onClick={() => stepCard(1)}
          aria-label="Next experiences"
          title="Rotate right"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      {/* BOTTOM SECTION: 3 Features Row & Interaction Hint
          Placed below the stage with guaranteed clearance so cards NEVER overlap text! */}
      <div className="experiences-arc__bottom">
        <div className="experiences-arc__features">
          <div className="experiences-arc__feature">
            <h3 className="experiences-arc__feature-title">Real Connections</h3>
            <p className="experiences-arc__feature-desc">
              Easy-going gatherings where strangers become friends and stories begin.
            </p>
          </div>

          <div className="experiences-arc__divider" aria-hidden="true" />

          <div className="experiences-arc__feature">
            <h3 className="experiences-arc__feature-title">Curated Vibes</h3>
            <p className="experiences-arc__feature-desc">
              From acoustic sing-alongs to mountain trips, handpicked for you.
            </p>
          </div>

          <div className="experiences-arc__divider" aria-hidden="true" />

          <div className="experiences-arc__feature">
            <h3 className="experiences-arc__feature-title">Diverse Experiences</h3>
            <p className="experiences-arc__feature-desc">
              A little friendly competition, great music, and shared laughs.
            </p>
          </div>
        </div>

        {/* Subtle Hint indicating hover auto-scroll & drag interaction */}
        <div className="experiences-arc__hint" aria-hidden="true">
          <span className={`experiences-arc__hint-pill ${isHovered ? 'is-active' : ''}`}>
            <span className="experiences-arc__hint-dot" />
            {isHovered
              ? 'Auto-scrolling on hover'
              : 'Hover to auto-scroll · Drag or swipe to rotate'}
          </span>
        </div>
      </div>
    </section>
  )
}
