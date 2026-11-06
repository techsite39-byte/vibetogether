import { useContext } from 'react'
import { BookingEnquiryContext } from './bookingEnquiryContext.js'

export function useBookingEnquiry() {
  const context = useContext(BookingEnquiryContext)
  if (!context) {
    throw new Error('useBookingEnquiry must be used within BookingEnquiryProvider.')
  }

  return context
}
