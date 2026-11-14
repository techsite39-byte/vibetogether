import {
  ArrowRight,
  Mail,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../../config/api.js'

const quickLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events' },
  { to: '/my-bookings', label: 'My Bookings' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/testimonials', label: 'Testimonials' },
]

const eventCategories = [
  { to: '/sing-along', label: 'Sing Along' },
  { to: '/strangers-meet', label: 'Strangers Meet' },
  { to: '/strangers-trip', label: 'Strangers Trip' },
  { to: '/fun-games', label: 'Fun Games' },
]

const currentYear = new Date().getFullYear()

const footerSocialOrder = ['Instagram', 'Facebook', 'YouTube', 'LinkedIn']

function SocialIcon({ name }) {
  if (name === 'Instagram') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.1" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="4.05" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.65" cy="6.55" r="1.05" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'Facebook') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.45 21v-8.22h2.76l.41-3.2h-3.17V7.54c0-.93.26-1.56 1.59-1.56h1.69V3.12c-.29-.04-1.3-.12-2.48-.12-2.46 0-4.14 1.5-4.14 4.25v2.33H7.33v3.2h2.78V21h3.34Z" />
      </svg>
    )
  }
  if (name === 'YouTube') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.1 7.1a3 3 0 0 0-2.12-2.13C19.11 4.45 12 4.45 12 4.45s-7.11 0-8.98.52A3 3 0 0 0 .9 7.1C.38 8.98.38 12 .38 12s0 3.02.52 4.9a3 3 0 0 0 2.12 2.13c1.87.52 8.98.52 8.98.52s7.11 0 8.98-.52a3 3 0 0 0 2.12-2.13c.52-1.88.52-4.9.52-4.9s0-3.02-.52-4.9ZM9.7 15.58V8.42L15.9 12l-6.2 3.58Z" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.9H4.96V9.36h2.97v9.54ZM6.45 8.05a1.72 1.72 0 1 1 0-3.44 1.72 1.72 0 0 1 0 3.44Zm12.5 10.85h-2.96v-4.64c0-1.11-.02-2.54-1.55-2.54-1.56 0-1.8 1.21-1.8 2.46v4.72H9.68V9.36h2.84v1.3h.04c.4-.75 1.36-1.54 2.8-1.54 3 0 3.59 1.97 3.59 4.53v5.25Z" />
    </svg>
  )
}

export default function Footer({ socialLinks: initialSocialLinks = [] }) {
  const ctaRef = useRef(null)
  const [socialLinks, setSocialLinks] = useState(initialSocialLinks)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE_URL}/public-settings/social`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Public social settings could not be loaded.')
        }
        return response.json()
      })
      .then(({ socialLinks: savedLinks }) => {
        if (active && Array.isArray(savedLinks)) {
          setSocialLinks(savedLinks)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const element = ctaRef.current
    if (
      !element ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    element.classList.add('is-reveal-ready')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add('is-revealed')
          observer.disconnect()
        }
      },
      { threshold: 0.16 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <footer className="site-footer">
      <div className="site-footer__cta-wrap container container--wide">
        <section
          className="site-footer__cta"
          aria-labelledby="footer-cta-title"
          ref={ctaRef}
        >
          <div className="site-footer__cta-mascot" aria-hidden="true">
            <img
              className="site-footer__cta-image"
              src="/assets/optimized/footer-1536-v1.webp"
              alt=""
              loading="lazy"
              decoding="async"
              width="1536"
              height="576"
              draggable="false"
            />
          </div>
          <span className="site-footer__cta-shade" aria-hidden="true" />
          <span className="site-footer__cta-particles" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
          </span>
          <div className="site-footer__cta-content">
            <p className="site-footer__cta-eyebrow">THE NEXT STORY IS YOURS</p>
            <h2 id="footer-cta-title">Make room for a little more life.</h2>
            <p>
              Find your people. Find your next favorite thing to do. Make
              unforgettable memories with VIBE TOGETHER.
            </p>
            <Link className="site-footer__cta-button" to="/events">
              Explore Experiences <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
      <div className="site-footer__inner container container--wide">
        <div className="site-footer__brand">
          <Link className="site-brand site-brand--footer" to="/">
            <img
              className="site-brand__logo"
              src="/assets/optimized/favicon-256-v1.webp"
              alt="Vibe Together"
              width="88"
              height="88"
              loading="lazy"
              decoding="async"
            />
            <span className="site-brand__tagline">Different People. One Vibe.</span>
          </Link>
          <p className="site-footer__description">
            Discover experiences, meet new people, and create unforgettable
            memories.
          </p>
        </div>
        <nav className="site-footer__column" aria-label="Quick links">
          <h2 className="site-footer__heading">Explore</h2>
          <ul className="site-footer__link-list">
            {quickLinks.map(({ to, label }) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__column" aria-label="Event categories">
          <h2 className="site-footer__heading">Event Categories</h2>
          <ul className="site-footer__link-list">
            {eventCategories.map(({ to, label }) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__column" aria-label="Social media">
          <h2 className="site-footer__heading">Follow Along</h2>
          <ul className="site-footer__link-list site-footer__social-list">
            {footerSocialOrder.map((label) => {
              const configuredLink = socialLinks.find(
                (socialLink) => socialLink.label === label && socialLink.url,
              )
              if (!configuredLink) {
                return null
              }
              return (
                <li key={label}>
                  <a
                    href={configuredLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <SocialIcon name={label} />
                    <span>{label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
        <section className="site-footer__column site-footer__contact" aria-labelledby="footer-contact-title">
          <h2 className="site-footer__heading" id="footer-contact-title">Contact Us</h2>
          <ul className="site-footer__link-list">
            <li>
              <a href="mailto:Vibetogether.entertainments@gmail.com">
                <Mail size={17} aria-hidden="true" />
                <span>Vibetogether.<wbr />entertainments@gmail.com</span>
              </a>
            </li>
          </ul>
        </section>
      </div>
      <div className="site-footer__bottom">
        <div className="container container--wide">
          <p>© {currentYear} VIBE TOGETHER. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
