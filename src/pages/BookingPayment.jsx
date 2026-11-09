import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  getBookingEnquiry,
  optOutOfWhatsAppUpdates,
  recordDemoBookingPayment,
} from '../services/bookingEnquiryPayment.js'
import './BookingPayment.css'

function formatBookingDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

export default function BookingPayment() {
  const { requestId } = useParams()
  const [bookingState, setBookingState] = useState({
    requestId,
    status: 'loading',
    booking: null,
    error: '',
  })
  const [isPaying, setIsPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [whatsappError, setWhatsAppError] = useState('')
  const [isOptingOut, setIsOptingOut] = useState(false)
  const paying = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    getBookingEnquiry(requestId, controller.signal)
      .then((booking) => setBookingState({ requestId, status: 'ready', booking, error: '' }))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setBookingState({
            requestId,
            status: 'error',
            booking: null,
            error: error instanceof Error ? error.message : 'Booking details could not be loaded.',
          })
        }
      })

    return () => controller.abort()
  }, [requestId])

  async function handlePay() {
    if (paying.current || bookingState.booking?.paymentStatus === 'demo_paid') {
      return
    }
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      const booking = await recordDemoBookingPayment(requestId)
      setBookingState({ requestId, status: 'ready', booking, error: '' })
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : 'Demo payment could not be recorded. Please retry.',
      )
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleWhatsAppOptOut() {
    if (isOptingOut || !bookingState.booking?.whatsappConsent) {
      return
    }
    setIsOptingOut(true)
    setWhatsAppError('')
    try {
      const booking = await optOutOfWhatsAppUpdates(requestId)
      setBookingState({ requestId, status: 'ready', booking, error: '' })
    } catch (error) {
      setWhatsAppError(error instanceof Error ? error.message : 'WhatsApp preferences could not be updated.')
    } finally {
      setIsOptingOut(false)
    }
  }

  const currentBookingState = bookingState.requestId === requestId
    ? bookingState
    : { status: 'loading', booking: null, error: '' }
  const booking = currentBookingState.booking
  const isPaid = booking?.paymentStatus === 'demo_paid'
  const whatsappStatus = booking?.whatsappNotification?.status ?? (
    booking?.whatsappConsent ? 'pending' : 'skipped'
  )

  function getWhatsAppMessage() {
    if (whatsappStatus === 'sent') return 'WhatsApp confirmation sent. Delivery is not yet confirmed.'
    if (whatsappStatus === 'delivered') return 'WhatsApp confirmation delivered.'
    if (whatsappStatus === 'read') return 'WhatsApp confirmation read.'
    if (whatsappStatus === 'pending') return 'Preparing your WhatsApp confirmation.'
    if (whatsappStatus === 'failed') {
      return 'Your booking is saved, but we could not send a WhatsApp confirmation. Our team can still assist you.'
    }
    return 'Your booking is saved. WhatsApp updates were not requested.'
  }

  return (
    <section className="booking-payment">
      <div className="booking-payment__glow" aria-hidden="true" />
      <div className="booking-payment__card">
        {currentBookingState.status === 'loading' ? (
          <div className="booking-payment__state" role="status">
            <LoaderCircle className="booking-payment__spinner" size={28} aria-hidden="true" />
            <p>Loading your booking details…</p>
          </div>
        ) : currentBookingState.status === 'error' ? (
          <div className="booking-payment__state" role="alert">
            <p className="booking-payment__eyebrow">BOOKING DETAILS</p>
            <h1>We couldn’t load your enquiry.</h1>
            <p>{currentBookingState.error}</p>
            <Link className="booking-payment__secondary" to="/booking">
              <ArrowLeft size={17} aria-hidden="true" /> Back to booking
            </Link>
          </div>
        ) : (
          <>
            <div className="booking-payment__brand-row">
              <Link className="booking-payment__back" to="/" aria-label="Back to Vibe Together">
                <ArrowLeft size={17} aria-hidden="true" /> VIBE TOGETHER
              </Link>
              <span className="booking-payment__demo-tag">DEMO MODE</span>
            </div>

            {isPaid ? (
              <div className="booking-payment__success" role="status">
                <span className="booking-payment__success-icon">
                  <CheckCircle2 size={32} aria-hidden="true" />
                </span>
                <p className="booking-payment__eyebrow">DEMO PAYMENT COMPLETE</p>
                <h1>Demo payment successful</h1>
                <p className="booking-payment__description">
                  Your enquiry is saved and its demo payment status has been recorded.
                  No real payment was processed and no money was collected.
                </p>
              </div>
            ) : (
              <>
                <p className="booking-payment__eyebrow">ONE LAST STEP</p>
                <h1>Confirm your enquiry</h1>
                <p className="booking-payment__description">
                  Review your details and continue to our secure payment experience.
                </p>
              </>
            )}

            <div className="booking-payment__summary">
              <div className="booking-payment__summary-heading">
                <div>
                  <span className="booking-payment__muted">YOUR BOOKING ENQUIRY</span>
                  <h2>{booking.category || booking.event || 'Vibe Together experience'}</h2>
                </div>
                <div className="booking-payment__amount">
                  <span>AMOUNT</span>
                  <strong>₹{booking.paymentAmount}</strong>
                </div>
              </div>
              <dl className="booking-payment__details">
                <div><dt>Name</dt><dd>{booking.name}</dd></div>
                <div><dt>Mobile</dt><dd>{booking.mobile}</dd></div>
                <div><dt>Category</dt><dd>{booking.category || booking.event || '—'}</dd></div>
                <div><dt>Gender</dt><dd>{booking.gender}</dd></div>
                <div><dt>Enquiry submitted</dt><dd>{formatBookingDate(booking.createdAt)}</dd></div>
              </dl>
            </div>
            <section className="booking-payment__confirmation" aria-label="Booking confirmation">
              <span className="booking-payment__muted">BOOKING REFERENCE</span>
              <strong>{booking.reference || 'Reference unavailable'}</strong>
              <p>
                Booking status: <b>{booking.status === 'confirmed' ? 'Approved' : 'Booking received — pending review'}</b>
              </p>
              <p className={`booking-payment__whatsapp booking-payment__whatsapp--${whatsappStatus}`} role="status">
                {getWhatsAppMessage()}
              </p>
              {booking.whatsappConsent && (
                <button className="booking-payment__opt-out" disabled={isOptingOut} onClick={() => void handleWhatsAppOptOut()} type="button">
                  {isOptingOut ? 'Updating preference…' : 'Stop WhatsApp updates'}
                </button>
              )}
              {whatsappError && <p className="booking-payment__error" role="alert">{whatsappError}</p>}
            </section>

            <div className="booking-payment__provider">
              <span className="booking-payment__lock"><LockKeyhole size={17} aria-hidden="true" /></span>
              <span>Checkout experience</span>
              <strong>Razorpay</strong>
            </div>
            <p className="booking-payment__secure-note">
              Secure payment powered by Razorpay.
            </p>
            <p className="booking-payment__demo-note">
              Demo mode is active. The Pay button records a simulated status only;
              Razorpay Checkout is not connected and no real payment will be taken.
            </p>

            {paymentError && <p className="booking-payment__error" role="alert">{paymentError}</p>}

            {isPaid ? (
              <div className="booking-payment__reference">
                Demo reference <code>{booking.paymentReference}</code>
              </div>
            ) : (
              <button
                className="booking-payment__pay"
                disabled={isPaying}
                onClick={handlePay}
                type="button"
              >
                {isPaying ? (
                  <>
                    <LoaderCircle className="booking-payment__spinner" size={18} aria-hidden="true" />
                    Processing demo payment…
                  </>
                ) : (
                  <>Pay ₹{booking.paymentAmount}</>
                )}
              </button>
            )}
            <Link className="booking-payment__continue" to="/">
              Continue exploring
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
