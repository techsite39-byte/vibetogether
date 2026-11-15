import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Info,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Ticket,
  User,
  Users,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import UpiPayment from './UpiPayment.jsx'
import {
  checkCashfreePaymentStatus,
  createCashfreeOrder,
  recordCashfreePaymentFailure,
  verifyCashfreePayment,
  checkRazorpayPaymentStatus,
  createRazorpayOrder,
  getBookingEnquiry,
  recordRazorpayPaymentFailure,
  verifyRazorpayPayment,
} from '../services/bookingEnquiryPayment.js'
import './BookingPayment.css'

const paymentAttemptTimeoutMs = 2 * 60 * 1000
const cashfreeScriptUrl = 'https://sdk.cashfree.com/js/v3/cashfree.js'
const razorpayScriptUrl = 'https://checkout.razorpay.com/v1/razorpay.js'
const customUpiQrEnabled = import.meta.env.VITE_RAZORPAY_CUSTOM_UPI_QR_ENABLED === 'true'
const cardYears = Array.from({ length: 16 }, (_, index) => String((new Date().getFullYear() + index) % 100).padStart(2, '0'))
const mobileViewportQuery = '(max-width: 768px)'

const cashfreePaymentCategories = [
  {
    id: 'upi',
    name: 'UPI / Instant QR',
    subtitle: 'Google Pay · PhonePe · Paytm · CRED · Any UPI App',
    badge: 'FASTEST · 0% FEE',
    desc: 'Pay directly using your favorite UPI app or scan the instant dynamic QR code inside the Cashfree modal.',
    icon: Smartphone,
  },
  {
    id: 'card',
    name: 'Credit & Debit Cards',
    subtitle: 'Visa · MasterCard · RuPay · Maestro · Diners',
    badge: 'ALL CARDS',
    desc: 'All major Indian and International cards supported with 256-bit bank-grade encryption.',
    icon: CreditCard,
  },
  {
    id: 'netbanking',
    name: 'Net Banking',
    subtitle: 'HDFC, ICICI, SBI, Axis, Kotak & 50+ Banks',
    badge: 'DIRECT TRANSFER',
    desc: 'Instant and secure direct bank account debit through all verified Indian banks.',
    icon: Landmark,
  },
  {
    id: 'wallet',
    name: 'Digital Wallets',
    subtitle: 'Mobikwik · Freecharge · Airtel Money',
    badge: 'ONE-TAP',
    desc: 'Quick one-tap checkout using your connected digital wallet balance.',
    icon: WalletCards,
  },
]

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

function loadCashfreeSdk() {
  if (typeof window.Cashfree === 'function') {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${cashfreeScriptUrl}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(typeof window.Cashfree === 'function'), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = cashfreeScriptUrl
    script.async = true
    script.onload = () => resolve(typeof window.Cashfree === 'function')
    script.onerror = () => resolve(false)
    document.head.append(script)
  })
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
  const orderIdFromUrl = searchParams.get('order_id')

  const [bookingState, setBookingState] = useState({
    requestId,
    status: 'loading',
    booking: null,
    error: '',
  })
  const [isPaying, setIsPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [modalDismissNotice, setModalDismissNotice] = useState('')
  const [paymentUncertain, setPaymentUncertain] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ticketQrUrl, setTicketQrUrl] = useState('')
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState('upi')

  // Razorpay fallback state (preserved for backward compatibility)
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
  const activeProvider = bookingState.booking?.paymentProviderMode || bookingState.booking?.paymentProvider || 'cashfree'
  const isCashfreeActive = activeProvider === 'cashfree'
  const cashfreeConfiguredForBooking = Boolean(bookingState.booking?.cashfreeConfigured)
  const razorpayConfiguredForBooking = Boolean(bookingState.booking?.razorpayConfigured)

  // Preload Cashfree SDK immediately on mount so modal triggers synchronously on click
  useEffect(() => {
    void loadCashfreeSdk()
  }, [])

  async function refreshPaymentStatus() {
    setPaymentError('')
    try {
      let booking = await getBookingEnquiry(requestId)
      if (booking.paymentStatus !== 'paid') {
        if (isCashfreeActive || booking.cfOrderId || booking.cfPaymentSessionId) {
          try {
            const status = await checkCashfreePaymentStatus(requestId)
            booking = status.booking
          } catch {
            // Keep current booking if status query fails
          }
        } else if (booking.razorpayConfigured && booking.paymentOrderId) {
          try {
            const status = await checkRazorpayPaymentStatus(requestId)
            booking = status.booking
          } catch {
            // Keep current booking if status query fails
          }
        }
      }
      setBookingState({ requestId, status: 'ready', booking, error: '' })
      setPaymentUncertain(isRecentProcessing(booking))
      return booking
    } catch (error) {
      setPaymentUncertain(true)
      setPaymentError(
        error instanceof Error
          ? error.message
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

  // Initial booking fetch
  useEffect(() => {
    const controller = new AbortController()
    getBookingEnquiry(requestId, controller.signal)
      .then(async (initialBooking) => {
        let booking = initialBooking
        let statusCheckFailed = false

        // Check if returning with order_id in URL params
        if (orderIdFromUrl && booking.paymentStatus !== 'paid') {
          try {
            const verifyResult = await verifyCashfreePayment(requestId, { order_id: orderIdFromUrl })
            booking = verifyResult.booking
          } catch {
            statusCheckFailed = true
          }
        } else if (booking.paymentStatus !== 'paid') {
          if (
            (booking.paymentProviderMode === 'cashfree' || booking.paymentProvider === 'cashfree') &&
            (booking.cfOrderId || booking.paymentOrderId)
          ) {
            try {
              const result = await checkCashfreePaymentStatus(requestId)
              booking = result.booking
            } catch {
              statusCheckFailed = true
            }
          } else if (booking.razorpayConfigured && booking.paymentOrderId) {
            try {
              const result = await checkRazorpayPaymentStatus(requestId)
              booking = result.booking
            } catch {
              statusCheckFailed = true
            }
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
  }, [requestId, orderIdFromUrl])

  // Real-time WhatsApp Notification polling
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

  // Automatically refresh status if user switches back to tab (e.g. after UPI app handoff on mobile)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && bookingState.booking?.paymentStatus !== 'paid') {
        void refreshPaymentStatus()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [bookingState.booking?.paymentStatus, requestId])

  // Generate QR Code for verified ticket reference
  useEffect(() => {
    if (bookingState.booking?.reference) {
      QRCode.toDataURL(bookingState.booking.reference, {
        margin: 1,
        width: 180,
        color: {
          dark: '#16092e',
          light: '#ffffff',
        },
      })
        .then(setTicketQrUrl)
        .catch(() => setTicketQrUrl(''))
    }
  }, [bookingState.booking?.reference])

  // =========================================================================
  // CASHFREE MODAL PAYMENT HANDLER (ACTIVE / DEFAULT)
  // =========================================================================

  async function handleCashfreePay() {
    if (paying.current || isPaying || paymentUncertain) return
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    setModalDismissNotice('')

    try {
      const sdkLoaded = await loadCashfreeSdk()
      if (!sdkLoaded || typeof window.Cashfree !== 'function') {
        throw new Error('Payment gateway could not be loaded. Please check your internet connection.')
      }

      // Cashfree strictly requires return_url to be HTTPS. If running on plain http (e.g. localhost),
      // pass empty string so backend generates the valid HTTPS URL using FRONTEND_URL.
      const returnUrl = window.location.protocol === 'https:'
        ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
        : ''
      const order = await createCashfreeOrder(requestId, returnUrl)

      if (order.alreadyPaid) {
        setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
        return
      }

      setBookingState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          paymentAmount: order.amount,
          paymentAmountPaise: Math.round(order.amount * 100),
          ...(order.pricing ?? {}),
        },
      }))

      // Instantiate Cashfree SDK
      const cashfree = window.Cashfree({
        mode: order.environment === 'production' ? 'production' : 'sandbox',
      })

      // Open Cashfree in embedded modal mode (never redirects away from VibeTogether)
      const checkoutResult = await cashfree.checkout({
        paymentSessionId: order.payment_session_id,
        redirectTarget: '_modal',
      })

      // When modal closes or completes, verify payment status with our backend
      const verifyResult = await verifyCashfreePayment(requestId, { order_id: order.order_id })
      setBookingState({ requestId, status: 'ready', booking: verifyResult.booking, error: '' })

      if (verifyResult.booking?.paymentStatus !== 'paid') {
        if (checkoutResult?.error) {
          const isDismissed = checkoutResult.error.code === 'USER_DROPPED'
          const outcome = isDismissed ? 'cancelled' : 'failed'
          await recordCashfreePaymentFailure(requestId, {
            orderId: order.order_id,
            outcome,
            reason: checkoutResult.error.message,
          }).catch(() => {})

          if (isDismissed) {
            setModalDismissNotice('Checkout modal was closed. Your reservation is still held. Click Pay Now below to complete payment.')
            setPaymentError('')
          } else {
            setPaymentError(
              checkoutResult.error.message || 'Payment was not completed. You can try again whenever you are ready.',
            )
          }
        }
      }
    } catch (error) {
      console.error('[Payment Error]', error)
      setPaymentError(error instanceof Error ? error.message : 'Payment could not be started. Please try again.')
      void refreshPaymentStatus()
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  // =========================================================================
  // PRESERVED RAZORPAY HANDLERS (BACKWARD COMPATIBILITY / FALLBACK)
  // =========================================================================

  async function reconcileUnreportedRazorpayPayment() {
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
        setPaymentError('Payment is still processing. Check status before retrying.')
      }
    } catch {
      setPaymentUncertain(true)
      setPaymentError('Payment confirmation is pending. Check status before retrying.')
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleRazorpayFailure(failure) {
    if (paymentOutcomeHandled.current) return
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
    setPaymentError(error?.description || 'Payment could not be started. Try another method.')
  })

  // Initialize Razorpay custom checkout only if explicitly active
  useEffect(() => {
    if (
      isCashfreeActive ||
      bookingReady !== 'ready' ||
      !checkoutRequested ||
      !razorpayConfiguredForBooking ||
      bookingHasReference ||
      ['paid', 'demo_paid'].includes(bookingPaymentStatus) ||
      paymentUncertain
    ) {
      return undefined
    }

    let active = true
    const controller = new AbortController()

    async function initializeCheckout() {
      setIsInitializingCheckout(true)
      setPaymentError('')
      try {
        const loaded = await loadRazorpayCheckout()
        if (!active) return
        if (!loaded) {
          throw new Error('Razorpay Checkout could not be loaded. Please check your internet connection.')
        }

        const order = await createRazorpayOrder(requestId, controller.signal)
        if (!active) return
        if (order.alreadyPaid) {
          setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
          return
        }

        setRazorpayOrder(order)
        setBookingState((current) => ({
          ...current,
          booking: {
            ...current.booking,
            paymentAmount: order.amount,
            paymentAmountPaise: order.amountPaise,
            ...(order.pricing ?? {}),
          },
        }))

        const checkout = new window.Razorpay({
          key: order.key,
          order_id: order.id,
          modal: {
            ondismiss: () => {
              void reconcileUnreportedRazorpayPayment()
            },
          },
        })

        if (!active) return
        customCheckout.current = checkout
        checkout.on('payment.success', (payment) => {
          void handleCustomPaymentSuccess(payment)
        })
        checkout.on('payment.error', (failure) => {
          void handleCustomPaymentError(failure, order.id)
        })

        const methods = await new Promise((resolve) => {
          try {
            checkout.once('ready', (response) => {
              resolve(response?.methods ?? {})
            })
          } catch {
            resolve({})
          }
          setTimeout(() => resolve({}), 4000)
        })

        if (!active) return
        const available = getAvailablePaymentMethods(methods)
        setPaymentMethods(available)
        setSelectedMethod(
          available.upi
            ? 'upi'
            : available.creditCard || available.debitCard
            ? 'card'
            : available.banks.length > 0
            ? 'netbanking'
            : available.wallets.length > 0
            ? 'wallet'
            : '',
        )
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        console.error('Razorpay custom checkout initialization failed.', error)
        setPaymentError(
          error instanceof Error
            ? error.message
            : 'Payment options could not be loaded. Please try again.',
        )
      } finally {
        if (active) setIsInitializingCheckout(false)
      }
    }

    void initializeCheckout()

    return () => {
      active = false
      customCheckout.current = null
      controller.abort()
    }
  }, [
    isCashfreeActive,
    bookingReady,
    razorpayConfiguredForBooking,
    bookingHasReference,
    bookingPaymentStatus,
    paymentUncertain,
    checkoutRequested,
    checkoutInitRetry,
    requestId,
  ])

  function handleTryPaymentAgain() {
    setPaymentError('')
    setModalDismissNotice('')
    setPaymentUncertain(false)
    navigate(`/booking/payment/${encodeURIComponent(requestId)}?retry=1`, { replace: true })
    if (isCashfreeActive) {
      setTimeout(() => {
        void handleCashfreePay()
      }, 100)
    } else {
      setIsInitializingCheckout(true)
      setCheckoutRequested(true)
      setPaymentMethods(null)
      setRazorpayOrder(null)
      setQrData(null)
      setCheckoutInitRetry((attempt) => attempt + 1)
    }
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
  const isUpiPayment = Boolean(booking) && !isPaid && (
    booking.paymentProvider === 'upi' ||
    booking.paymentProviderMode === 'upi'
  )
  const isGatewayConfigured = isCashfreeActive ? cashfreeConfiguredForBooking : razorpayConfiguredForBooking
  const isDemoPayment = !isGatewayConfigured && !isUpiPayment
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

  return (
    <main className="booking-payment">
      {/* Cinematic ambient background glow accents */}
      <div className="booking-payment__glow-orb booking-payment__glow-orb--top" aria-hidden="true" />
      <div className="booking-payment__glow-orb booking-payment__glow-orb--bottom" aria-hidden="true" />

      <div className="booking-payment__container">
        {/* =========================================================================
           TOP LUXURY BRAND & PROGRESS HEADER
           ========================================================================= */}
        <header className="booking-payment__header">
          <div className="booking-payment__header-top">
            <Link className="booking-payment__brand" to="/" aria-label="Back to Vibe Together">
              <div className="booking-payment__brand-logo-wrap">
                <img
                  src="/assets/optimized/favicon-256-v1.webp"
                  alt="Vibe Together logo"
                  className="booking-payment__brand-logo"
                  width="44"
                  height="44"
                />
                <div className="booking-payment__brand-logo-glow" aria-hidden="true" />
              </div>
              <div className="booking-payment__brand-copy">
                <span className="booking-payment__brand-name">VIBE TOGETHER</span>
                <span className="booking-payment__brand-tagline">Different People. One Vibe.</span>
              </div>
            </Link>

            <div className="booking-payment__header-trust">
              <div className="booking-payment__trust-pill" title="Protected by 256-Bit SSL Encryption">
                <span className="booking-payment__pulse-beacon" aria-hidden="true" />
                <ShieldCheck size={14} aria-hidden="true" />
                <span>256-Bit SSL Secured</span>
              </div>
            </div>
          </div>

          {/* Cinematic 5-step booking progress tracker */}
          <nav className="booking-payment__stepper" aria-label="Booking steps">
            <ol className="booking-payment__stepper-list">
              <li className="booking-payment__step is-done">
                <span className="booking-payment__step-circle"><Check size={12} aria-hidden="true" /></span>
                <span className="booking-payment__step-label">01 Details</span>
              </li>
              <li className="booking-payment__step-divider is-done" aria-hidden="true" />
              <li className="booking-payment__step is-done">
                <span className="booking-payment__step-circle"><Check size={12} aria-hidden="true" /></span>
                <span className="booking-payment__step-label">02 Contact</span>
              </li>
              <li className="booking-payment__step-divider is-done" aria-hidden="true" />
              <li className="booking-payment__step is-done">
                <span className="booking-payment__step-circle"><Check size={12} aria-hidden="true" /></span>
                <span className="booking-payment__step-label">03 Category</span>
              </li>
              <li className="booking-payment__step-divider is-done" aria-hidden="true" />
              <li className="booking-payment__step is-done">
                <span className="booking-payment__step-circle"><Check size={12} aria-hidden="true" /></span>
                <span className="booking-payment__step-label">04 Attendees</span>
              </li>
              <li className="booking-payment__step-divider is-active" aria-hidden="true" />
              <li className="booking-payment__step is-active" aria-current="step">
                <span className="booking-payment__step-circle">05</span>
                <span className="booking-payment__step-label">Payment</span>
              </li>
            </ol>
            <div className="booking-payment__stepper-compact-badge" aria-hidden="true">
              <span className="booking-payment__compact-step-tag">STEP 05 OF 05</span>
              <span className="booking-payment__compact-step-desc">Final Payment Confirmation</span>
            </div>
          </nav>
        </header>

        {/* =========================================================================
           PAGE STATES: LOADING / ERROR / SUCCESS / FAILURE / CHECKOUT
           ========================================================================= */}
        {currentBookingState.status === 'loading' ? (
          <div className="booking-payment__state-card booking-payment__state-card--loading" role="status">
            <div className="booking-payment__radar-pulse">
              <span className="booking-payment__radar-ring booking-payment__radar-ring--1" />
              <span className="booking-payment__radar-ring booking-payment__radar-ring--2" />
              <LoaderCircle className="booking-payment__spinner-icon" size={38} aria-hidden="true" />
            </div>
            <h1 className="booking-payment__state-title">Retrieving Booking Dossier</h1>
            <p className="booking-payment__state-desc">Connecting to secure reservation ledger…</p>
          </div>
        ) : currentBookingState.status === 'error' ? (
          <div className="booking-payment__state-card booking-payment__state-card--error" role="alert">
            <div className="booking-payment__error-beacon">
              <AlertTriangle size={36} aria-hidden="true" />
            </div>
            <span className="booking-payment__badge-pill booking-payment__badge-pill--danger">
              RESERVATION ERROR
            </span>
            <h1 className="booking-payment__state-title">We couldn’t load your booking</h1>
            <p className="booking-payment__state-desc">{currentBookingState.error}</p>
            <Link className="booking-payment__btn booking-payment__btn--secondary" to="/booking">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Return to Experience Booking</span>
            </Link>
          </div>
        ) : isPaid ? (
          /* =========================================================================
             LUXURY VIP SUCCESS STATE
             ========================================================================= */
          <div className="booking-payment__success-screen" role="status">
            <div className="booking-payment__celebration-badge">
              <span className="booking-payment__celebration-halo" />
              <div className="booking-payment__celebration-icon">
                <CheckCircle2 size={46} aria-hidden="true" />
              </div>
            </div>

            <div className="booking-payment__success-intro">
              <span className="booking-payment__badge-pill booking-payment__badge-pill--success">
                {booking.paymentStatus === 'demo_paid' ? 'DEMO PAYMENT VERIFIED' : 'PAYMENT SUCCESSFUL · SPOT SECURED'}
              </span>
              <h1 className="booking-payment__success-title">You’re In! Reservation Confirmed</h1>
              <p className="booking-payment__success-subtitle">
                Your spot for <strong>{booking.category || booking.event || 'Vibe Together'}</strong> is officially reserved.
                A confirmation has been dispatched to your WhatsApp &amp; Email.
              </p>
            </div>

            {/* VIP Golden Cutout Ticket Pass */}
            <div className="booking-payment__ticket-pass">
              <div className="booking-payment__ticket-pass-glow" aria-hidden="true" />

              <div className="booking-payment__ticket-pass-head">
                <div>
                  <span className="booking-payment__ticket-pass-label">OFFICIAL BOOKING REFERENCE</span>
                  <div className="booking-payment__ticket-ref-group">
                    <strong className="booking-payment__ticket-ref-code">{booking.reference}</strong>
                    <button
                      type="button"
                      className="booking-payment__copy-badge-btn"
                      onClick={handleCopyReference}
                      title="Copy Reference Code"
                    >
                      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                      <span>{copied ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                </div>

                <div className="booking-payment__ticket-pass-statuses">
                  <span className="booking-payment__status-pill booking-payment__status-pill--paid">
                    <Check size={12} aria-hidden="true" /> PAID
                  </span>
                  <span className="booking-payment__status-pill booking-payment__status-pill--approval">
                    {bookingLabel}
                  </span>
                </div>
              </div>

              {/* Ticket Notched Cutout Divider */}
              <div className="booking-payment__ticket-divider" aria-hidden="true">
                <span className="booking-payment__ticket-notch booking-payment__ticket-notch--left" />
                <span className="booking-payment__ticket-perforation" />
                <span className="booking-payment__ticket-notch booking-payment__ticket-notch--right" />
              </div>

              {/* Ticket Details & QR Pass */}
              <div className="booking-payment__ticket-pass-body">
                <div className="booking-payment__ticket-grid">
                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Experience</span>
                    <strong className="booking-payment__ticket-cell-val">
                      {booking.category || booking.event || 'Vibe Together Experience'}
                    </strong>
                  </div>

                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Ticket Category &amp; Qty</span>
                    <strong className="booking-payment__ticket-cell-val">
                      {ticketTypeName} × {ticketQuantity}
                      {(booking.maleCount > 0 || booking.femaleCount > 0) && (
                        <span className="booking-payment__ticket-subval">
                          ({booking.maleCount > 0 ? `${booking.maleCount} Male` : ''}
                          {booking.maleCount > 0 && booking.femaleCount > 0 ? ', ' : ''}
                          {booking.femaleCount > 0 ? `${booking.femaleCount} Female` : ''})
                        </span>
                      )}
                    </strong>
                  </div>

                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Attendee Name</span>
                    <strong className="booking-payment__ticket-cell-val">{booking.name}</strong>
                  </div>

                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Mobile Number</span>
                    <strong className="booking-payment__ticket-cell-val">{booking.mobile}</strong>
                  </div>

                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Amount Paid</span>
                    <strong className="booking-payment__ticket-cell-val booking-payment__ticket-cell-val--gold">
                      ₹{booking.paymentAmount}
                    </strong>
                  </div>

                  <div className="booking-payment__ticket-cell">
                    <span className="booking-payment__ticket-cell-label">Transaction Reference</span>
                    <strong className="booking-payment__ticket-cell-val">
                      {booking.cfPaymentId || booking.cfOrderId || booking.paymentOrderId || 'Verified Online'}
                    </strong>
                  </div>

                  {memberDetails.length > 0 && (
                    <div className="booking-payment__ticket-cell booking-payment__ticket-cell--full">
                      <span className="booking-payment__ticket-cell-label">Registered Members</span>
                      <div className="booking-payment__ticket-member-tags">
                        {memberDetails.map(({ label, name }) => (
                          <span className="booking-payment__ticket-member-tag" key={label}>
                            {label}: <strong>{name || 'Guest'}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="booking-payment__ticket-cell booking-payment__ticket-cell--full">
                    <span className="booking-payment__ticket-cell-label">Booking Session</span>
                    <strong className="booking-payment__ticket-cell-val">{formatBookingDate(booking.createdAt)}</strong>
                  </div>
                </div>

                {/* QR Code Pass Preview */}
                {ticketQrUrl && (
                  <div className="booking-payment__ticket-qr-side">
                    <div className="booking-payment__qr-frame">
                      <img src={ticketQrUrl} alt="E-Ticket QR Code" className="booking-payment__qr-img" width="130" height="130" />
                    </div>
                    <span className="booking-payment__qr-caption">Scan at Door Check-in</span>
                  </div>
                )}
              </div>
            </div>

            <div className="booking-payment__success-actions">
              <Link className="booking-payment__btn booking-payment__btn--primary" to={`/booking/confirmation/${encodeURIComponent(booking.reference)}`}>
                <Ticket size={18} aria-hidden="true" />
                <span>View Full Ticket &amp; Confirmation</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="booking-payment__btn booking-payment__btn--ghost" to="/">
                <span>Back to Homepage</span>
              </Link>
            </div>
          </div>
        ) : isFailureView ? (
          /* =========================================================================
             LUXURY FAILURE & RECOVERY STATE
             ========================================================================= */
          <div className="booking-payment__state-card booking-payment__state-card--failure" role="alert">
            <div className="booking-payment__failure-beacon">
              <AlertTriangle size={36} aria-hidden="true" />
            </div>
            <span className="booking-payment__badge-pill booking-payment__badge-pill--warning">
              TRANSACTION INCOMPLETE
            </span>
            <h1 className="booking-payment__state-title">Payment Not Completed</h1>
            <p className="booking-payment__state-desc">
              Your payment session ended before confirmation. Your experience reservation and attendee details
              are securely held in our system. You can retry immediately.
            </p>

            <div className="booking-payment__held-summary">
              <div className="booking-payment__held-row">
                <span>Reserved Experience:</span>
                <strong>{booking.category || booking.event}</strong>
              </div>
              <div className="booking-payment__held-row">
                <span>Passes:</span>
                <strong>{ticketTypeName} × {ticketQuantity}</strong>
              </div>
              <div className="booking-payment__held-row">
                <span>Payable Amount:</span>
                <strong className="booking-payment__held-amount">₹{booking.paymentAmount}</strong>
              </div>
            </div>

            <div className="booking-payment__failure-cta-wrap">
              <button
                type="button"
                className="booking-payment__btn booking-payment__btn--primary booking-payment__btn--pulse"
                onClick={handleTryPaymentAgain}
              >
                <RefreshCw size={18} aria-hidden="true" />
                <span>TRY PAYMENT AGAIN · ₹{booking.paymentAmount}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <div className="booking-payment__failure-sublinks">
                <Link className="booking-payment__link-inline" to="/contact">Need assistance? Reach our team</Link>
                <Link className="booking-payment__link-inline" to="/">Return to home</Link>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             STEP 5: LUXURY TWO-COLUMN PAYMENT PAGE (CINEMATIC)
             ========================================================================= */
          <div className="booking-payment__checkout-shell">
            {/* Headline Banner */}
            <div className="booking-payment__hero-intro">
              <div className="booking-payment__hero-badge">
                <Sparkles size={13} aria-hidden="true" />
                <span>CONFIRMED RESERVATION · FINAL STEP</span>
              </div>
              <h1 className="booking-payment__hero-title">Complete Your Booking</h1>
              <p className="booking-payment__hero-subtitle">
                Review your experience dossier below and complete payment via Cashfree’s secure checkout modal.
              </p>
            </div>

            {/* Main Two-Column Layout */}
            <div className="booking-payment__layout">
              {/* ===================================================================
                 LEFT COLUMN: EXPERIENCE RESERVATION DOSSIER
                 =================================================================== */}
              <section className="booking-payment__card booking-payment__dossier" aria-labelledby="dossier-heading">
                <div className="booking-payment__card-header">
                  <span className="booking-payment__meta-badge">EXPERIENCE DOSSIER</span>
                  <h2 id="dossier-heading" className="booking-payment__experience-title">
                    {booking.category || booking.event || 'Vibe Together Experience'}
                  </h2>
                  <p className="booking-payment__experience-tagline">
                    {booking.category?.toLowerCase().includes('sing')
                      ? 'The room becomes the chorus. An evening where every voice finds its place in the song.'
                      : 'An intimate, high-energy gathering celebrating music, connection, and shared rhythm.'}
                  </p>
                </div>

                <div className="booking-payment__dossier-body">
                  <div className="booking-payment__dossier-grid">
                    <div className="booking-payment__info-tile">
                      <span className="booking-payment__tile-label">
                        <Ticket size={13} aria-hidden="true" /> Ticket Category
                      </span>
                      <strong className="booking-payment__tile-val">
                        {ticketTypeName}
                        <span className="booking-payment__qty-pill">{ticketQuantity} {ticketQuantity > 1 ? 'Tickets' : 'Ticket'}</span>
                      </strong>
                    </div>

                    <div className="booking-payment__info-tile">
                      <span className="booking-payment__tile-label">
                        <Users size={13} aria-hidden="true" /> Total Attendees
                      </span>
                      <strong className="booking-payment__tile-val">
                        {ticketQuantity} {ticketQuantity > 1 ? 'Guests' : 'Guest'}
                        {(booking.maleCount > 0 || booking.femaleCount > 0) && (
                          <span className="booking-payment__gender-sub">
                            ({booking.maleCount > 0 ? `${booking.maleCount} Male` : ''}
                            {booking.maleCount > 0 && booking.femaleCount > 0 ? ' · ' : ''}
                            {booking.femaleCount > 0 ? `${booking.femaleCount} Female` : ''})
                          </span>
                        )}
                      </strong>
                    </div>

                    {memberDetails.length > 0 && (
                      <div className="booking-payment__info-tile booking-payment__info-tile--full">
                        <span className="booking-payment__tile-label">
                          <User size={13} aria-hidden="true" /> Registered Member Names
                        </span>
                        <div className="booking-payment__guest-chips">
                          {memberDetails.map(({ label, name }) => (
                            <span className="booking-payment__guest-chip" key={label}>
                              <span className="booking-payment__guest-chip-label">{label}:</span>
                              <strong className="booking-payment__guest-chip-name">{name || 'Guest'}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="booking-payment__info-tile">
                      <span className="booking-payment__tile-label">
                        <User size={13} aria-hidden="true" /> Primary Contact
                      </span>
                      <strong className="booking-payment__tile-val">{booking.name}</strong>
                    </div>

                    <div className="booking-payment__info-tile">
                      <span className="booking-payment__tile-label">
                        <Phone size={13} aria-hidden="true" /> Mobile Number
                      </span>
                      <strong className="booking-payment__tile-val">{booking.mobile}</strong>
                    </div>

                    {booking.email && (
                      <div className="booking-payment__info-tile booking-payment__info-tile--full">
                        <span className="booking-payment__tile-label">
                          <Mail size={13} aria-hidden="true" /> Email Address
                        </span>
                        <strong className="booking-payment__tile-val">{booking.email}</strong>
                      </div>
                    )}

                    <div className="booking-payment__info-tile booking-payment__info-tile--full">
                      <span className="booking-payment__tile-label">
                        <Calendar size={13} aria-hidden="true" /> Reservation Session
                      </span>
                      <strong className="booking-payment__tile-val">
                        {formatBookingDate(booking.createdAt)}
                      </strong>
                    </div>
                  </div>

                  {/* VIP Door Privileges */}
                  <div className="booking-payment__privileges-box">
                    <div className="booking-payment__privilege-row">
                      <Check size={14} className="booking-payment__privilege-check" aria-hidden="true" />
                      <span>Priority Door Entry with instant digital QR pass</span>
                    </div>
                    <div className="booking-payment__privilege-row">
                      <Check size={14} className="booking-payment__privilege-check" aria-hidden="true" />
                      <span>Instant WhatsApp &amp; Email booking receipt confirmation</span>
                    </div>
                    <div className="booking-payment__privilege-row">
                      <Check size={14} className="booking-payment__privilege-check" aria-hidden="true" />
                      <span>100% refund guarantee if the event is rescheduled</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* ===================================================================
                 RIGHT COLUMN: PRICE LEDGER & CASHFREE MODAL CHECKOUT
                 =================================================================== */}
              <section className="booking-payment__card booking-payment__checkout-panel" aria-labelledby="payment-heading">
                <div className="booking-payment__card-header">
                  <span className="booking-payment__meta-badge">ORDER SUMMARY</span>
                  <h2 id="payment-heading" className="booking-payment__panel-title">Price Breakdown</h2>
                </div>

                {/* Price Ledger */}
                <div className="booking-payment__pricing-ledger">
                  <div className="booking-payment__ledger-row">
                    <span className="booking-payment__ledger-name">Admission ({ticketQuantity} × ₹{pricePerTicket})</span>
                    <span className="booking-payment__ledger-val">₹{subtotal}</span>
                  </div>

                  {isDiwali && (
                    <div className="booking-payment__ledger-row booking-payment__ledger-row--discount">
                      <span className="booking-payment__discount-tag">
                        <Sparkles size={13} aria-hidden="true" /> Diwali Festive Privilege
                      </span>
                      <span className="booking-payment__discount-amount">−₹{discount}</span>
                    </div>
                  )}

                  <div className="booking-payment__ledger-row">
                    <span className="booking-payment__ledger-name">Taxes &amp; Platform Surcharges</span>
                    <span className="booking-payment__ledger-val booking-payment__ledger-val--waived">₹0 · Waived</span>
                  </div>

                  {isDiwali && (
                    <div className="booking-payment__diwali-savings-banner">
                      <Sparkles size={14} aria-hidden="true" />
                      <span>You save ₹{discount} with Diwali Exclusive Offer!</span>
                    </div>
                  )}

                  <div className="booking-payment__ledger-divider" aria-hidden="true" />

                  <div className="booking-payment__ledger-total-row">
                    <div>
                      <span className="booking-payment__total-caption">TOTAL AMOUNT DUE</span>
                      <span className="booking-payment__total-subcaption">Inclusive of all taxes &amp; entry access</span>
                    </div>
                    <div className="booking-payment__total-digits">
                      {isDiwali && <s className="booking-payment__struck-amount">₹{subtotal}</s>}
                      <strong className="booking-payment__final-amount">₹{finalPayable}</strong>
                    </div>
                  </div>
                </div>

                {/* Modal Dismissed Notice */}
                {modalDismissNotice && (
                  <div className="booking-payment__dismiss-notice" role="status">
                    <Info size={16} aria-hidden="true" />
                    <span>{modalDismissNotice}</span>
                  </div>
                )}

                {/* Payment Error Alert */}
                {paymentError && (
                  <div className="booking-payment__alert-box" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{paymentError}</span>
                  </div>
                )}

                {/* Payment Routing: Cashfree Modal vs UPI vs Razorpay Fallback */}
                {isUpiPayment ? (
                  <UpiPayment booking={booking} bookingRequestId={requestId} />
                ) : isVerifying ? (
                  <div className="booking-payment__verifying-block" role="status">
                    <LoaderCircle className="booking-payment__btn-spinner" size={24} aria-hidden="true" />
                    <p className="booking-payment__verifying-title">Verifying Payment Status…</p>
                    <p className="booking-payment__verifying-desc">
                      Please hold on while we verify your transaction with Cashfree.
                    </p>
                    <button
                      type="button"
                      className="booking-payment__btn booking-payment__btn--secondary"
                      onClick={() => void refreshPaymentStatus()}
                    >
                      <RefreshCw size={15} aria-hidden="true" />
                      <span>Recheck Status</span>
                    </button>
                  </div>
                ) : isDemoPayment ? (
                  <div className="booking-payment__unavailable-block" role="status">
                    <LockKeyhole size={20} aria-hidden="true" />
                    <p>Online checkout is being initialized on the server. Your booking details are safely saved.</p>
                  </div>
                ) : isCashfreeActive ? (
                  /* ===================================================================
                     ACTIVE CASHFREE INTEGRATION: SELECTABLE METHODS + MODAL TRIGGER
                     =================================================================== */
                  <div className="booking-payment__cashfree-module">
                    <div className="booking-payment__methods-header">
                      <span className="booking-payment__methods-heading">SELECT PAYMENT METHOD</span>
                      <span className="booking-payment__methods-note">Cashfree Secure Modal</span>
                    </div>

                    {/* Luxury Selectable Payment Method Cards */}
                    <div className="booking-payment__method-cards" role="radiogroup" aria-label="Available payment methods">
                      {cashfreePaymentCategories.map((cat) => {
                        const isSelected = selectedPaymentCategory === cat.id
                        const CategoryIcon = cat.icon
                        return (
                          <div
                            key={cat.id}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            className={`booking-payment__method-card${isSelected ? ' is-selected' : ''}`}
                            onClick={() => setSelectedPaymentCategory(cat.id)}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault()
                                setSelectedPaymentCategory(cat.id)
                              }
                            }}
                          >
                            <div className="booking-payment__method-card-left">
                              <div className={`booking-payment__method-icon-wrap${isSelected ? ' is-selected' : ''}`}>
                                <CategoryIcon size={18} aria-hidden="true" />
                              </div>
                              <div className="booking-payment__method-info">
                                <div className="booking-payment__method-title-row">
                                  <strong className="booking-payment__method-name">{cat.name}</strong>
                                  {cat.badge && (
                                    <span className={`booking-payment__method-badge${isSelected ? ' is-selected' : ''}`}>
                                      {cat.badge}
                                    </span>
                                  )}
                                </div>
                                <span className="booking-payment__method-sub">{cat.subtitle}</span>
                              </div>
                            </div>
                            <div className="booking-payment__radio-indicator" aria-hidden="true">
                              <span className={`booking-payment__radio-dot${isSelected ? ' is-checked' : ''}`}>
                                {isSelected && <Check size={11} strokeWidth={3} />}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Pay Button Triggering Cashfree Modal */}
                    <div className="booking-payment__cta-wrap">
                      <button
                        type="button"
                        className="booking-payment__primary-pay-btn"
                        disabled={isPaying}
                        onClick={handleCashfreePay}
                      >
                        <span className="booking-payment__btn-glow" aria-hidden="true" />
                        <span className="booking-payment__btn-shimmer" aria-hidden="true" />
                        <span className="booking-payment__btn-content">
                          {isPaying ? (
                            <>
                              <LoaderCircle className="booking-payment__btn-spinner" size={20} aria-hidden="true" />
                              <span>Opening Secure Payment Modal…</span>
                            </>
                          ) : (
                            <>
                              <LockKeyhole size={18} aria-hidden="true" />
                              <span>PAY ₹{finalPayable} NOW</span>
                              <ArrowRight size={18} aria-hidden="true" />
                            </>
                          )}
                        </span>
                      </button>

                      {/* Security Guarantee Badges */}
                      <div className="booking-payment__trust-footer">
                        <div className="booking-payment__trust-item">
                          <ShieldCheck size={14} aria-hidden="true" />
                          <span>PCI-DSS Level 1 Encrypted</span>
                        </div>
                        <div className="booking-payment__trust-item">
                          <LockKeyhole size={14} aria-hidden="true" />
                          <span>No Credentials Stored</span>
                        </div>
                        <div className="booking-payment__trust-item">
                          <Sparkles size={14} aria-hidden="true" />
                          <span>Instant WhatsApp Pass</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ===================================================================
                     PRESERVED RAZORPAY CUSTOM CHECKOUT (FALLBACK IF CONFIGURED)
                     =================================================================== */
                  <section aria-label="Payment options" className="booking-payment__custom-checkout">
                    <div className="booking-payment__custom-heading">
                      <span className="booking-payment__meta-badge">PAY SECURELY</span>
                      <h3>Choose a payment method</h3>
                    </div>

                    {!checkoutRequested && (
                      <button
                        className="booking-payment__primary-pay-btn"
                        onClick={() => {
                          setCheckoutRequested(true)
                          setIsInitializingCheckout(true)
                          setPaymentError('')
                        }}
                        type="button"
                      >
                        <span className="booking-payment__btn-glow" aria-hidden="true" />
                        <span className="booking-payment__btn-content">
                          <LockKeyhole size={18} aria-hidden="true" />
                          <span>PAY SECURELY · ₹{finalPayable}</span>
                          <ArrowRight size={18} aria-hidden="true" />
                        </span>
                      </button>
                    )}

                    {checkoutRequested && isInitializingCheckout && (
                      <p className="booking-payment__method-status" role="status">
                        <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                        Loading secure payment methods…
                      </p>
                    )}
                  </section>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
