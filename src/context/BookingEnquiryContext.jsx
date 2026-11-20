import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookingEnquiryContext } from './bookingEnquiryContext.js'

const journeyStepQuery = 'bookingJourneyStep'
const requestIdQuery = 'bookingRequestId'

export function BookingEnquiryProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()

  // Clean up any legacy booking journey query parameters and redirect to the booking page
  useEffect(() => {
    const search = new URLSearchParams(location.search)
    if (search.has(journeyStepQuery) || search.has(requestIdQuery)) {
      search.delete(journeyStepQuery)
      search.delete(requestIdQuery)
      const category = location.state?.bookingCategory || ''
      const searchStr = search.toString()
      const destination = category
        ? `/booking?category=${encodeURIComponent(category)}${searchStr ? `&${searchStr}` : ''}`
        : `/booking${searchStr ? `?${searchStr}` : ''}`
      navigate(destination, { replace: true })
    }
  }, [location.search, location.state, navigate])

  const openBooking = useCallback(
    (target = '') => {
      if (target && typeof target === 'object' && target.id) {
        navigate(`/booking/${encodeURIComponent(target.id)}`)
        return
      }
      if (typeof target === 'string' && target.trim()) {
        navigate(`/booking?category=${encodeURIComponent(target.trim())}`)
        return
      }
      navigate('/booking')
    },
    [navigate],
  )

  const closeBooking = useCallback(() => {
    // No-op for backward compatibility
  }, [])

  const contextValue = useMemo(
    () => ({
      openBooking,
      closeBooking,
    }),
    [openBooking, closeBooking],
  )

  return (
    <BookingEnquiryContext.Provider value={contextValue}>
      {children}
    </BookingEnquiryContext.Provider>
  )
}
