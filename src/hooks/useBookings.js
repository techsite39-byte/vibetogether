import { useCallback, useEffect, useRef, useState } from 'react'
import { getBooking } from '../services/bookingRecords.js'
import { getBookingReferences, subscribeToBookings } from '../utils/bookingStorage.js'

export default function useBookings() {
  const [state, setState] = useState({ bookings: [], error: '', loading: true })
  const controllerRef = useRef(null)

  const refresh = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    let references
    try {
      references = getBookingReferences()
    } catch (error) {
      setState({
        bookings: [],
        error: error instanceof Error ? error.message : 'Booking references are unavailable.',
        loading: false,
      })
      return
    }

    setState((current) => ({ ...current, loading: true, error: '' }))
    Promise.all(references.map((reference) => getBooking(reference, controller.signal)))
      .then((bookings) => setState({ bookings, error: '', loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            bookings: [],
            error: error instanceof Error ? error.message : 'Bookings could not be loaded.',
            loading: false,
          })
        }
      })
  }, [])

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeToBookings(refresh)
    return () => {
      unsubscribe()
      controllerRef.current?.abort()
    }
  }, [refresh])

  return { ...state, refresh }
}
