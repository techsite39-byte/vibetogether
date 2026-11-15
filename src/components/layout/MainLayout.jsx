import { Suspense, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Loader from '../common/Loader.jsx'
import FloatingWhatsApp from '../contact/FloatingWhatsApp.jsx'
import Footer from './Footer.jsx'
import Navbar from './Navbar.jsx'
import useScrollReveal from '../../hooks/useScrollReveal.js'

const revealSelector = [
  '.home-section',
  '.home-memory-cta',
  '.home-categories__grid > *',
  '.home-events__grid > *',
  '.home-reasons__grid > *',
  '.home-testimonials__grid > *',
  '.events-grid > *',
  '.category-events__grid > *',
  '.memories-section',
  '.memories-photo-grid > *',
  '.memories-video__grid > *',
  '.testimonials-section',
  '.testimonials-reviews__grid > *',
  '.contact-section',
  '.contact-cards > *',
  '.event-detail__section',
  '.event-detail__related-grid > *',
  '.about-page__copy',
  '.about-page__feature',
  '.about-page__visual',
].join(',')

export default function MainLayout({ children }) {
  const location = useLocation()
  const mainRef = useRef(null)
  useScrollReveal(mainRef, location.pathname, revealSelector)

  return (
    <div className="site-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="site-main" ref={mainRef}>
        <Suspense
          fallback={<Loader className="route-loader" label="Loading page..." />}
        >
          {children ?? <Outlet />}
        </Suspense>
      </main>
      <Footer />
      <FloatingWhatsApp />
    </div>
  )
}
