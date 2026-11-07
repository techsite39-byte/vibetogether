import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'
import './HomeCategoriesSection.css'

// The signature experiences featuring the exact 4 categories from Image 1 + curated club adventures
const baseExperiences = [
  {
    id: 'sing-along',
    title: 'Sing Along',
    category: 'Live Music',
    description: 'Big choruses, familiar songs, and voices raised together.',
    image:
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=82',
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
    imageAlt: 'Tabletop board game with dice and tokens',
    link: '/events',
  },
]

export default function HomeCategoriesSection() {
  const { openBooking } = useBookingEnquiry()
  const stageRef = useRef(null)

  // Duplicate the 10 experiences to form a continuous 20-card ring (360° / 20 = 18° spacing)
  // This ensures a 100% gapless, seamless infinite rotating arch just like Image 2
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
  const [isHovered, setIsHovered] = useState(false)
  const isHoveredRef = useRef(false)

  // Rotation angle state
  const [rotation, setRotation] = useState(0)
  const [activeCardId, setActiveCardId] = useState(null)
  const [dimensions, setDimensions] = useState({
    width: 1200,
    height: 780,
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

    const updateDimensions = () => {
      const rect = stage.getBoundingClientRect()
      setDimensions({
        width: Math.max(320, rect.width || 1200),
        height: Math.max(560, rect.height || 780),
      })
    }

    updateDimensions()
    const observer = new ResizeObserver(updateDimensions)
    observer.observe(stage)

    return () => observer.disconnect()
  }, [])

  // Animation Loop: STRICT REQUIREMENT: "if hover only auto scroll"
  useEffect(() => {
    const loop = { id: 0, lastTime: 0, autoSpeed: 0 }

    function step(timestamp) {
      if (!loop.lastTime) loop.lastTime = timestamp
      const delta = Math.min(40, timestamp - loop.lastTime)
      loop.lastTime = timestamp

      if (!isDraggingRef.current) {
        // Momentum release after dragging
        if (Math.abs(velocityRef.current) > 0.005) {
          setRotation((prev) => prev + velocityRef.current * (delta / 16))
          velocityRef.current *= Math.pow(0.92, delta / 16)
        } else {
          velocityRef.current = 0

          // ONLY auto-scroll when hovered!
          const targetSpeed =
            isHoveredRef.current && !prefersReducedMotion ? 0.038 : 0

          // Smooth acceleration into scroll, smooth deceleration to stop
          loop.autoSpeed += (targetSpeed - loop.autoSpeed) * 0.08

          if (Math.abs(loop.autoSpeed) > 0.0004) {
            setRotation((prev) => prev + loop.autoSpeed * (delta / 16))
          }
        }
      }

      loop.id = requestAnimationFrame(step)
    }

    loop.id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(loop.id)
  }, [prefersReducedMotion])

  // Responsive Arc Geometry
  const { width } = dimensions
  const isMobile = width < 720
  const isTablet = width >= 720 && width < 1120

  const arcGeometry = useMemo(() => {
    let rx, ry, cy, cardW, cardH, borderRadius, maxAngle

    const stepAngle = 360 / ringCards.length // 18 degrees per card

    if (isMobile) {
      rx = width * 0.46
      ry = width * 0.28
      cy = width * 0.58
      cardW = Math.max(86, width * 0.22)
      cardH = cardW * 1.16
      borderRadius = 18
      maxAngle = 72
    } else if (isTablet) {
      rx = width * 0.46
      ry = 280
      cy = 440
      cardW = 126
      cardH = 150
      borderRadius = 22
      maxAngle = 70
    } else {
      // Desktop: Wide panoramic crown arch above the text
      rx = Math.min(680, width * 0.46)
      ry = 340
      cy = 470
      cardW = 150
      cardH = 176
      borderRadius = 26
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
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    isHoveredRef.current = false
    setIsHovered(false)
    setActiveCardId(null)
  }

  const handleTouchStart = () => {
    isHoveredRef.current = true
    setIsHovered(true)
  }

  const handleTouchEnd = () => {
    window.setTimeout(() => {
      isHoveredRef.current = false
      setIsHovered(false)
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
        <div className="experiences-arc__track" aria-hidden="true">
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
                    alt={card.imageAlt || card.title}
                    loading="lazy"
                    draggable={false}
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

        {/* Central Content: Properly Aligned Under the Arch Dome (Image 2 exact structure) */}
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

          {/* 3 Columns Row: Matching Image 2 (Realistic Results | Fast Generation | Diverse Styles) */}
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

        {/* Subtle Hint indicating hover / drag interaction */}
        <div className="experiences-arc__hint" aria-hidden="true">
          <span>
            {isHovered
              ? '● Auto-scrolling on hover'
              : '‹ Hover to auto-scroll · Drag to explore ›'}
          </span>
        </div>
      </div>
    </section>
  )
}
