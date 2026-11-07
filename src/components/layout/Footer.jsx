import {
  ArrowRight,
  Camera,
  UsersRound,
  Video,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { contactConfig } from '../../data/contact.js'

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

const socialIcons = {
  Instagram: Camera,
  Facebook: UsersRound,
  YouTube: Video,
  LinkedIn: UsersRound,
}
const footerSocialOrder = ['Instagram', 'Facebook', 'YouTube', 'LinkedIn']

export default function Footer({ socialLinks = contactConfig.socialLinks }) {
  const ctaRef = useRef(null)

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
              src="/assets/folder/footer.png"
              alt=""
              loading="lazy"
              decoding="async"
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
              src="/assets/folder/favicon.png"
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
              const Icon = socialIcons[label]
              return (
                <li key={label}>
                  {configuredLink ? (
                    <a
                      href={configuredLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {Icon && <Icon size={17} aria-hidden="true" />}
                      <span>{label}</span>
                    </a>
                  ) : (
                    <span className="site-footer__social-unconfigured">
                      {Icon && <Icon size={17} aria-hidden="true" />}
                      <span>{label}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container container--wide">
          <p>© {currentYear} VIBE TOGETHER. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
