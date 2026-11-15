import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  useState,
  Suspense,
} from 'react'
import { useLocation } from 'react-router-dom'
import { BookingEnquiryContext } from './bookingEnquiryContext.js'
import Loader from '../components/common/Loader.jsx'

const BookingJourney = lazy(() => import('../components/booking/BookingJourney.jsx'))

function isBookingFlow(pathname) {
  return (
    pathname === '/booking' ||
    pathname.startsWith('/booking/') ||
    pathname === '/my-bookings' ||
    pathname.startsWith('/admin')
  )
}

export function BookingEnquiryProvider({ children }) {
  const location = useLocation()
  const currentPath = useRef(location.pathname)
  const automaticPopupHandled = useRef(false)
  const bookingSession = useRef(0)
  const [activeBooking, setActiveBooking] = useState(null)

  const openBooking = useCallback((category = '') => {
    automaticPopupHandled.current = true
    bookingSession.current += 1
    setActiveBooking({ category, key: bookingSession.current })
  }, [])

  const closeBooking = useCallback(() => {
    automaticPopupHandled.current = true
    setActiveBooking(null)
  }, [])

  useEffect(() => {
    currentPath.current = location.pathname
    if (isBookingFlow(location.pathname)) {
      automaticPopupHandled.current = true
    }
    if (location.pathname.startsWith('/booking/step-4/') && !activeBooking) {
      bookingSession.current += 1
      setActiveBooking({ category: '', key: bookingSession.current })
    }
  }, [activeBooking, location.pathname])

  return (
    <BookingEnquiryContext.Provider value={{ openBooking }}>
      {children}
      {activeBooking && (
        <Suspense fallback={<Loader className="route-loader" label="Loading booking form..." />}>
          <BookingJourney
            key={activeBooking.key}
            initialCategory={activeBooking.category}
            onClose={closeBooking}
          />
        </Suspense>
      )}
    </BookingEnquiryContext.Provider>
  )
}
