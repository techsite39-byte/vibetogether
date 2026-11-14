import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Tag,
  Ticket,
  User,
  Users,
  WalletCards,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import UpiPayment from './UpiPayment.jsx'
import {
  checkRazorpayPaymentStatus,
  createRazorpayOrder,
  getBookingEnquiry,
  recordRazorpayPaymentFailure,
  verifyRazorpayPayment,
} from '../services/bookingEnquiryPayment.js'
import './BookingPayment.css'

const paymentAttemptTimeoutMs = 2 * 60 * 1000
const razorpayScriptUrl = 'https://checkout.razorpay.com/v1/razorpay.js'
const customUpiQrEnabled = import.meta.env.VITE_RAZORPAY_CUSTOM_UPI_QR_ENABLED === 'true'
const cardYears = Array.from({ length: 16 }, (_, index) => String((new Date().getFullYear() + index) % 100).padStart(2, '0'))
const mobileViewportQuery = '(max-width: 700px)'

function subscribeToMobileViewport(onChange) {
  const mediaQuery = window.matchMedia(mobileViewportQuery)
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

function getMobileViewportSnapshot() {
  return window.matchMedia(mobileViewportQuery).matches
}

function getServerMobileViewportSnapshot() {
  return false
}

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
  if (booking?.paymentStatus !== 'processing' || booking?.paymentProvider === 'upi') {
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
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }).format(date)
}

function getBookingMembers(booking) {
  return [
    ['Male', booking?.maleCount ?? (booking?.gender === 'Male' ? booking?.ticketQuantity ?? 1 : 0), booking?.maleMemberNames],
    ['Female', booking?.femaleCount ?? (booking?.gender === 'Female' ? booking?.ticketQuantity ?? 1 : 0), booking?.femaleMemberNames],
  ].flatMap(([gender, count, names]) => Array.from({ length: count }, (_, index) => ({
    label: `${gender} Member ${index + 1}`,
    name: Array.isArray(names) ? names[index] ?? '' : '',
  })))
}

function getAvailablePaymentMethods(methods = {}) {
  return {
    upi: Boolean(methods.upi),
    creditCard: Boolean(methods.credit_card ?? methods.card),
    debitCard: Boolean(methods.debit_card ?? methods.card),
    banks: Object.entries(methods.netbanking ?? {})
      .filter(([, name]) => typeof name === 'string' && name.trim())
      .map(([code, name]) => ({ code, name })),
    wallets: Object.entries(methods.wallet ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([code]) => code),
  }
}

export default function BookingPayment() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const retryingPayment = searchParams.get('retry') === '1'
  const [bookingState, setBookingState] = useState({
    requestId,
    status: 'loading',
    booking: null,
    error: '',
  })
  const [isPaying, setIsPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentUncertain, setPaymentUncertain] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedWallet, setSelectedWallet] = useState('')
  const [razorpayOrder, setRazorpayOrder] = useState(null)
  const [isInitializingCheckout, setIsInitializingCheckout] = useState(false)
  const [checkoutRequested, setCheckoutRequested] = useState(false)
  const [checkoutInitRetry, setCheckoutInitRetry] = useState(0)
  const isMobileCheckout = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot,
  )
  const [qrData, setQrData] = useState(null)
  const [qrImage, setQrImage] = useState('')
  const paying = useRef(false)
  const paymentOutcomeHandled = useRef(false)
  const paymentFallbackTimer = useRef(null)
  const customCheckout = useRef(null)
  const bookingReady = bookingState.status
  const bookingPaymentStatus = bookingState.booking?.paymentStatus
  const bookingHasReference = Boolean(bookingState.booking?.reference)
  const razorpayConfiguredForBooking = Boolean(bookingState.booking?.razorpayConfigured)

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

  function clearPaymentFallbackTimer() {
    if (paymentFallbackTimer.current !== null) {
      window.clearTimeout(paymentFallbackTimer.current)
      paymentFallbackTimer.current = null
    }
  }

  useEffect(() => () => clearPaymentFallbackTimer(), [])

  async function reconcileUnreportedPayment() {
    clearPaymentFallbackTimer()
    if (!paying.current || paymentOutcomeHandled.current) return
    setPaymentError('')
    try {
      const result = await checkRazorpayPaymentStatus(requestId)
      setBookingState({ requestId, status: 'ready', booking: result.booking, error: '' })
      setPaymentUncertain(Boolean(result.pending) || isRecentProcessing(result.booking))
      if (['paid', 'demo_paid'].includes(result.booking.paymentStatus)) {
        setPaymentError('')
      } else if (result.booking.paymentStatus === 'failed') {
        setPaymentError('Payment did not complete. Retry or choose another payment method.')
      } else {
        setPaymentError('Razorpay is still processing this attempt. Check its status before retrying.')
      }
    } catch {
      setPaymentUncertain(true)
      setPaymentError('Razorpay has not confirmed this attempt yet. Check its status before retrying.')
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleRazorpayFailure(failure) {
    if (paymentOutcomeHandled.current) {
      return
    }
    paymentOutcomeHandled.current = true
    clearPaymentFallbackTimer()
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    setQrData(null)
    try {
      const result = await recordRazorpayPaymentFailure(requestId, failure)
      setBookingState({ requestId, status: 'ready', booking: result.booking, error: '' })
      setPaymentUncertain(Boolean(result.pending) || isRecentProcessing(result.booking))
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

  const handleCustomPaymentSuccess = useEffectEvent(async (payment) => {
    if (paymentOutcomeHandled.current) return
    paymentOutcomeHandled.current = true
    clearPaymentFallbackTimer()
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    setQrData(null)

    try {
      const result = await verifyRazorpayPayment(requestId, payment)
      setBookingState({ requestId, status: 'ready', booking: result.booking, error: '' })
      setPaymentUncertain(Boolean(result.pending) || isRecentProcessing(result.booking))
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
  })

  const handleCustomPaymentError = useEffectEvent(async (failure, orderId) => {
    if (paymentOutcomeHandled.current) return
    clearPaymentFallbackTimer()
    const error = failure?.error ?? failure
    const paymentId = error?.metadata?.payment_id ?? ''
    const failedOrderId = error?.metadata?.order_id ?? orderId
    if (paymentId || error?.metadata?.order_id || error?.reason === 'payment_cancelled' || error?.reason === 'payment_failed') {
      await handleRazorpayFailure({
        orderId: failedOrderId,
        paymentId,
        outcome: error?.reason === 'payment_cancelled' ? 'cancelled' : 'failed',
      })
      if (error?.description) setPaymentError(error.description)
      return
    }

    paying.current = false
    setIsPaying(false)
    setQrData(null)
    setPaymentError(error?.description || 'Razorpay could not start this payment. Try another method.')
  })

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
    if (
      bookingReady !== 'ready' ||
      !checkoutRequested ||
      !razorpayConfiguredForBooking ||
      bookingHasReference ||
      ['paid', 'demo_paid'].includes(bookingPaymentStatus) ||
      paymentUncertain ||
      (bookingPaymentStatus === 'failed' && !retryingPayment)
    ) {
      return undefined
    }

    const active = { current: true }

    async function initializeCustomCheckout() {
      const order = await createRazorpayOrder(requestId)
      if (order.pending) {
        if (active.current) {
          setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
          setPaymentUncertain(true)
        }
        return
      }
      if (!active.current) return

      setRazorpayOrder(order)
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
        throw new Error('Razorpay Custom Checkout could not be loaded. Check your connection and retry.')
      }
      if (!active.current) return

      const checkout = new window.Razorpay({
        key: order.key_id,
        image: `${window.location.origin}/assets/optimized/favicon-192-v1.png`,
        redirect: false,
      })
      customCheckout.current = checkout
      checkout.once('ready', (response) => {
        if (!active.current) return
        const enabledMethods = getAvailablePaymentMethods(response?.methods ?? checkout.methods)
        setPaymentMethods(enabledMethods)
        const firstMethod = enabledMethods.upi
          ? 'upi'
          : enabledMethods.creditCard
            ? 'credit_card'
            : enabledMethods.debitCard
              ? 'debit_card'
              : enabledMethods.banks.length
                ? 'netbanking'
                : enabledMethods.wallets.length ? 'wallet' : ''
        setSelectedMethod(firstMethod)
        setSelectedBank(enabledMethods.banks[0]?.code ?? '')
        setSelectedWallet(enabledMethods.wallets[0] ?? '')
        setIsInitializingCheckout(false)
      })
      checkout.on('payment.success', handleCustomPaymentSuccess)
      checkout.on('payment.error', (failure) => {
        void handleCustomPaymentError(failure, order.order_id)
      })
      checkout.on('payment.upi.qr', (response) => {
        setQrData(response)
        if (response?.status === 'expired') {
          clearPaymentFallbackTimer()
          paying.current = false
          setIsPaying(false)
        }
      })
    }

    initializeCustomCheckout().catch((error) => {
      if (active.current) {
        setIsInitializingCheckout(false)
        setPaymentError(error instanceof Error ? error.message : 'Custom Checkout could not be initialized.')
      }
    })

    return () => {
      active.current = false
      customCheckout.current = null
    }
  }, [
    bookingReady,
    razorpayConfiguredForBooking,
    bookingHasReference,
    bookingPaymentStatus,
    paymentUncertain,
    requestId,
    retryingPayment,
    checkoutInitRetry,
    checkoutRequested,
  ])

  useEffect(() => {
    if (!qrData?.qr_url) {
      return undefined
    }
    const active = { current: true }
    QRCode.toDataURL(qrData.qr_url, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((image) => {
        if (active.current) setQrImage(image)
      })
      .catch(() => {
        if (active.current) setPaymentError('The UPI QR code could not be generated. Try another payment method.')
      })
    return () => {
      active.current = false
    }
  }, [qrData])

  const whatsappBookingReference = bookingState.booking?.reference
  const whatsappNotificationStatus = bookingState.booking?.whatsappNotification?.status

  useEffect(() => {
    if (
      !whatsappBookingReference ||
      !['pending', 'sent'].includes(whatsappNotificationStatus)
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
        // Silent refresh until next cycle
      }
    }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [whatsappBookingReference, whatsappNotificationStatus, requestId])

  function handleCustomPayment(event) {
    event.preventDefault()
    if (paying.current || paymentUncertain || !razorpayOrder || !customCheckout.current) {
      return
    }

    const booking = bookingState.booking
    const form = event.currentTarget
    const fields = new FormData(form)
    const receiptEmail = String(fields.get('paymentEmail') ?? booking?.email ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) {
      setPaymentError('Enter a valid email address for your payment receipt.')
      return
    }
    const paymentData = {
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      order_id: razorpayOrder.order_id,
      email: receiptEmail,
      contact: (booking?.mobile ?? '').replace(/\D/g, '').slice(-10),
      notes: {
        booking_request_id: requestId,
        booking_category: booking?.category || booking?.event || 'Event Booking',
      },
    }
    let paymentOptions
    const isCardMethod = ['credit_card', 'debit_card'].includes(selectedMethod)

    if (isCardMethod) {
      const cardholderName = String(fields.get('cardholderName') ?? '').trim()
      const cardNumber = String(fields.get('cardNumber') ?? '').replace(/\D/g, '')
      const expiryMonth = String(fields.get('expiryMonth') ?? '')
      const expiryYear = String(fields.get('expiryYear') ?? '')
      const cvv = String(fields.get('cvv') ?? '').trim()
      const fullYear = Number(`20${expiryYear}`)
      const monthNumber = Number(expiryMonth)
      const now = new Date()
      if (
        !cardholderName || cardNumber.length < 12 || cardNumber.length > 19 ||
        !/^\d{3,4}$/.test(cvv) || monthNumber < 1 || monthNumber > 12 ||
        fullYear < now.getFullYear() ||
        (fullYear === now.getFullYear() && monthNumber <= now.getMonth() + 1)
      ) {
        setPaymentError('Check the cardholder name, card number, expiry and CVV.')
        return
      }
      paymentData.method = 'card'
      paymentData['card[name]'] = cardholderName
      paymentData['card[number]'] = cardNumber
      paymentData['card[expiry_month]'] = expiryMonth
      paymentData['card[expiry_year]'] = expiryYear
      paymentData['card[cvv]'] = cvv
    } else if (selectedMethod === 'upi') {
      paymentData.method = 'upi'
      if (isMobileCheckout) {
        paymentOptions = { app: 'any' }
      } else if (customUpiQrEnabled) {
        paymentOptions = { app: 'any', flow: 'qr' }
      } else {
        setPaymentError('UPI QR on desktop requires activation for this Razorpay account. Use UPI on a phone or choose another method.')
        return
      }
    } else if (selectedMethod === 'netbanking') {
      if (!selectedBank) {
        setPaymentError('Choose a bank to continue.')
        return
      }
      paymentData.method = 'netbanking'
      paymentData.bank = selectedBank
    } else if (selectedMethod === 'wallet') {
      if (!selectedWallet) {
        setPaymentError('Choose a supported wallet to continue.')
        return
      }
      paymentData.method = 'wallet'
      paymentData.wallet = selectedWallet
    } else {
      setPaymentError('Choose an available payment method.')
      return
    }

    paying.current = true
    paymentOutcomeHandled.current = false
    setIsPaying(true)
    setPaymentError('')
    setQrData(null)
    setQrImage('')
    clearPaymentFallbackTimer()
    try {
      customCheckout.current.createPayment(paymentData, paymentOptions)
      paymentFallbackTimer.current = window.setTimeout(() => {
        void reconcileUnreportedPayment()
      }, 15000)
    } catch (error) {
      clearPaymentFallbackTimer()
      paying.current = false
      setIsPaying(false)
      setPaymentError(error instanceof Error ? error.message : 'Razorpay could not start this payment.')
    } finally {
      if (isCardMethod) form.reset()
    }
  }

  function handleCancelCustomPayment() {
    const orderId = razorpayOrder?.order_id
    if (!orderId || !paying.current) return
    clearPaymentFallbackTimer()
    try {
      customCheckout.current?.emit('payment.cancel')
    } catch {
      // The server status check below remains authoritative.
    }
    void handleRazorpayFailure({ orderId, outcome: 'cancelled' })
  }

  function handleTryPaymentAgain() {
    setPaymentError('')
    setPaymentUncertain(false)
    setIsInitializingCheckout(true)
    setPaymentMethods(null)
    setRazorpayOrder(null)
    setQrData(null)
    setQrImage('')
    setCheckoutRequested(true)
    navigate(`/booking/payment/${encodeURIComponent(requestId)}?retry=1`, { replace: true })
  }

  function handleCopyReference() {
    if (!booking?.reference) return
    navigator.clipboard?.writeText(booking.reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2400)
  }

  const currentBookingState = bookingState.requestId === requestId
    ? bookingState
    : { status: 'loading', booking: null, error: '' }
  const booking = currentBookingState.booking
  const isPaid = ['demo_paid', 'paid'].includes(booking?.paymentStatus) && Boolean(booking?.reference)
  const hasRazorpayPayment = Boolean(booking?.paymentOrderId) || booking?.paymentProvider === 'razorpay'
  const isUpiPayment = Boolean(booking) && !isPaid && !hasRazorpayPayment && (
    booking.paymentProvider === 'upi' ||
    booking.paymentProviderMode === 'upi' ||
    (
      ['unpaid', 'failed'].includes(booking.paymentStatus) &&
      !booking.paymentProvider
    )
  )
  const isDemoPayment = !booking?.razorpayConfigured && !isUpiPayment
  const isPaymentFailed =
    booking?.paymentStatus === 'failed' &&
    booking?.paymentProvider !== 'upi' &&
    !isUpiPayment
  const isFailureView = isPaymentFailed && !paymentUncertain && searchParams.get('retry') !== '1'
  const isVerifying = paymentUncertain || isRecentProcessing(booking)
  const bookingLabel = booking?.status === 'confirmed' ? 'Approved' : 'Pending Approval'

  // Pricing calculations
  const ticketQuantity = booking?.ticketQuantity ?? 1
  const ticketTypeName = booking?.ticketTypeName || 'General Admission'
  const pricePerTicket = booking?.pricePerTicket ?? booking?.regularPrice ?? 299
  const subtotal = booking?.subtotal ?? (pricePerTicket * ticketQuantity)
  const isDiwali = Boolean(booking?.diwaliOfferApplied)
  const discount = booking?.discount ?? (isDiwali ? Math.max(0, subtotal - (booking?.paymentAmount ?? 249)) : 0)
  const finalPayable = booking?.paymentAmount ?? (isDiwali ? 249 : 299)
  const memberDetails = getBookingMembers(booking)
  const methodOptions = paymentMethods ? [
    { id: 'upi', label: 'UPI', icon: Smartphone, available: paymentMethods.upi },
    { id: 'credit_card', label: 'Credit Card', icon: CreditCard, available: paymentMethods.creditCard },
    { id: 'debit_card', label: 'Debit Card', icon: CreditCard, available: paymentMethods.debitCard },
    { id: 'netbanking', label: 'Net Banking', icon: Landmark, available: paymentMethods.banks.length > 0 },
    { id: 'wallet', label: 'Wallets', icon: WalletCards, available: paymentMethods.wallets.length > 0 },
  ].filter(({ available }) => available) : []

  return (
    <section className="booking-payment">
      <div className="booking-payment__ambient-glow" aria-hidden="true" />
      <div className="booking-payment__ambient-glow-secondary" aria-hidden="true" />

      <div className="booking-payment__container">
        {currentBookingState.status === 'loading' ? (
          <div className="booking-payment__loading-state" role="status">
            <div className="booking-payment__spinner-wrap">
              <LoaderCircle className="booking-payment__spinner" size={36} aria-hidden="true" />
            </div>
            <p className="booking-payment__loading-title">Loading Secure Checkout</p>
            <p className="booking-payment__loading-subtitle">Retrieving your experience booking details…</p>
          </div>
        ) : currentBookingState.status === 'error' ? (
          <div className="booking-payment__error-state" role="alert">
            <div className="booking-payment__error-icon">
              <AlertTriangle size={32} aria-hidden="true" />
            </div>
            <p className="booking-payment__eyebrow">BOOKING ERROR</p>
            <h1>We couldn’t load your enquiry</h1>
            <p className="booking-payment__error-description">{currentBookingState.error}</p>
            <Link className="booking-payment__action-btn booking-payment__action-btn--secondary" to="/booking">
              <ArrowLeft size={16} aria-hidden="true" /> Back to booking
            </Link>
          </div>
        ) : (
          <>
            {/* Top Brand Bar */}
            <header className="booking-payment__topbar">
              <Link className="booking-payment__brand" to="/" aria-label="Back to Vibe Together">
                <img
                  src="/assets/optimized/favicon-256-v1.webp"
                  alt="Vibe Together logo"
                  className="booking-payment__brand-logo"
                />
                <span className="booking-payment__brand-name">VIBE TOGETHER</span>
              </Link>
              <div className="booking-payment__security-pill">
                <span className="booking-payment__security-dot" aria-hidden="true" />
                <ShieldCheck size={14} aria-hidden="true" />
                <span>256-Bit SSL Secured</span>
              </div>
            </header>

            {isPaid ? (
              /* =========================================================================
                 10. ATTRACTIVE ANIMATED SUCCESS SCREEN
                 ========================================================================= */
              <div className="booking-payment__success-view" role="status">
                <div className="booking-payment__success-badge-wrap">
                  <div className="booking-payment__ripple-ring booking-payment__ripple-ring--1" />
                  <div className="booking-payment__ripple-ring booking-payment__ripple-ring--2" />
                  <div className="booking-payment__success-icon">
                    <CheckCircle2 size={44} aria-hidden="true" />
                  </div>
                </div>

                <div className="booking-payment__success-heading">
                  <span className="booking-payment__pill-tag booking-payment__pill-tag--success">
                    {booking.paymentStatus === 'demo_paid' ? 'DEMO PAYMENT VERIFIED' : 'PAYMENT SUCCESSFUL'}
                  </span>
                  <h1>Payment Successful!</h1>
                  <p className="booking-payment__subtitle">
                    {booking.paymentStatus === 'demo_paid'
                      ? 'Your demo payment was recorded successfully. Your booking is registered.'
                      : 'Your payment was securely verified. Your spot is confirmed!'}
                  </p>
                </div>

                {/* VIP Booking Ticket Card */}
                <div className="booking-payment__ticket-card">
                  <div className="booking-payment__ticket-glow" aria-hidden="true" />
                  <div className="booking-payment__ticket-header">
                    <div>
                      <span className="booking-payment__ticket-label">BOOKING REFERENCE</span>
                      <div className="booking-payment__ticket-ref-row">
                        <strong className="booking-payment__ticket-ref">{booking.reference}</strong>
                        <button
                          type="button"
                          className="booking-payment__copy-tag"
                          onClick={handleCopyReference}
                          title="Copy Booking Reference"
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copied ? 'COPIED' : 'COPY'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="booking-payment__ticket-status">
                      <span className="booking-payment__status-chip booking-payment__status-chip--paid">
                        <Check size={13} aria-hidden="true" /> PAID
                      </span>
                      <span className="booking-payment__status-chip booking-payment__status-chip--approval">
                        {bookingLabel}
                      </span>
                    </div>
                  </div>

                  <div className="booking-payment__ticket-divider" aria-hidden="true">
                    <span className="booking-payment__notch booking-payment__notch--left" />
                    <span className="booking-payment__notch-line" />
                    <span className="booking-payment__notch booking-payment__notch--right" />
                  </div>

                  <div className="booking-payment__ticket-body">
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Experience</span>
                      <strong className="booking-payment__meta-value">{booking.category || booking.event || 'Vibe Together'}</strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Ticket Type & Qty</span>
                      <strong className="booking-payment__meta-value">
                        {ticketTypeName} × {ticketQuantity}
                        {(booking.maleCount > 0 || booking.femaleCount > 0) && (
                          <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
                            ({booking.maleCount > 0 ? `${booking.maleCount} Male` : ''}
                            {booking.maleCount > 0 && booking.femaleCount > 0 ? ', ' : ''}
                            {booking.femaleCount > 0 ? `${booking.femaleCount} Female` : ''})
                          </span>
                        )}
                      </strong>
                    </div>
                    {memberDetails.map(({ label, name }) => (
                      <div className="booking-payment__ticket-col" key={label}>
                        <span className="booking-payment__meta-label">{label}</span>
                        <strong className="booking-payment__meta-value">{name || 'Not provided'}</strong>
                      </div>
                    ))}
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Customer Name</span>
                      <strong className="booking-payment__meta-value">{booking.name}</strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Mobile Number</span>
                      <strong className="booking-payment__meta-value">{booking.mobile}</strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Total Amount Paid</span>
                      <strong className="booking-payment__meta-value booking-payment__meta-value--highlight">
                        ₹{booking.paymentAmount}
                      </strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Razorpay Order ID</span>
                      <strong className="booking-payment__meta-value">{booking.paymentOrderId || '—'}</strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Razorpay Payment ID</span>
                      <strong className="booking-payment__meta-value">{booking.razorpayPaymentId || '—'}</strong>
                    </div>
                    <div className="booking-payment__ticket-col">
                      <span className="booking-payment__meta-label">Booking Time</span>
                      <strong className="booking-payment__meta-value">{formatBookingDate(booking.createdAt)}</strong>
                    </div>
                  </div>
                </div>

                {/* Processing notice */}
                <div className="booking-payment__processing-notice">
                  <Sparkles size={16} className="booking-payment__sparkle-icon" aria-hidden="true" />
                  <span>Your confirmation notification is being processed.</span>
                </div>

                <div className="booking-payment__success-actions">
                  <Link className="booking-payment__action-btn booking-payment__action-btn--primary" to="/">
                    <span>Back to Vibe Together</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : isFailureView ? (
              /* =========================================================================
                 11. CLEAR RETRY SCREEN (AFTER FAILURE OR CANCELLATION)
                 ========================================================================= */
              <div className="booking-payment__failure-view" role="alert">
                <div className="booking-payment__failure-badge">
                  <AlertTriangle size={36} aria-hidden="true" />
                </div>

                <div className="booking-payment__failure-heading">
                  <span className="booking-payment__pill-tag booking-payment__pill-tag--warning">
                    PAYMENT INCOMPLETE
                  </span>
                  <h1>Payment Not Completed</h1>
                  <p className="booking-payment__subtitle">
                    Don’t worry! Your booking details and ticket reservation are preserved.
                    You can retry payment right now to finalize your booking.
                  </p>
                </div>

                {/* Preserved Booking Summary Card */}
                <div className="booking-payment__preserved-card">
                  <div className="booking-payment__preserved-header">
                    <span className="booking-payment__meta-label">PRESERVED RESERVATION</span>
                    <strong>{booking.category || booking.event}</strong>
                  </div>
                  <div className="booking-payment__preserved-details">
                    <div>
                      <span>Attendee</span>
                      <strong>{booking.name}</strong>
                    </div>
                    <div>
                      <span>Tickets</span>
                      <strong>{ticketTypeName} × {ticketQuantity}</strong>
                    </div>
                    <div>
                      <span>Amount Due</span>
                      <strong className="booking-payment__preserved-amount">₹{booking.paymentAmount}</strong>
                    </div>
                  </div>
                </div>

                <div className="booking-payment__retry-actions">
                  <button
                    className="booking-payment__pay-btn"
                    onClick={handleTryPaymentAgain}
                    type="button"
                  >
                    <span className="booking-payment__pay-btn-glow" aria-hidden="true" />
                    <span className="booking-payment__pay-btn-content">
                      <RefreshCw size={18} aria-hidden="true" />
                      <span>TRY PAYMENT AGAIN · ₹{booking.paymentAmount}</span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </span>
                  </button>

                  <div className="booking-payment__sub-links">
                    <Link className="booking-payment__text-link" to="/contact">
                      Need help? Contact our support
                    </Link>
                    <Link className="booking-payment__text-link" to="/">
                      Return to homepage
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              /* =========================================================================
                 PRIMARY PAYMENT PAGE (BEFORE PAYMENT)
                 ========================================================================= */
              <div className="booking-payment__checkout-view">
                <div className="booking-payment__hero">
                  <span className="booking-payment__pill-tag">
                    <LockKeyhole size={12} aria-hidden="true" />
                    {isUpiPayment
                      ? 'DIRECT UPI PAYMENT'
                      : isDemoPayment ? 'PAYMENT UNAVAILABLE' : 'OFFICIAL PAYMENT GATEWAY'}
                  </span>
                  <h1>Complete Your Booking</h1>
                  <p className="booking-payment__subtitle">
                    {isUpiPayment
                      ? 'Review your experience reservation and complete your payment securely.'
                      : isDemoPayment
                      ? 'Secure Razorpay Checkout is not configured for this booking. Your details are saved, but payment cannot be taken yet.'
                      : 'Review your experience reservation and complete your payment securely with Razorpay.'}
                  </p>
                </div>

                <div className="booking-payment__content-grid">
                  {/* Left Column: Booking & Attendee Information */}
                  <div className="booking-payment__section-card">
                    <div className="booking-payment__section-header">
                      <div className="booking-payment__section-icon">
                        <Ticket size={18} aria-hidden="true" />
                      </div>
                      <div>
                        <span className="booking-payment__meta-label">EXPERIENCE RESERVATION</span>
                        <h2>{booking.category || booking.event || 'Vibe Together Experience'}</h2>
                      </div>
                    </div>

                    <div className="booking-payment__details-list">
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <Ticket size={14} aria-hidden="true" /> Ticket Type
                        </span>
                        <strong className="booking-payment__detail-val">{ticketTypeName}</strong>
                      </div>
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <Tag size={14} aria-hidden="true" /> Quantity
                        </span>
                        <strong className="booking-payment__detail-val">{ticketQuantity} ticket{ticketQuantity > 1 ? 's' : ''}</strong>
                      </div>
                      {(booking.maleCount > 0 || booking.femaleCount > 0) && (
                        <div className="booking-payment__detail-item">
                          <span className="booking-payment__detail-label">
                            <Users size={14} aria-hidden="true" /> Attendees
                          </span>
                          <strong className="booking-payment__detail-val">
                            {booking.maleCount > 0 ? `${booking.maleCount} Male` : ''}
                            {booking.maleCount > 0 && booking.femaleCount > 0 ? ', ' : ''}
                            {booking.femaleCount > 0 ? `${booking.femaleCount} Female` : ''}
                          </strong>
                        </div>
                      )}
                      {memberDetails.length > 0 && (
                        <div className="booking-payment__detail-item">
                          <span className="booking-payment__detail-label">
                            <Users size={14} aria-hidden="true" /> Member names
                          </span>
                          <div className="booking-payment__detail-val">
                            {memberDetails.map(({ label, name }) => (
                              <div key={label}>{label}: {name || 'Not provided'}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <User size={14} aria-hidden="true" /> Attendee Name
                        </span>
                        <strong className="booking-payment__detail-val">{booking.name}</strong>
                      </div>
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <Phone size={14} aria-hidden="true" /> Mobile Number
                        </span>
                        <strong className="booking-payment__detail-val">{booking.mobile}</strong>
                      </div>
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <Mail size={14} aria-hidden="true" /> Email Address
                        </span>
                        <strong className="booking-payment__detail-val">{booking.email || 'Not provided'}</strong>
                      </div>
                      <div className="booking-payment__detail-item">
                        <span className="booking-payment__detail-label">
                          <Calendar size={14} aria-hidden="true" /> Booking Session
                        </span>
                        <strong className="booking-payment__detail-val">{formatBookingDate(booking.createdAt)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Price Breakdown & Payment Trigger */}
                  <div className="booking-payment__section-card booking-payment__section-card--pricing">
                    <div className="booking-payment__section-header">
                      <div className="booking-payment__section-icon booking-payment__section-icon--pricing">
                        <Sparkles size={18} aria-hidden="true" />
                      </div>
                      <div>
                        <span className="booking-payment__meta-label">ORDER SUMMARY</span>
                        <h2>Price Breakdown</h2>
                      </div>
                    </div>

                    <div className="booking-payment__pricing-breakdown">
                      <div className="booking-payment__price-row">
                        <span>Original Price ({ticketQuantity} × ₹{pricePerTicket})</span>
                        <strong>₹{subtotal}</strong>
                      </div>

                      {isDiwali && (
                        <div className="booking-payment__price-row booking-payment__price-row--discount">
                          <span className="booking-payment__discount-label">
                            <Sparkles size={14} aria-hidden="true" /> Diwali Special Offer
                          </span>
                          <span className="booking-payment__discount-val">−₹{discount}</span>
                        </div>
                      )}

                      {isDiwali && (
                        <div className="booking-payment__savings-badge">
                          <span>🎉 You saved ₹{discount} with Diwali Offer!</span>
                        </div>
                      )}

                      <div className="booking-payment__total-divider" />

                      <div className="booking-payment__total-row">
                        <div>
                          <span className="booking-payment__total-label">FINAL PAYABLE AMOUNT</span>
                          <span className="booking-payment__tax-note">Inclusive of all taxes & entry</span>
                        </div>
                        <div className="booking-payment__total-price-wrap">
                          {isDiwali && <s className="booking-payment__strikethrough">₹{subtotal}</s>}
                          <strong className="booking-payment__total-price">₹{finalPayable}</strong>
                        </div>
                      </div>
                    </div>

                    {paymentError && !isUpiPayment && (
                      <div className="booking-payment__error-box" role="alert">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>{paymentError}</span>
                      </div>
                    )}
                    {isDemoPayment && (
                      <p className="booking-payment__secure-note" role="status">
                        Payments are disabled until Razorpay is configured. No simulated payment will be accepted.
                      </p>
                    )}

                    <div className="booking-payment__action-area">
                      {isUpiPayment ? (
                        <UpiPayment booking={booking} bookingRequestId={requestId} />
                      ) : isVerifying ? (
                        <button
                          className="booking-payment__pay-btn"
                          disabled={isPaying}
                          onClick={() => void refreshPaymentStatus()}
                          type="button"
                        >
                          <span className="booking-payment__pay-btn-glow" aria-hidden="true" />
                          <span className="booking-payment__pay-btn-content">
                            {isPaying ? (
                              <>
                                <LoaderCircle className="booking-payment__spinner" size={20} aria-hidden="true" />
                                <span>Checking Payment Status…</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw size={18} aria-hidden="true" />
                                <span>Check Payment Status</span>
                              </>
                            )}
                          </span>
                        </button>
                      ) : isDemoPayment ? (
                        <div className="booking-payment__custom-unavailable" role="status">
                          <LockKeyhole size={18} aria-hidden="true" />
                          <span>Configure Razorpay on the server to accept secure payments.</span>
                        </div>
                      ) : (
                        <section aria-label="Custom payment options" className="booking-payment__custom-checkout">
                          <div className="booking-payment__custom-heading">
                            <span className="booking-payment__meta-label">PAY SECURELY</span>
                            <h3>Choose a payment method</h3>
                          </div>

                          {!checkoutRequested && (
                            <button
                              className="booking-payment__pay-btn"
                              onClick={() => {
                                setCheckoutRequested(true)
                                setIsInitializingCheckout(true)
                                setPaymentError('')
                              }}
                              type="button"
                            >
                              <span className="booking-payment__pay-btn-glow" aria-hidden="true" />
                              <span className="booking-payment__pay-btn-content">
                                <LockKeyhole size={18} aria-hidden="true" />
                                <span>PAY SECURELY · ₹{finalPayable}</span>
                                <ArrowRight size={18} aria-hidden="true" />
                              </span>
                            </button>
                          )}

                          {checkoutRequested && isInitializingCheckout && (
                            <p className="booking-payment__method-status" role="status">
                              <LoaderCircle className="booking-payment__spinner" size={17} aria-hidden="true" />
                              Loading secure payment methods…
                            </p>
                          )}

                          {!isInitializingCheckout && !paymentMethods && (
                            <button
                              className="booking-payment__method-retry"
                              onClick={() => {
                                setPaymentError('')
                                setCheckoutRequested(true)
                                setIsInitializingCheckout(true)
                                setPaymentMethods(null)
                                setRazorpayOrder(null)
                                setQrData(null)
                                setCheckoutInitRetry((attempt) => attempt + 1)
                              }}
                              type="button"
                            >
                              Retry secure payment setup
                            </button>
                          )}

                          {!isInitializingCheckout && paymentMethods && methodOptions.length === 0 && (
                            <p className="booking-payment__method-status" role="alert">
                              No payment methods are enabled for this Razorpay account.
                            </p>
                          )}

                          {methodOptions.length > 0 && (
                            <>
                              <div aria-label="Payment method" className="booking-payment__method-tabs" role="tablist">
                                {methodOptions.map(({ id, label, icon: MethodIcon }) => (
                                  <button
                                    aria-selected={selectedMethod === id}
                                    className={`booking-payment__method-tab${selectedMethod === id ? ' is-selected' : ''}`}
                                    disabled={isPaying || isInitializingCheckout}
                                    key={id}
                                    onClick={() => {
                                      setSelectedMethod(id)
                                      setPaymentError('')
                                      setQrData(null)
                                      setQrImage('')
                                    }}
                                    role="tab"
                                    type="button"
                                  >
                                    <MethodIcon size={17} aria-hidden="true" />
                                    <span>{label}</span>
                                  </button>
                                ))}
                              </div>

                              <form className="booking-payment__method-form" onSubmit={handleCustomPayment}>
                                {!booking?.email && (
                                  <label className="booking-payment__custom-field">
                                    <span>Email for payment receipt</span>
                                    <input autoComplete="email" disabled={isPaying} maxLength={254} name="paymentEmail" required type="email" />
                                  </label>
                                )}
                                {['credit_card', 'debit_card'].includes(selectedMethod) && (
                                  <div className="booking-payment__card-fields">
                                    <label className="booking-payment__custom-field">
                                      <span>Cardholder name</span>
                                      <input autoComplete="cc-name" disabled={isPaying} maxLength={100} name="cardholderName" required />
                                    </label>
                                    <label className="booking-payment__custom-field">
                                      <span>Card number</span>
                                      <input autoComplete="cc-number" disabled={isPaying} inputMode="numeric" maxLength={23} name="cardNumber" placeholder="1234 5678 9012 3456" required />
                                    </label>
                                    <div className="booking-payment__card-expiry-row">
                                      <label className="booking-payment__custom-field">
                                        <span>Expiry month</span>
                                        <select autoComplete="cc-exp-month" disabled={isPaying} name="expiryMonth" required>
                                          <option value="">MM</option>
                                          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => (
                                            <option key={month} value={month}>{month}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="booking-payment__custom-field">
                                        <span>Expiry year</span>
                                        <select autoComplete="cc-exp-year" disabled={isPaying} name="expiryYear" required>
                                          <option value="">YY</option>
                                          {cardYears.map((year) => <option key={year} value={year}>{year}</option>)}
                                        </select>
                                      </label>
                                      <label className="booking-payment__custom-field">
                                        <span>CVV</span>
                                        <input autoComplete="cc-csc" disabled={isPaying} inputMode="numeric" maxLength={4} name="cvv" type="password" required />
                                      </label>
                                    </div>
                                  </div>
                                )}

                                {selectedMethod === 'upi' && (
                                  <div className="booking-payment__method-explainer">
                                    <Smartphone size={20} aria-hidden="true" />
                                    <p>{isMobileCheckout
                                      ? 'Continue to an available UPI app on this device. The app switch is part of the UPI flow.'
                                      : customUpiQrEnabled
                                        ? 'Generate a UPI QR code here and scan it with a UPI app on your phone.'
                                        : 'Mobile UPI intent is supported. Desktop QR requires Razorpay activation for this account.'}</p>
                                  </div>
                                )}

                                {selectedMethod === 'netbanking' && (
                                  <label className="booking-payment__custom-field">
                                    <span>Select your bank</span>
                                    <select disabled={isPaying} onChange={(event) => setSelectedBank(event.target.value)} value={selectedBank}>
                                      <option value="">Choose a supported bank</option>
                                      {paymentMethods.banks.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                                    </select>
                                  </label>
                                )}

                                {selectedMethod === 'wallet' && (
                                  <label className="booking-payment__custom-field">
                                    <span>Select a supported wallet</span>
                                    <select disabled={isPaying} onChange={(event) => setSelectedWallet(event.target.value)} value={selectedWallet}>
                                      {paymentMethods.wallets.map((wallet) => <option key={wallet} value={wallet}>{wallet.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}
                                    </select>
                                  </label>
                                )}

                                {qrImage && qrData?.status === 'created' && (
                                  <div className="booking-payment__upi-qr" role="status">
                                    <img alt="UPI payment QR code" src={qrImage} />
                                    <span>Scan with any supported UPI app to pay ₹{finalPayable}.</span>
                                  </div>
                                )}
                                {qrData?.status === 'expired' && (
                                  <p className="booking-payment__qr-expired" role="status">
                                    This QR code expired. Generate a new code to continue.
                                  </p>
                                )}

                                <button
                                  className="booking-payment__pay-btn"
                                  disabled={isPaying || isInitializingCheckout || !razorpayOrder || (selectedMethod === 'upi' && !isMobileCheckout && !customUpiQrEnabled)}
                                  type="submit"
                                >
                                  <span className="booking-payment__pay-btn-glow" aria-hidden="true" />
                                  <span className="booking-payment__pay-btn-shine" aria-hidden="true" />
                                  <span className="booking-payment__pay-btn-content">
                                    {isPaying ? (
                                      <>
                                        <LoaderCircle className="booking-payment__spinner" size={20} aria-hidden="true" />
                                        <span>{qrData ? 'Waiting for UPI payment…' : 'Starting secure payment…'}</span>
                                      </>
                                    ) : (
                                      <>
                                        <LockKeyhole size={18} aria-hidden="true" />
                                        <span>{selectedMethod === 'upi' && !isMobileCheckout
                                          ? qrData?.status === 'expired' ? 'GENERATE NEW QR' : 'GENERATE UPI QR'
                                          : `PAY ₹${finalPayable} NOW`}</span>
                                        <ArrowRight size={18} aria-hidden="true" />
                                      </>
                                    )}
                                  </span>
                                </button>
                              </form>

                              {isPaying && (
                                <button className="booking-payment__cancel-custom-payment" onClick={handleCancelCustomPayment} type="button">
                                  Cancel payment
                                </button>
                              )}
                              <p className="booking-payment__custom-security-note">
                                <ShieldCheck size={15} aria-hidden="true" />
                                Card details go directly from this browser to Razorpay and are never sent to or stored by our booking server.
                              </p>
                            </>
                          )}
                        </section>
                      )}
                    </div>
                  </div>
                </div>

                <footer className="booking-payment__footer">
                  <Link className="booking-payment__back-link" to={`/booking/step-4/${encodeURIComponent(requestId)}`}>
                    <ArrowLeft size={15} aria-hidden="true" /> Back to attendee details
                  </Link>
                </footer>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
