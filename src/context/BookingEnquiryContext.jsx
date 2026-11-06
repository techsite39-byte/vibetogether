import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { BookingEnquiryContext } from './bookingEnquiryContext.js'
import BookingJourney from '../components/booking/BookingJourney.jsx'

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

  const openBooking = useCallback((eventId = '') => {
    automaticPopupHandled.current = true
    bookingSession.current += 1
    setActiveBooking({ eventId, key: bookingSession.current })
  }, [])

  const closeBooking = useCallback(() => {
    automaticPopupHandled.current = true
    setActiveBooking(null)
  }, [])

  useEffect(() => {
    currentPath.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (isBookingFlow(currentPath.current)) {
      automaticPopupHandled.current = true
      return undefined
    }

    const timer = window.setTimeout(() => {
      if (automaticPopupHandled.current) {
        return
      }

      automaticPopupHandled.current = true
      if (!isBookingFlow(currentPath.current)) {
        bookingSession.current += 1
        setActiveBooking({ eventId: '', key: bookingSession.current })
      }
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <BookingEnquiryContext.Provider value={{ openBooking }}>
      {children}
      {activeBooking && (
        <BookingJourney
          key={activeBooking.key}
          initialEventId={activeBooking.eventId}
          onClose={closeBooking}
        />
      )}
    </BookingEnquiryContext.Provider>
  )
}
