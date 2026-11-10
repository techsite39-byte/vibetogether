import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  checkRazorpayPaymentStatus,
  createRazorpayOrder,
  getBookingEnquiry,
  recordRazorpayPaymentFailure,
  recordDemoBookingFailure,
  recordDemoBookingPayment,
  verifyRazorpayPayment,
} from '../services/bookingEnquiryPayment.js'
import './BookingPayment.css'

const paymentAttemptTimeoutMs = 2 * 60 * 1000
const razorpayScriptUrl = 'https://checkout.razorpay.com/v1/checkout.js'

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${razorpayScriptUrl}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = razorpayScriptUrl
    script.async = true
    script.onload = () => resolve(Boolean(window.Razorpay))
    script.onerror = () => resolve(false)
    document.head.append(script)
  })
}

function isRecentProcessing(booking) {
  if (booking?.paymentStatus !== 'processing') {
    return false
  }
  const attemptedAt = new Date(booking.paymentAttemptedAt ?? '').getTime()
  return !Number.isFinite(attemptedAt) || Date.now() - attemptedAt < paymentAttemptTimeoutMs
}

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [bookingState, setBookingState] = useState({
    requestId,
    status: 'loading',
    booking: null,
    error: '',
  })
  const [isPaying, setIsPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentUncertain, setPaymentUncertain] = useState(false)
  const paying = useRef(false)
  const paymentOutcomeHandled = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    getBookingEnquiry(requestId, controller.signal)
      .then(async (initialBooking) => {
        let booking = initialBooking
        let statusCheckFailed = false
        if (
          booking.razorpayConfigured &&
          booking.paymentOrderId &&
          booking.paymentStatus !== 'paid'
        ) {
          try {
            const result = await checkRazorpayPaymentStatus(requestId)
            booking = result.booking
          } catch {
            statusCheckFailed = true
          }
        }
        setBookingState({ requestId, status: 'ready', booking, error: '' })
        setPaymentUncertain(statusCheckFailed || isRecentProcessing(booking))
      })
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

  useEffect(() => {
    const booking = bookingState.booking
    const status = booking?.whatsappNotification?.status
    if (
      !booking?.reference ||
      !['pending', 'sent'].includes(status)
    ) {
      return undefined
    }

    let active = true
    const timer = window.setInterval(async () => {
      try {
        const latest = await getBookingEnquiry(requestId)
        if (active) {
          setBookingState({ requestId, status: 'ready', booking: latest, error: '' })
        }
      } catch {
        // The current server-provided notification status remains visible until the next refresh.
      }
    }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [bookingState.booking?.reference, bookingState.booking?.whatsappNotification?.status, requestId])

  async function refreshPaymentStatus() {
    setPaymentError('')
    try {
      let booking = await getBookingEnquiry(requestId)
      if (booking.razorpayConfigured && booking.paymentOrderId && booking.paymentStatus !== 'paid') {
        const status = await checkRazorpayPaymentStatus(requestId)
        booking = status.booking
      }
      setBookingState({ requestId, status: 'ready', booking, error: '' })
      setPaymentUncertain(isRecentProcessing(booking))
      if (['demo_paid', 'paid'].includes(booking.paymentStatus) && booking.reference) {
        navigate(`/booking/payment/${encodeURIComponent(requestId)}`, { replace: true })
      }
      return booking
    } catch (error) {
      setPaymentUncertain(true)
      setPaymentError(
        error instanceof Error
          ? 'Payment status could not be verified. Check again before trying to pay.'
          : 'Payment status could not be verified. Check again before trying to pay.',
      )
      return null
    }
  }

  async function handleRazorpayFailure(failure) {
    if (paymentOutcomeHandled.current) {
      return
    }
    paymentOutcomeHandled.current = true
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    try {
      const result = await recordRazorpayPaymentFailure(requestId, failure)
      setBookingState({ requestId, status: 'ready', booking: result.booking, error: '' })
      setPaymentUncertain(Boolean(result.pending) || isRecentProcessing(result.booking))
      if (!result.pending && result.booking.paymentStatus === 'failed') {
        navigate(`/booking/payment/${encodeURIComponent(requestId)}`, { replace: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment status could not be verified.'
      const refreshed = await refreshPaymentStatus()
      if (refreshed && !['paid', 'demo_paid'].includes(refreshed.paymentStatus)) {
        setPaymentError(message)
      }
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleRazorpayPay() {
    if (paying.current || paymentUncertain || bookingState.booking?.reference) {
      return
    }
    paying.current = true
    paymentOutcomeHandled.current = false
    setIsPaying(true)
    setPaymentError('')

    try {
      const order = await createRazorpayOrder(requestId)
      if (order.pending) {
        setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
        setPaymentUncertain(true)
        return
      }
      setBookingState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          paymentAmount: order.amount / 100,
          paymentAmountPaise: order.amount,
          ...(order.pricing ?? {}),
        },
      }))
      if (!(await loadRazorpayCheckout())) {
        throw new Error('Razorpay Checkout could not be loaded. Check your connection and retry.')
      }

      const isDiwali = Boolean(order.pricing?.diwaliOfferApplied ?? bookingState.booking?.diwaliOfferApplied)
      const bookingCategory = bookingState.booking?.category || bookingState.booking?.event || 'Event Booking'
      const amountRupees = order.amount / 100
      const savings = order.pricing?.discount ?? (isDiwali ? (bookingState.booking?.regularPrice ?? 299) - amountRupees : 0)
      const ticketQuantity = order.pricing?.ticketQuantity ?? bookingState.booking?.ticketQuantity ?? 1
      const description = isDiwali
        ? `${bookingCategory} • ${ticketQuantity} ticket(s) • Diwali Offer ₹${amountRupees} (Saved ₹${savings})`
        : `${bookingCategory} • ${ticketQuantity} ticket(s) • ₹${amountRupees}`

      const rawContact = bookingState.booking?.mobile ?? ''
      const sanitizedContact = rawContact.replace(/\D/g, '').slice(-10)

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'VIBE TOGETHER',
        description,
        image: `${window.location.origin}/assets/folder/favicon.png`,
        order_id: order.order_id,
        prefill: {
          name: bookingState.booking?.name ?? '',
          email: bookingState.booking?.email ?? '',
          contact: sanitizedContact || rawContact,
        },
        notes: {
          booking_request_id: requestId,
          booking_category: bookingCategory,
          ticket_type: bookingState.booking?.ticketTypeName ?? 'General Admission',
          ticket_quantity: String(ticketQuantity),
          diwali_offer: isDiwali ? `Applied (Saved ₹${savings})` : 'No',
        },
        theme: {
          color: '#773bff',
          backdrop_color: 'rgba(7, 5, 16, 0.88)',
          hide_topbar: false,
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay using UPI, Google Pay, PhonePe or QR',
                instruments: [
                  {
                    method: 'upi',
                  },
                ],
              },
              other: {
                name: 'Other Payment Methods (Cards, Netbanking, Wallets)',
                instruments: [
                  {
                    method: 'card',
                  },
                  {
                    method: 'netbanking',
                  },
                  {
                    method: 'wallet',
                  },
                ],
              },
            },
            sequence: ['block.upi', 'block.other'],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        modal: {
          backdropclose: false,
          escape: true,
          handleback: true,
          confirm_close: true,
          ondismiss: () => void handleRazorpayFailure({
            orderId: order.order_id,
            outcome: 'cancelled',
          }),
        },
        handler: async (payment) => {
          if (paymentOutcomeHandled.current) {
            return
          }
          paymentOutcomeHandled.current = true
          paying.current = true
          setIsPaying(true)
          setPaymentError('')
          try {
            const result = await verifyRazorpayPayment(requestId, payment)
            setBookingState({ requestId, status: 'ready', booking: result.booking, error: '' })
            setPaymentUncertain(Boolean(result.pending) || isRecentProcessing(result.booking))
            if (result.booking.paymentStatus === 'paid' && result.booking.reference) {
              navigate(`/booking/payment/${encodeURIComponent(requestId)}`, { replace: true })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Payment signature could not be verified.'
            const refreshed = await refreshPaymentStatus()
            if (refreshed && !['paid', 'demo_paid'].includes(refreshed.paymentStatus)) {
              setPaymentError(message)
            }
          } finally {
            paying.current = false
            setIsPaying(false)
          }
        },
      })

      checkout.on('payment.failed', (event) => {
        void handleRazorpayFailure({
          orderId: event.error?.metadata?.order_id || order.order_id,
          paymentId: event.error?.metadata?.payment_id || '',
          outcome: 'failed',
        })
      })
      checkout.open()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Razorpay Checkout could not be started.'
      const refreshed = await refreshPaymentStatus()
      if (refreshed && !['paid', 'demo_paid'].includes(refreshed.paymentStatus)) {
        setPaymentError(message)
      }
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handlePay() {
    if (bookingState.booking?.razorpayConfigured) {
      await handleRazorpayPay()
      return
    }
    if (paying.current || paymentUncertain || bookingState.booking?.reference) {
      return
    }
    paying.current = true
    setIsPaying(true)
    setPaymentUncertain(true)
    setPaymentError('')
    try {
      const booking = await recordDemoBookingPayment(requestId)
      setBookingState({ requestId, status: 'ready', booking, error: '' })
      setPaymentUncertain(isRecentProcessing(booking))
      if (['demo_paid', 'paid'].includes(booking.paymentStatus) && booking.reference) {
        navigate(`/booking/payment/${encodeURIComponent(requestId)}`, { replace: true })
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Demo payment could not be recorded. Please retry.'
      const refreshed = await refreshPaymentStatus()
      if (refreshed && !['paid', 'demo_paid'].includes(refreshed.paymentStatus)) {
        setPaymentError(message)
      }
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleDemoFailure(outcome) {
    if (paying.current || bookingState.booking?.reference) {
      return
    }
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    try {
      const booking = await recordDemoBookingFailure(requestId, outcome)
      setBookingState({ requestId, status: 'ready', booking, error: '' })
      setPaymentUncertain(false)
      navigate(`/booking/payment/${encodeURIComponent(requestId)}`, { replace: true })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Payment status could not be saved.'
      const refreshed = await refreshPaymentStatus()
      if (refreshed && !['paid', 'demo_paid'].includes(refreshed.paymentStatus)) {
        setPaymentError(message)
      }
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  const currentBookingState = bookingState.requestId === requestId
    ? bookingState
    : { status: 'loading', booking: null, error: '' }
  const booking = currentBookingState.booking
  const isPaid = ['demo_paid', 'paid'].includes(booking?.paymentStatus) && Boolean(booking?.reference)
  const isDemoPayment = !booking?.razorpayConfigured
  const isPaymentFailed = booking?.paymentStatus === 'failed'
  const isFailureView = isPaymentFailed && !paymentUncertain && searchParams.get('retry') !== '1'
  const isVerifying = paymentUncertain || isRecentProcessing(booking)
  const paymentLabel = booking?.paymentStatus === 'demo_paid'
    ? 'Demo Paid'
    : booking?.paymentStatus === 'paid'
      ? 'Paid'
      : booking?.paymentStatus === 'failed'
        ? 'Failed'
        : 'Unpaid'
  const bookingLabel = booking?.status === 'confirmed' ? 'Approved' : 'Pending Approval'
  const notificationStatus = booking?.whatsappNotification?.status ?? 'not_available'
  const notificationCopy = ({
    pending: isPaymentFailed
      ? 'Your payment-assistance notification is being sent to your WhatsApp number.'
      : 'Your booking confirmation is being sent to your WhatsApp number.',
    sent: isPaymentFailed
      ? 'WhatsApp accepted the payment-assistance message and is awaiting delivery confirmation.'
      : 'Your booking confirmation was accepted by WhatsApp and is awaiting delivery confirmation.',
    delivered: isPaymentFailed
      ? 'Your payment-assistance message was delivered to your WhatsApp number.'
      : 'Your booking confirmation was delivered to your WhatsApp number.',
    read: isPaymentFailed
      ? 'Your payment-assistance message was read on WhatsApp.'
      : 'Your booking confirmation was read on WhatsApp.',
    failed: isPaymentFailed
      ? 'We could not send the payment-assistance notification. You can still retry payment.'
      : 'We could not send your WhatsApp confirmation. Your booking is still safely confirmed.',
    skipped: booking?.whatsappConsent
      ? 'No WhatsApp notification was sent for this booking.'
      : 'WhatsApp notification skipped because you did not opt in.',
  })[notificationStatus] ?? 'WhatsApp notification status is not available.'

  function handleTryPaymentAgain() {
    setPaymentError('')
    setPaymentUncertain(false)
    navigate(`/booking/payment/${encodeURIComponent(requestId)}?retry=1`, { replace: true })
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
              <span className="booking-payment__demo-tag">
                {isDemoPayment ? 'DEMO PAYMENT' : 'RAZORPAY CHECKOUT'}
              </span>
            </div>

            {isPaid ? (
              <div className="booking-payment__success" role="status">
                <span className="booking-payment__success-icon">
                  <CheckCircle2 size={36} aria-hidden="true" />
                </span>
                <p className="booking-payment__eyebrow">
                  {booking.paymentStatus === 'demo_paid' ? 'DEMO PAYMENT COMPLETE' : 'PAYMENT SUCCESSFUL'}
                </p>
                <h1>Payment Successful!</h1>
                <p className="booking-payment__description">
                  {booking.paymentStatus === 'demo_paid'
                    ? 'Your booking is finalized as a demo payment record; no real payment was processed.'
                    : 'Your Razorpay payment was verified and your booking is finalized.'}
                </p>
              </div>
            ) : isFailureView ? (
              <div className="booking-payment__failure" role="alert">
                <p className="booking-payment__eyebrow">PAYMENT NOT COMPLETED</p>
                <h1>Your payment was not completed.</h1>
                <p className="booking-payment__description">
                  Don&apos;t worry! Your booking details are saved temporarily. Please
                  try again to complete your booking.
                </p>
              </div>
            ) : (
              <>
                <p className="booking-payment__eyebrow">ONE LAST STEP</p>
                <h1>Complete your booking</h1>
                <p className="booking-payment__description">
                  {isDemoPayment
                    ? `Review your details and continue with the ₹${booking.paymentAmount} demo payment.`
                    : 'Review your details and continue securely with Razorpay Checkout.'}
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
                  <span>{isPaid ? 'AMOUNT PAID' : 'AMOUNT'}</span>
                  <strong>₹{booking.paymentAmount}</strong>
                  {booking.diwaliOfferApplied && (
                    <small className="booking-payment__offer-tag">DIWALI OFFER · SAVED ₹{booking.discount ?? booking.regularPrice - booking.paymentAmount}</small>
                  )}
                  {booking.diwaliOfferApplied && <s>₹{booking.subtotal ?? booking.regularPrice}</s>}
                </div>
              </div>
              <dl className="booking-payment__details">
                <div><dt>Name</dt><dd>{booking.name}</dd></div>
                <div><dt>Mobile</dt><dd>{booking.mobile}</dd></div>
                <div><dt>Email</dt><dd>{booking.email || 'Not provided'}</dd></div>
                <div><dt>Category</dt><dd>{booking.category || booking.event || '—'}</dd></div>
                <div><dt>Ticket type</dt><dd>{booking.ticketTypeName || 'General Admission'}</dd></div>
                <div><dt>Number of tickets</dt><dd>{booking.ticketQuantity ?? 1}</dd></div>
                <div><dt>Price per ticket</dt><dd>₹{booking.pricePerTicket ?? booking.regularPrice ?? 299}</dd></div>
                <div><dt>Subtotal</dt><dd>₹{booking.subtotal ?? booking.paymentAmount}</dd></div>
                <div><dt>Diwali discount</dt><dd>−₹{booking.discount ?? 0}</dd></div>
                <div><dt>Gender</dt><dd>{booking.gender}</dd></div>
                <div><dt>Booking date</dt><dd>{formatBookingDate(booking.createdAt)}</dd></div>
              </dl>
            </div>
            {isPaid ? (
              <>
                <section className="booking-payment__confirmation" aria-label="Booking confirmation">
                  <span className="booking-payment__muted">BOOKING REFERENCE</span>
                  <strong>{booking.reference}</strong>
                  <p>Payment status: <b>PAID</b></p>
                  <p>Booking status: <b>{bookingLabel}</b></p>
                </section>
                <div className="booking-payment__processing-notice" role="status">
                  <small>Your confirmation notification is being processed.</small>
                </div>
              </>
            ) : isFailureView ? (
              <>
                <div className="booking-payment__retry-actions">
                  <button className="booking-payment__pay" onClick={handleTryPaymentAgain} type="button">
                    Try Payment Again
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="booking-payment__provider">
                  <span className="booking-payment__lock"><LockKeyhole size={17} aria-hidden="true" /></span>
                  <span>Payment mode</span>
                  <strong>{isDemoPayment ? 'Demo Payment' : 'Razorpay'}</strong>
                </div>
                {isDemoPayment ? (
                  <p className="booking-payment__demo-note">
                    Razorpay Checkout is not configured. This development-only simulator
                    records Demo Paid or Failed on the backend; no real money is charged.
                  </p>
                ) : (
                  <p className="booking-payment__secure-note">
                    Orders are created and verified by the booking server. Your booking
                    is finalized only after Razorpay confirms the payment.
                  </p>
                )}
                {paymentError && <p className="booking-payment__error" role="alert">{paymentError}</p>}
                {isVerifying ? (
                  <button className="booking-payment__pay" disabled={isPaying} onClick={() => void refreshPaymentStatus()} type="button">
                    {isPaying ? 'Checking payment status…' : 'Check Payment Status'}
                  </button>
                ) : (
                  <>
                    <button className="booking-payment__pay" disabled={isPaying} onClick={() => void handlePay()} type="button">
                      {isPaying
                        ? 'Starting secure checkout…'
                        : isDemoPayment
                          ? `Simulate Demo Payment Success · ₹${booking.paymentAmount}`
                          : `Pay ₹${booking.paymentAmount} with Razorpay`}
                    </button>
                    {isDemoPayment && (
                      <div className="booking-payment__retry-actions">
                        <button className="booking-payment__secondary" disabled={isPaying} onClick={() => void handleDemoFailure('failed')} type="button">
                          Simulate Failed Payment
                        </button>
                        <button className="booking-payment__secondary" disabled={isPaying} onClick={() => void handleDemoFailure('cancelled')} type="button">
                          Cancel Demo Payment
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
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
