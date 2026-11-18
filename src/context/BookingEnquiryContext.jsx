import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  useState,
  Suspense,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookingEnquiryContext } from './bookingEnquiryContext.js'
import Loader from '../components/common/Loader.jsx'

const BookingJourney = lazy(() => import('../components/booking/BookingJourney.jsx'))
const journeyStepQuery = 'bookingJourneyStep'
const requestIdQuery = 'bookingRequestId'

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
  const navigate = useNavigate()
  const locationRef = useRef(location)
  const currentPath = useRef(location.pathname)
  const automaticPopupHandled = useRef(false)
  const bookingSession = useRef(0)
  const freshBookingPending = useRef(false)
  const [activeBooking, setActiveBooking] = useState(null)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  const openBooking = useCallback((category = '') => {
    automaticPopupHandled.current = true
    freshBookingPending.current = true
    bookingSession.current += 1
    const search = new URLSearchParams(location.search)
    search.set(journeyStepQuery, '1')
    search.delete(requestIdQuery)
    setActiveBooking({
      category,
      initialStep: 0,
      key: bookingSession.current,
      resumeDraft: false,
    })
    navigate(
      { pathname: location.pathname, search: `?${search.toString()}` },
      {
        state: {
          bookingJourneyStep: 1,
          bookingJourneyOrigin: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
          bookingCategory: category,
        },
      },
    )
  }, [location.hash, location.pathname, location.search, navigate])

  const closeBooking = useCallback(() => {
    automaticPopupHandled.current = true
    setActiveBooking(null)
    const currentLocation = locationRef.current
    const search = new URLSearchParams(currentLocation.search)
    search.delete(journeyStepQuery)
    search.delete(requestIdQuery)
    const pathname = currentLocation.pathname.startsWith('/booking/step-4/')
      ? '/booking'
      : currentLocation.pathname
    navigate(
      { pathname, search: search.size ? `?${search.toString()}` : '' },
      { replace: true },
    )
  }, [navigate])

  useEffect(() => {
    currentPath.current = location.pathname
    if (isBookingFlow(location.pathname)) {
      automaticPopupHandled.current = true
    }

    if (location.pathname.startsWith('/booking/payment/')) {
      setActiveBooking(null)
      return
    }

    const legacyStepFour = location.pathname.match(/^\/booking\/step-4\/([^/]+)$/)
    const search = new URLSearchParams(location.search)
    const requestedStep = Number(search.get(journeyStepQuery))
    const hasJourneyStep = (
      Number.isInteger(requestedStep) &&
      requestedStep >= 1 &&
      requestedStep <= 4
    )

    if (legacyStepFour || hasJourneyStep) {
      setActiveBooking((current) => {
        if (current) {
          freshBookingPending.current = false
          return current
        }
        bookingSession.current += 1
        const resumeDraft = !freshBookingPending.current
        freshBookingPending.current = false
        return {
          category: location.state?.bookingCategory ?? '',
          initialRequestId: search.get(requestIdQuery) ?? legacyStepFour?.[1] ?? '',
          initialStep: legacyStepFour ? 3 : requestedStep - 1,
          key: bookingSession.current,
          resumeDraft,
        }
      })
      return
    }

    setActiveBooking(null)
  }, [location.pathname, location.search, location.state])

  return (
    <BookingEnquiryContext.Provider value={{ openBooking }}>
      {children}
      {activeBooking && (
        <Suspense fallback={<Loader className="route-loader" label="Loading booking form..." />}>
          <BookingJourney
            key={activeBooking.key}
            initialCategory={activeBooking.category}
            initialRequestId={activeBooking.initialRequestId}
            initialStep={activeBooking.initialStep}
            onClose={closeBooking}
            resumeDraft={activeBooking.resumeDraft}
          />
        </Suspense>
      )}
    </BookingEnquiryContext.Provider>
  )
}
