import { useEffect, useState } from 'react'
import { getBookingEvents } from '../services/bookingEnquiry.js'

export default function usePublicEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getBookingEvents(controller.signal)
      .then(setEvents)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Events could not be loaded.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
      return () => controller.abort()
  }, [])

  return { events, loading, error }
}
