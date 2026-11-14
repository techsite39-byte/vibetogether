import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Compass,
  Heart,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import Button from '../components/common/Button.jsx'
import FloatingParticles from '../components/common/FloatingParticles.jsx'
import SectionHeading from '../components/common/SectionHeading.jsx'
import NewsletterSignup from '../components/common/NewsletterSignup.jsx'
import { categories } from '../data/categories.js'
import { testimonials } from '../data/testimonials.js'
import { homeImages } from '../data/homepage.js'
import { getResponsiveImageSrcSet } from '../utils/responsiveImage.js'
import { useBookingEnquiry } from '../context/useBookingEnquiry.js'
import usePublicEvents from '../hooks/usePublicEvents.js'
import './Home.css'

const DotLottieReact = lazy(() =>
  import('@lottiefiles/dotlottie-react').then((module) => ({
    default: module.DotLottieReact,
  })),
)
const HomeCategoriesSection = lazy(
  () => import('../components/home/HomeCategoriesSection.jsx'),
)
const HomeVideosSection = lazy(
  () => import('../components/home/HomeVideosSection.jsx'),
)
const heroBackgroundSlides = [
  {
    src: '/assets/optimized/hero/h1-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h2-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h2-480-v1.webp 480w, /assets/optimized/hero/h2-960-v1.webp 960w, /assets/optimized/hero/h2-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h3-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h3-480-v1.webp 480w, /assets/optimized/hero/h3-960-v1.webp 960w, /assets/optimized/hero/h3-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h4-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h4-480-v1.webp 480w, /assets/optimized/hero/h4-960-v1.webp 960w, /assets/optimized/hero/h4-1672-v1.webp 1672w',
  },
]
const heroSlides = [
  {
    eyebrow: 'Live music, real connections',
    headline: ['FEEL THE MUSIC.', 'LIVE THE MOMENT.'],
    description:
      'From the first note to the last encore, share the kind of night that stays with you.',
  },
  {
    eyebrow: 'New faces, fresh air',
    headline: ['FIND YOUR', 'PEOPLE.'],
    description:
      'Meet your next favorite people and make every getaway a story worth sharing.',
  },
  {
    eyebrow: 'Better when we play together',
    headline: ['MAKE EVERY', 'MOMENT COUNT.'],
    description:
      'Jump into something different, cheer each other on and make memories as a team.',
  },
  {
    eyebrow: 'Your people, your next story',
    headline: ['ONE COMMUNITY.', 'ENDLESS VIBES.'],
    description:
      'Come together for unforgettable events, new friendships and nights full of energy.',
  },
]
const reasons = [
  {
    icon: UsersRound,
    title: 'Meet New People',
    description:
      'Walk into a room of strangers and leave with a few new favorite people.',
  },
  {
    icon: Heart,
    title: 'Create Real Memories',
    description:
      'Make space for the kind of moments that stay with you long after the night.',
  },
  {
    icon: Compass,
    title: 'Find a New Experience',
    description:
      'Try something outside your usual plans, at your own pace and on your terms.',
  },
  {
    icon: Sparkles,
    title: 'Make Every Plan Count',
    description:
      'From a chorus in a crowd to a weekend away, there is always room for a new story.',
  },
]
const aboutCommunityCategory = categories.find(
  ({ id }) => id === 'strangers-meet',
)

function DeferredHomepageSection({ component: Section }) {
  const anchorRef = useRef(null)
  const [isVisible, setIsVisible] = useState(
    () => !('IntersectionObserver' in window),
  )

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || isVisible) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '700px 0px' },
    )
    observer.observe(anchor)

    return () => observer.disconnect()
  }, [isVisible])

  return (
    <>
      {!isVisible && (
        <div
          aria-hidden="true"
          className="home-page__deferred-anchor"
          ref={anchorRef}
        />
      )}
      {isVisible && (
        <Suspense fallback={null}>
          <Section />
        </Suspense>
      )}
    </>
  )
}

function Home() {
  const heroRef = useRef(null)
  const reasonsRef = useRef(null)
  const heroAnimationFrame = useRef(0)
  const heroPointerFrame = useRef(0)
  const latestHeroPointer = useRef({ x: 0, y: 0 })
  const { openBooking } = useBookingEnquiry()
  const { events } = usePublicEvents()
  const aboutFeaturedEvents = events
    .filter(({ id }) =>
      ['after-hours-sing-along', 'the-open-table', 'somewhere-together'].includes(id),
    )
    .slice(0, 3)
  const [activeHeroSlide, setActiveHeroSlide] = useState(0)
  const [loadedHeroSlides, setLoadedHeroSlides] = useState([0])
  const [isReasonsVisible, setIsReasonsVisible] = useState(
    () => !('IntersectionObserver' in window),
  )
  const [isHeroTextVisible, setIsHeroTextVisible] = useState(true)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const section = reasonsRef.current
    if (!section || isReasonsVisible) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsReasonsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '250px 0px' },
    )
    observer.observe(section)

    return () => observer.disconnect()
  }, [isReasonsVisible])

  useEffect(() => {
    const hero = heroRef.current
    const images = hero?.querySelectorAll('.home-hero__image')
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const supportsScrollTimeline =
      window.CSS?.supports?.('animation-timeline: scroll()') ?? false

    if (!hero || !images?.length || supportsScrollTimeline) {
      return undefined
    }

    function updateScrollAnimation() {
      heroAnimationFrame.current = 0

      if (motionPreference.matches) {
        images.forEach((image) => {
          image.style.setProperty('--hero-scroll-scale', '1')
          image.style.setProperty('--hero-scroll-y', '0px')
        })
        return
      }

      const progress = Math.min(
        1,
        Math.max(0, -hero.getBoundingClientRect().top / window.innerHeight),
      )
      images.forEach((image) => {
        image.style.setProperty(
          '--hero-scroll-scale',
          (1 + progress * 0.2).toFixed(4),
        )
        image.style.setProperty(
          '--hero-scroll-y',
          `${(progress * window.innerHeight * 0.05).toFixed(2)}px`,
        )
      })
    }

    function requestScrollUpdate() {
      if (!heroAnimationFrame.current) {
        heroAnimationFrame.current =
          window.requestAnimationFrame(updateScrollAnimation)
      }
    }

    function handleMotionPreferenceChange() {
      requestScrollUpdate()
    }

    requestScrollUpdate()
    window.addEventListener('scroll', requestScrollUpdate, { passive: true })
    window.addEventListener('resize', requestScrollUpdate)
    motionPreference.addEventListener('change', handleMotionPreferenceChange)

    return () => {
      window.removeEventListener('scroll', requestScrollUpdate)
      window.removeEventListener('resize', requestScrollUpdate)
      motionPreference.removeEventListener(
        'change',
        handleMotionPreferenceChange,
      )
      window.cancelAnimationFrame(heroAnimationFrame.current)
      heroAnimationFrame.current = 0
      images.forEach((image) => {
        image.style.removeProperty('--hero-scroll-scale')
        image.style.removeProperty('--hero-scroll-y')
      })
    }
  }, [])

  useEffect(() => {
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const updateMotionPreference = (event) => {
      setPrefersReducedMotion(event.matches)
      if (event.matches) {
        setIsHeroTextVisible(true)
      }
    }

    motionPreference.addEventListener('change', updateMotionPreference)

    return () => {
      motionPreference.removeEventListener('change', updateMotionPreference)
    }
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined
    }

    const nextSlide = (activeHeroSlide + 1) % heroBackgroundSlides.length
    const preloadImage = new window.Image()
    let preloadTimeout = 0
    let fadeTimeout = 0
    let switchTimeout = 0
    let isMounted = true

    preloadImage.decoding = 'async'
    preloadImage.fetchPriority = 'low'
    preloadImage.onload = () => {
      if (isMounted) {
        setLoadedHeroSlides((slides) =>
          slides.includes(nextSlide) ? slides : [...slides, nextSlide],
        )
        fadeTimeout = window.setTimeout(
          () => setIsHeroTextVisible(false),
          2650,
        )
        switchTimeout = window.setTimeout(() => {
          setActiveHeroSlide(nextSlide)
          setIsHeroTextVisible(true)
        }, 3000)
      }
    }
    preloadImage.onerror = () => {
      console.error(
        `Unable to load homepage hero background: ${heroBackgroundSlides[nextSlide].src}`,
      )
    }
    preloadTimeout = window.setTimeout(() => {
      preloadImage.sizes = '100vw'
      preloadImage.srcset = heroBackgroundSlides[nextSlide].srcSet
      preloadImage.src = heroBackgroundSlides[nextSlide].src
    }, 1200)

    return () => {
      isMounted = false
      window.clearTimeout(preloadTimeout)
      window.clearTimeout(fadeTimeout)
      window.clearTimeout(switchTimeout)
      preloadImage.onload = null
      preloadImage.onerror = null
    }
  }, [activeHeroSlide, prefersReducedMotion])

  function handleHeroPointerMove(event) {
    if (
      event.pointerType !== 'mouse' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    latestHeroPointer.current = { x: event.clientX, y: event.clientY }
    if (heroPointerFrame.current) return

    heroPointerFrame.current = window.requestAnimationFrame(() => {
      heroPointerFrame.current = 0
      const hero = heroRef.current
      if (!hero) return

      const bounds = hero.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return

      const x = (latestHeroPointer.current.x - bounds.left) / bounds.width - 0.5
      const y = (latestHeroPointer.current.y - bounds.top) / bounds.height - 0.5
      hero.style.setProperty('--hero-tilt-x', `${-y * 3}deg`)
      hero.style.setProperty('--hero-tilt-y', `${x * 3}deg`)
      hero.style.setProperty('--hero-pointer-x', `${x * 18}px`)
      hero.style.setProperty('--hero-pointer-y', `${y * 18}px`)
      hero.style.setProperty('--hero-pointer-x-reverse', `${x * -11.7}px`)
      hero.style.setProperty('--hero-pointer-y-reverse', `${y * -11.7}px`)
    })
  }

  function resetHeroPointer() {
    if (heroPointerFrame.current) {
      window.cancelAnimationFrame(heroPointerFrame.current)
      heroPointerFrame.current = 0
    }

    const hero = heroRef.current
    hero?.style.removeProperty('--hero-tilt-x')
    hero?.style.removeProperty('--hero-tilt-y')
    hero?.style.removeProperty('--hero-pointer-x')
    hero?.style.removeProperty('--hero-pointer-y')
    hero?.style.removeProperty('--hero-pointer-x-reverse')
    hero?.style.removeProperty('--hero-pointer-y-reverse')
  }

  return (
    <div className="home-page">
      <section
        className={`home-hero home-hero--slide-${activeHeroSlide + 1}`}
        aria-labelledby="home-hero-title"
        onPointerLeave={resetHeroPointer}
        onPointerMove={handleHeroPointerMove}
        ref={heroRef}
      >
        {heroBackgroundSlides.map((slide, index) => (
          <div
            aria-hidden="true"
            className={`home-hero__image home-hero__image--${index + 1}${index === activeHeroSlide ? ' is-active' : ''}`}
            key={slide.src}
          >
            {loadedHeroSlides.includes(index) && (
              <img
                src={slide.src}
                srcSet={slide.srcSet}
                sizes="100vw"
                width="1672"
                height="941"
                alt=""
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
                decoding="async"
              />
            )}
          </div>
        ))}
        <div className="home-hero__backdrop" aria-hidden="true" />
        <div className="home-hero__ambient home-hero__ambient--one" aria-hidden="true" />
        <div className="home-hero__ambient home-hero__ambient--two" aria-hidden="true" />
        <FloatingParticles className="home-hero__particles" />

        <div className="home-hero__content container">
          <div
            className={`home-hero__copy${isHeroTextVisible ? ' is-visible' : ' is-exiting'}`}
            key={activeHeroSlide}
          >
            <p className="home-eyebrow">
              <span className="home-eyebrow__dot" />
              {heroSlides[activeHeroSlide].eyebrow}
            </p>
            <h1 className="home-hero__title" id="home-hero-title">
              {heroSlides[activeHeroSlide].headline.map((line, index) => (
                <span
                  className={`home-hero__title-line${index === 1 ? ' home-hero__title-second' : ''}`}
                  key={line}
                >
                  {line}
                </span>
              ))}
            </h1>
            <p className="home-hero__description">
              {heroSlides[activeHeroSlide].description}
            </p>
            <div className="home-hero__actions">
              <Button onClick={() => openBooking()}>
                Book Now <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <a className="home-hero__scroll" href="#discover-categories">
          <span>Scroll to discover</span>
          <ArrowDown size={16} aria-hidden="true" />
        </a>
        <div className="home-hero__index" aria-hidden="true">
          VT <span>—</span> {String(activeHeroSlide + 1).padStart(2, '0')}
        </div>
      </section>

      <DeferredHomepageSection component={HomeVideosSection} />

      <section className="home-section home-about" aria-labelledby="about-title">
        <svg
          aria-hidden="true"
          className="home-about__divider home-about__divider--top"
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 1440 160"
        >
          <defs>
            <linearGradient id="home-about-top-violet" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#773BFF" stopOpacity=".24" />
              <stop offset="52%" stopColor="#A82BFF" stopOpacity=".18" />
              <stop offset="100%" stopColor="#343BFF" stopOpacity=".16" />
            </linearGradient>
            <linearGradient id="home-about-top-magenta" x1="1" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#D12AFF" stopOpacity=".14" />
              <stop offset="100%" stopColor="#773BFF" stopOpacity=".12" />
            </linearGradient>
          </defs>
          <g className="home-about__divider-layer home-about__divider-layer--one">
            <path
              d="M0 74 C180 138 342 24 548 62 C742 98 842 147 1052 90 C1214 46 1320 47 1440 84 L1440 160 L0 160 Z"
              fill="url(#home-about-top-violet)"
            />
          </g>
          <g className="home-about__divider-layer home-about__divider-layer--two">
            <path
              d="M0 100 C174 50 324 114 516 104 C724 94 868 24 1054 54 C1220 81 1322 119 1440 70 L1440 160 L0 160 Z"
              fill="url(#home-about-top-magenta)"
            />
          </g>
          <g className="home-about__divider-layer home-about__divider-layer--three">
            <path
              d="M0 120 C210 90 340 142 530 126 C748 108 854 74 1050 103 C1222 130 1334 84 1440 108 L1440 160 L0 160 Z"
              fill="#080711"
              fillOpacity=".42"
            />
          </g>
        </svg>

        <svg
          aria-hidden="true"
          className="home-about__soundscape"
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 1440 800"
        >
          <defs>
            <linearGradient id="home-about-wave-purple" x1="0" x2="1">
              <stop offset="0%" stopColor="#773BFF" stopOpacity="0" />
              <stop offset="28%" stopColor="#A82BFF" stopOpacity=".8" />
              <stop offset="68%" stopColor="#D12AFF" stopOpacity=".64" />
              <stop offset="100%" stopColor="#343BFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="home-about-wave-blue" x1="0" x2="1">
              <stop offset="0%" stopColor="#343BFF" stopOpacity="0" />
              <stop offset="40%" stopColor="#773BFF" stopOpacity=".65" />
              <stop offset="76%" stopColor="#343BFF" stopOpacity=".76" />
              <stop offset="100%" stopColor="#343BFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="home-about__sound-line home-about__sound-line--one"
            d="M0 240 C120 190 190 290 310 240 S500 190 620 240 S810 290 930 240 S1120 190 1240 240 S1400 280 1440 225"
            pathLength="100"
            stroke="url(#home-about-wave-purple)"
          />
          <path
            className="home-about__sound-line home-about__sound-line--two"
            d="M0 610 C115 660 200 560 330 610 S540 660 665 610 S870 560 1000 610 S1200 660 1325 610 S1430 580 1440 620"
            pathLength="100"
            stroke="url(#home-about-wave-blue)"
          />
          <path
            className="home-about__sound-line home-about__sound-line--three"
            d="M0 430 C160 395 235 465 395 430 S625 395 785 430 S1015 465 1175 430 S1370 400 1440 445"
            pathLength="100"
            stroke="url(#home-about-wave-purple)"
          />
          <circle className="home-about__sound-particle" r="3" fill="#D12AFF">
            <animateMotion
              dur="24s"
              path="M0 240 C120 190 190 290 310 240 S500 190 620 240 S810 290 930 240 S1120 190 1240 240 S1400 280 1440 225"
              repeatCount="indefinite"
            />
          </circle>
          <circle className="home-about__sound-particle home-about__sound-particle--blue" r="2.5" fill="#61D9FF">
            <animateMotion
              dur="31s"
              path="M0 610 C115 660 200 560 330 610 S540 660 665 610 S870 560 1000 610 S1200 660 1325 610 S1430 580 1440 620"
              repeatCount="indefinite"
            />
          </circle>
        </svg>

        <div className="home-about__equalizer" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} style={{ '--bar-index': index }} />
          ))}
        </div>

        <svg
          aria-hidden="true"
          className="home-about__divider home-about__divider--bottom"
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 1440 160"
        >
          <defs>
            <linearGradient id="home-about-bottom-violet" x1="1" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#343BFF" stopOpacity=".18" />
              <stop offset="52%" stopColor="#773BFF" stopOpacity=".18" />
              <stop offset="100%" stopColor="#A82BFF" stopOpacity=".12" />
            </linearGradient>
            <linearGradient id="home-about-bottom-magenta" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#D12AFF" stopOpacity=".12" />
              <stop offset="100%" stopColor="#773BFF" stopOpacity=".14" />
            </linearGradient>
          </defs>
          <g className="home-about__divider-layer home-about__divider-layer--one">
            <path
              d="M0 54 C168 16 314 48 488 84 C684 125 846 134 1030 91 C1190 54 1330 20 1440 65 L1440 0 L0 0 Z"
              fill="url(#home-about-bottom-violet)"
            />
          </g>
          <g className="home-about__divider-layer home-about__divider-layer--two">
            <path
              d="M0 78 C156 112 290 132 470 94 C658 55 820 28 1016 62 C1190 92 1318 132 1440 86 L1440 0 L0 0 Z"
              fill="url(#home-about-bottom-magenta)"
            />
          </g>
          <g className="home-about__divider-layer home-about__divider-layer--three">
            <path
              d="M0 108 C170 76 308 58 494 77 C684 96 838 123 1036 102 C1200 85 1324 60 1440 98 L1440 0 L0 0 Z"
              fill="#080711"
              fillOpacity=".38"
            />
          </g>
        </svg>

        <div className="container home-about__editorial">
          <div className="home-about__intro home-about__story">
            <div className="home-about__visual">
              <img
                className="home-about__image home-about__image--main"
                src={homeImages.aboutMain}
                srcSet={getResponsiveImageSrcSet(homeImages.aboutMain)}
                sizes="(max-width: 48rem) 100vw, 50vw"
                alt="Friends enjoying a gathering together"
                loading="lazy"
              />
              <img
                className="home-about__image home-about__image--detail"
                src={homeImages.aboutDetail}
                srcSet={getResponsiveImageSrcSet(homeImages.aboutDetail)}
                sizes="(max-width: 48rem) 100vw, 33vw"
                alt="A warmly lit evening event"
                loading="lazy"
              />
              <span className="home-about__orbit home-about__orbit--one" aria-hidden="true" />
              <span className="home-about__orbit home-about__orbit--two" aria-hidden="true" />
              <img
                className="home-decoration home-decoration--speakers"
                src="/assets/optimized/music-speakers-720-v1.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                width="720"
                height="644"
                draggable="false"
              />
            </div>

            <div className="home-about__copy">
              <SectionHeading
                label="A little about us"
                titleId="about-title"
                title="More than an event. A reason to connect."
                description="VIBE TOGETHER brings people together around the things that make life feel a little more alive."
              />
            </div>
          </div>

          <div className="home-about__community home-about__story">
            <div className="home-about__copy">
              <SectionHeading
                titleId="about-community-title"
                title={aboutCommunityCategory.title}
                description={aboutCommunityCategory.description}
              />
              <p className="home-about__body">
                Some of us arrive with our whole friend group. Some come solo.
                However you show up, there is room to feel welcome, find common
                ground, and share an experience beyond the everyday.
              </p>
            </div>
            <figure className="home-about__community-visual">
              <img
                className="home-about__story-image"
                src="/assets/optimized/hero/h2-960-v1.webp"
                alt="A group of friends sharing a mountain outing"
                loading="lazy"
                decoding="async"
                width="960"
                height="540"
              />
              <span className="home-about__orbit home-about__orbit--one" aria-hidden="true" />
              <span className="home-about__orbit home-about__orbit--two" aria-hidden="true" />
            </figure>
          </div>

          <div className="home-about__events home-about__story">
            {aboutFeaturedEvents.map((event, index) => (
              <figure
                className={`home-about__event home-about__event--${index + 1}`}
                key={event.id}
              >
                <img
                  className="home-about__story-image"
                  src={event.image}
                srcSet={getResponsiveImageSrcSet(event.image)}
                sizes="(max-width: 48rem) 100vw, 33vw"
                  alt={event.imageAlt}
                  loading="lazy"
                />
                <figcaption>
                  <span>{event.category}</span>
                  <h3>{event.title}</h3>
                </figcaption>
              </figure>
            ))}
          </div>

        </div>
      </section>

      <DeferredHomepageSection component={HomeCategoriesSection} />

      <section
        className="home-section home-reasons"
        aria-labelledby="reasons-title"
        ref={reasonsRef}
      >
        <div className="home-reasons__glow" aria-hidden="true" />
        <div className="container">
          <div className="home-reasons__showcase">
            <div className="home-reasons__art" aria-hidden="true">
              <div className="home-reasons__lottie-wrap">
                {isReasonsVisible && (
                  <Suspense
                    fallback={
                      <div
                        className="home-reasons__lottie"
                        aria-hidden="true"
                      />
                    }
                  >
                    <DotLottieReact
                      autoplay={!prefersReducedMotion}
                      backgroundColor="transparent"
                      className="home-reasons__lottie"
                      loop
                      src="/assets/folder/ani1.json"
                    />
                  </Suspense>
                )}
              </div>
            </div>

            <div className="home-reasons__intro-copy">
              <p className="home-eyebrow home-reasons__eyebrow">Introducing</p>
              <div className="home-reasons__title-wrap">
                <span className="home-reasons__script">Vibe</span>
                <h2 className="home-reasons__headline">Vibe Alone Events</h2>
              </div>
              <p className="home-reasons__subhead">
                Chill. Explore. Enjoy — On Your Own Vibe.
              </p>
            </div>

            <div className="home-reasons__tagline" aria-label="Because sometimes Alone is the best company!">
              <span>Because</span>
              <span>sometimes...</span>
              <span>Alone is the</span>
              <span>best company!</span>
            </div>
          </div>

          <div className="home-reasons__feature-grid">
            <div className="home-reasons__feature-card">
              <span className="home-reasons__feature-icon" aria-hidden="true">👥</span>
              <h3>Solo Experiences</h3>
              <p>Enjoy events alone</p>
            </div>
            <div className="home-reasons__feature-card">
              <span className="home-reasons__feature-icon" aria-hidden="true">✦</span>
              <h3>Discover New Vibes</h3>
              <p>Explore your interests</p>
            </div>
            <div className="home-reasons__feature-card">
              <span className="home-reasons__feature-icon" aria-hidden="true">♡</span>
              <h3>Be Yourself</h3>
              <p>No crowd, no pressure</p>
            </div>
            <div className="home-reasons__feature-card">
              <span className="home-reasons__feature-icon" aria-hidden="true">✦</span>
              <h3>Grow &amp; Enjoy</h3>
              <p>Make it memorable</p>
            </div>
          </div>

          <Button className="home-reasons__cta" onClick={() => openBooking()}>
            Explore Vibe Alone Events <ArrowRight size={17} aria-hidden="true" />
          </Button>

          <div className="home-reasons__why">
            <SectionHeading
              align="center"
              label="Why Vibe Together"
              titleId="reasons-title"
              title="The best plans have people in them."
              description="New faces, new places, familiar feelings. It all starts with showing up."
            />
            <div className="home-reasons__grid">
              {reasons.map(({ description, icon: Icon, title }, index) => (
                <article className="home-reason" key={title}>
                  <span className="home-reason__number">0{index + 1}</span>
                  <span className="home-reason__icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
        <div className="home-reasons__particles" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </section>

      <section className="home-memory-cta" aria-labelledby="memory-title">
        <div className="home-memory-cta__glow" aria-hidden="true" />
        <div className="container home-memory-cta__content">
          <p className="home-eyebrow">The group chat can wait</p>
          <h2 id="memory-title">YOUR NEXT MEMORY STARTS HERE.</h2>
          <p>
            Say yes to something new. We’ll save you a place in the story.
          </p>
          <Button onClick={() => openBooking()}>
            Book Now <ArrowRight size={17} aria-hidden="true" />
          </Button>
        </div>
        <img
          className="home-decoration home-decoration--dj-party"
          src="/assets/optimized/dj-party-650-v1.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width="650"
          height="540"
          draggable="false"
        />
      </section>

      <section
        className="home-section home-testimonials"
        aria-labelledby="testimonials-title"
      >
        <div className="home-testimonials__ambience" aria-hidden="true">
          <span className="home-testimonials__sphere home-testimonials__sphere--left" />
          <span className="home-testimonials__sphere home-testimonials__sphere--right" />
          <span className="home-testimonials__dots home-testimonials__dots--left" />
          <span className="home-testimonials__dots home-testimonials__dots--right" />
          <svg
            className="home-testimonials__waves"
            viewBox="0 0 1440 720"
            preserveAspectRatio="none"
            focusable="false"
          >
            <defs>
              <linearGradient id="home-testimonials-wave" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#922BFF" stopOpacity=".04" />
                <stop offset="52%" stopColor="#D026FF" stopOpacity=".28" />
                <stop offset="100%" stopColor="#465BFF" stopOpacity=".05" />
              </linearGradient>
            </defs>
            <path
              className="home-testimonials__wave home-testimonials__wave--top"
              d="M-80 250 C180 94 280 362 530 240 S890 107 1080 204 S1330 285 1520 66"
            />
            <path
              className="home-testimonials__wave home-testimonials__wave--bottom"
              d="M-80 588 C160 440 284 672 540 564 S910 456 1100 562 S1350 668 1520 462"
            />
          </svg>
        </div>
        <div className="container">
          <div className="home-section__topline">
            <SectionHeading
              align="center"
              label="Notes from the community"
              highlight="people."
              titleId="testimonials-title"
              title="A little love from the people."
              description="Sample testimonials shown for layout preview only. Guest stories will appear here when available."
            />
            <Button
              className="home-testimonials__more"
              to="/testimonials"
              variant="secondary"
            >
              More stories <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <div className="home-testimonials__grid">
            {testimonials.map(({ event, id, name, quote }) => (
              <figure className="home-testimonial" key={id} tabIndex={0}>
                <div
                  className="home-testimonial__stars"
                  role="img"
                  aria-label="5 out of 5 stars"
                >
                  <span aria-hidden="true">★★★★★</span>
                </div>
                <blockquote>“{quote}”</blockquote>
                <figcaption>
                  <span className="home-testimonial__avatar" aria-hidden="true">
                    {name.slice(0, 1)}
                  </span>
                  <span className="home-testimonial__byline">
                    <strong>{name}</strong>
                    <span>{event} · Sample story</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
      <NewsletterSignup />
    </div>
  )
}

export default Home
