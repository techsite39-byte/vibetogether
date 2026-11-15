import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import Button from '../common/Button.jsx'
import { useBookingEnquiry } from '../../context/useBookingEnquiry.js'

const navigationLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/events', label: 'Events', end: true },
  { to: '/gallery', label: 'Gallery' },
  { to: '/testimonials', label: 'Testimonials' },
  { to: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const location = useLocation()
  const { openBooking } = useBookingEnquiry()
  const [openMenuPath, setOpenMenuPath] = useState(null)
  const isMenuOpen = openMenuPath === location.pathname
  const menuButtonRef = useRef(null)

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpenMenuPath(null)
        menuButtonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isMenuOpen])

  function closeMenu() {
    setOpenMenuPath(null)
  }

  function toggleMenu() {
    setOpenMenuPath(isMenuOpen ? null : location.pathname)
  }

  return (
    <header className="site-header">
      <div className="site-header__inner container container--wide">
        <Link className="site-brand" to="/" aria-label="Vibe Together home">
          <img
            className="site-brand__logo"
            src="/assets/optimized/favicon-256-v1.webp"
            alt="Vibe Together"
            width="64"
            height="64"
            decoding="async"
          />
          <span className="site-brand__tagline">Different People. One Vibe.</span>
        </Link>

        <button
          ref={menuButtonRef}
          aria-controls="primary-navigation"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="site-nav-toggle"
          onClick={toggleMenu}
          type="button"
        >
          {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav
          className={`site-nav${isMenuOpen ? ' is-open' : ''}`}
          id="primary-navigation"
          aria-label="Main navigation"
        >
          <div className="site-nav__panel">
            <ul className="site-nav__list">
              {navigationLinks.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    className={({ isActive }) =>
                      `site-nav__link${isActive ? ' is-active' : ''}`
                    }
                    end={end}
                    onClick={closeMenu}
                    to={to}
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <Button
              className="site-nav__cta"
              onClick={() => {
                closeMenu()
                openBooking()
              }}
            >
              Book Now <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </div>
    </header>
  )
}
