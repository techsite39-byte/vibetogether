import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
const mobileViewportQuery = '(max-width: 768px)'

function getDeviceCapabilities() {
  if (typeof navigator === 'undefined') {
    return { isAndroid: false, isIOS: false, isMobile: false }
  }
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isMobile = isAndroid || isIOS || (typeof window !== 'undefined' && window.matchMedia(mobileViewportQuery).matches)
  return { isAndroid, isIOS, isMobile }
}

// All available custom payment methods with platform eligibility
const allCustomPaymentMethods = [
  {
    id: 'upi_qr',
    name: 'UPI / Dynamic QR',
    subtitle: 'Scan QR or Enter UPI ID',
    badge: 'POPULAR · 0% FEE',
    icon: QrCode,
    desc: 'Instant QR code or UPI Collect request powered by Cashfree Elements.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    subtitle: 'One-Tap UPI & QR',
    badge: 'INSTANT',
    icon: Smartphone,
    desc: 'Direct payment via Google Pay app, QR code, or UPI ID.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    subtitle: 'One-Tap UPI & QR',
    badge: 'INSTANT',
    icon: Smartphone,
    desc: 'Direct payment via PhonePe app, QR code, or UPI ID.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'paytm',
    name: 'Paytm',
    subtitle: 'One-Tap UPI & Wallet',
    badge: 'INSTANT',
    icon: Smartphone,
    desc: 'Direct payment via Paytm app, QR code, or Paytm UPI ID.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'card',
    name: 'Credit & Debit Cards',
    subtitle: 'Visa · MasterCard · RuPay · Maestro',
    badge: 'ALL CARDS',
    icon: CreditCard,
    desc: 'Tokenized card processing with Cashfree PCI-DSS Level 1 elements.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'netbanking',
    name: 'Net Banking',
    subtitle: 'HDFC, SBI, ICICI, Axis, Kotak & 50+ Banks',
    badge: 'DIRECT DEBIT',
    icon: Landmark,
    desc: 'Direct bank account debit with high-speed bank routing.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'wallet',
    name: 'Digital Wallets',
    subtitle: 'MobiKwik · Freecharge · Airtel Money',
    badge: 'ONE-CLICK',
    icon: WalletCards,
    desc: 'Fast wallet checkout using your linked digital wallet balance.',
    platforms: ['desktop', 'android', 'ios'],
  },
]

const popularBanks = [
  { code: 'HDFC', name: 'HDFC Bank', short: 'HDFC' },
  { code: 'SBIN', name: 'State Bank of India', short: 'SBI' },
  { code: 'ICIC', name: 'ICICI Bank', short: 'ICICI' },
  { code: 'UTIB', name: 'Axis Bank', short: 'Axis' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', short: 'Kotak' },
  { code: 'PUNB', name: 'Punjab National Bank', short: 'PNB' },
]

const popularWallets = [
  { code: 'mobikwik', name: 'MobiKwik' },
  { code: 'freecharge', name: 'Freecharge' },
  { code: 'airtelmoney', name: 'Airtel Money' },
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
    ['Male', booking?.maleCount ?? (booking?.gender === 'Male' ? booking?.ticketQuantity ?? 1 : 0), booking?.maleMemberNames, booking?.maleMemberMobiles],
    ['Female', booking?.femaleCount ?? (booking?.gender === 'Female' ? booking?.ticketQuantity ?? 1 : 0), booking?.femaleMemberNames, booking?.femaleMemberMobiles],
  ].flatMap(([gender, count, names, mobiles]) => Array.from({ length: count }, (_, index) => ({
    label: `${gender} Member ${index + 1}`,
    name: Array.isArray(names) ? names[index] ?? '' : '',
    mobile: Array.isArray(mobiles) ? mobiles[index] ?? '' : '',
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
  const [paymentUncertain, setPaymentUncertain] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ticketQrUrl, setTicketQrUrl] = useState('')

  // Custom Checkout state
  const [selectedMethod, setSelectedMethod] = useState('upi_qr')
  const [upiSubMode, setUpiSubMode] = useState('qr') // 'qr' | 'collect'
  const [selectedBank, setSelectedBank] = useState('HDFC')
  const [selectedWallet, setSelectedWallet] = useState('mobikwik')
  const [cashfreeOrder, setCashfreeOrder] = useState(null)
  const [isOrderLoading, setIsOrderLoading] = useState(false)
  const [isElementReady, setIsElementReady] = useState(false)
  const [elementLoadError, setElementLoadError] = useState('')
  const [collectNotice, setCollectNotice] = useState('')

  // Active Cashfree instances & elements
  const cashfreeInstanceRef = useRef(null)
  const activeComponentRef = useRef(null)
  const cardElementsRef = useRef({})
  const paying = useRef(false)

  // Device capability detection (Android / iOS / Desktop)
  const device = useMemo(() => getDeviceCapabilities(), [])
  const customPaymentMethods = useMemo(() => {
    return allCustomPaymentMethods.filter((method) => {
      if (device.isAndroid) return method.platforms.includes('android')
      if (device.isIOS) return method.platforms.includes('ios')
      return method.platforms.includes('desktop')
    })
  }, [device])

  // Ensure selected method is supported on current device
  useEffect(() => {
    if (!customPaymentMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(customPaymentMethods[0]?.id || 'upi_qr')
    }
  }, [customPaymentMethods, selectedMethod])

  // Razorpay fallback state (preserved)
  const [paymentMethods, setPaymentMethods] = useState(null)
  const [razorpayOrder, setRazorpayOrder] = useState(null)
  const [isInitializingCheckout, setIsInitializingCheckout] = useState(false)
  const [checkoutRequested, setCheckoutRequested] = useState(false)
  const [checkoutInitRetry, setCheckoutInitRetry] = useState(0)
  const paymentOutcomeHandled = useRef(false)
  const paymentFallbackTimer = useRef(null)
  const customCheckout = useRef(null)

  const isMobileCheckout = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot,
  )

  const bookingReady = bookingState.status
  const bookingPaymentStatus = bookingState.booking?.paymentStatus
  const bookingHasReference = Boolean(bookingState.booking?.reference)
  const activeProvider = bookingState.booking?.paymentProviderMode || bookingState.booking?.paymentProvider || 'cashfree'
  const isCashfreeActive = activeProvider === 'cashfree'
  const cashfreeConfiguredForBooking = Boolean(bookingState.booking?.cashfreeConfigured)
  const razorpayConfiguredForBooking = Boolean(bookingState.booking?.razorpayConfigured)

  // Preload Cashfree SDK immediately on mount
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

  // Initial booking fetch & URL order verification
  useEffect(() => {
    const controller = new AbortController()
    getBookingEnquiry(requestId, controller.signal)
      .then(async (initialBooking) => {
        let booking = initialBooking
        let statusCheckFailed = false

        // Check if returning with order_id in URL params (e.g. from 3DS bank authorization)
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
  // CASHFREE ORDER CREATION FOR CUSTOM CHECKOUT
  // =========================================================================
  useEffect(() => {
    if (
      !isCashfreeActive ||
      bookingState.status !== 'ready' ||
      !bookingState.booking ||
      ['paid', 'demo_paid'].includes(bookingState.booking.paymentStatus) ||
      cashfreeOrder
    ) {
      return
    }

    let active = true
    setIsOrderLoading(true)

    const returnUrl = window.location.protocol === 'https:'
      ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
      : ''

    createCashfreeOrder(requestId, returnUrl)
      .then((order) => {
        if (!active) return
        if (order.alreadyPaid) {
          setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
          return
        }
        setCashfreeOrder(order)
        setBookingState((current) => ({
          ...current,
          booking: {
            ...current.booking,
            paymentAmount: order.amount,
            paymentAmountPaise: Math.round(order.amount * 100),
            ...(order.pricing ?? {}),
          },
        }))
      })
      .catch((err) => {
        if (!active) return
        console.error('[Cashfree Order Error]', err)
        setPaymentError(err instanceof Error ? err.message : 'Could not prepare payment channels.')
      })
      .finally(() => {
        if (active) setIsOrderLoading(false)
      })

    return () => {
      active = false
    }
  }, [isCashfreeActive, bookingState.status, bookingState.booking?.paymentStatus, requestId, cashfreeOrder])

  // =========================================================================
  // DYNAMIC UPI AUTO-POLLING (DESKTOP & MOBILE CONFIRMATION)
  // =========================================================================
  useEffect(() => {
    const isUpiMethod = ['upi_qr', 'gpay', 'phonepe', 'paytm'].includes(selectedMethod)
    if (
      !isCashfreeActive ||
      !isUpiMethod ||
      !cashfreeOrder?.order_id ||
      ['paid', 'demo_paid'].includes(bookingState.booking?.paymentStatus)
    ) {
      return undefined
    }

    const intervalId = setInterval(async () => {
      try {
        const res = await checkCashfreePaymentStatus(requestId)
        if (res?.booking?.paymentStatus === 'paid') {
          setBookingState({ requestId, status: 'ready', booking: res.booking, error: '' })
        }
      } catch {}
    }, 3500)

    return () => clearInterval(intervalId)
  }, [isCashfreeActive, selectedMethod, cashfreeOrder?.order_id, bookingState.booking?.paymentStatus, requestId])

  // =========================================================================
  // CASHFREE WEB ELEMENTS LIFECYCLE & MOUNTING (BRANDED CUSTOM UI)
  // =========================================================================
  useEffect(() => {
    if (!cashfreeOrder?.payment_session_id || !isCashfreeActive) return

    let active = true
    setIsElementReady(false)
    setElementLoadError('')

    // Unmount any previous element
    if (activeComponentRef.current?.unmount) {
      try {
        activeComponentRef.current.unmount()
      } catch {}
      activeComponentRef.current = null
    }
    Object.values(cardElementsRef.current).forEach((el) => {
      try {
        el?.unmount?.()
      } catch {}
    })
    cardElementsRef.current = {}

    // Dark luxury VibeTogether styling theme applied directly to Cashfree atom iframes
    const elementStyle = {
      base: {
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: '15px',
        lineHeight: '26px',
        backgroundColor: 'transparent',
        '::placeholder': {
          color: '#8e8a9f',
        },
      },
      invalid: {
        color: '#ef4444',
      },
    }

    loadCashfreeSdk().then((loaded) => {
      if (!active || !loaded || typeof window.Cashfree !== 'function') {
        if (active) setElementLoadError('Payment interface could not connect. Check internet access.')
        return
      }

      try {
        const mode = cashfreeOrder.environment === 'production' ? 'production' : 'sandbox'
        const cf = window.Cashfree({ mode })
        cashfreeInstanceRef.current = cf

        if (selectedMethod === 'upi_qr') {
          // Pure QR Code mode ONLY
          const qrSlot = document.getElementById('vibetogether-cf-upi-qr')
          if (qrSlot) {
            const qr = cf.create('upiQr', { values: { size: '200px' } })
            qr.on('ready', () => active && setIsElementReady(true))
            qr.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Failed to load QR.'))
            qr.mount('#vibetogether-cf-upi-qr')
            activeComponentRef.current = qr
          }
        } else if (selectedMethod === 'gpay') {
          if (device.isAndroid) {
            const gpaySlot = document.getElementById('vibetogether-cf-gpay')
            if (gpaySlot) {
              const gpay = cf.create('upiApp', {
                values: { upiApp: 'gpay', buttonText: 'Pay via Google Pay', buttonIcon: true },
              })
              gpay.on('ready', () => active && setIsElementReady(true))
              gpay.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'GPay intent not available.'))
              gpay.mount('#vibetogether-cf-gpay')
              activeComponentRef.current = gpay
            }
          } else {
            const collectSlot = document.getElementById('vibetogether-cf-upi-collect-gpay')
            if (collectSlot) {
              const col = cf.create('upiCollect', {
                values: { placeholder: 'Enter Google Pay UPI ID (e.g. name@okhdfcbank)' },
                style: elementStyle,
              })
              col.on('ready', () => active && setIsElementReady(true))
              col.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Failed to load Google Pay UPI field.'))
              col.mount('#vibetogether-cf-upi-collect-gpay')
              activeComponentRef.current = col
            }
          }
        } else if (selectedMethod === 'phonepe') {
          if (device.isAndroid) {
            const phonepeSlot = document.getElementById('vibetogether-cf-phonepe')
            if (phonepeSlot) {
              const phonepe = cf.create('upiApp', {
                values: { upiApp: 'phonepe', buttonText: 'Pay via PhonePe', buttonIcon: true },
              })
              phonepe.on('ready', () => active && setIsElementReady(true))
              phonepe.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'PhonePe intent not available.'))
              phonepe.mount('#vibetogether-cf-phonepe')
              activeComponentRef.current = phonepe
            }
          } else {
            const collectSlot = document.getElementById('vibetogether-cf-upi-collect-phonepe')
            if (collectSlot) {
              const col = cf.create('upiCollect', {
                values: { placeholder: 'Enter PhonePe UPI ID (e.g. mobile@ybl)' },
                style: elementStyle,
              })
              col.on('ready', () => active && setIsElementReady(true))
              col.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Failed to load PhonePe UPI field.'))
              col.mount('#vibetogether-cf-upi-collect-phonepe')
              activeComponentRef.current = col
            }
          }
        } else if (selectedMethod === 'paytm') {
          if (device.isAndroid) {
            const paytmSlot = document.getElementById('vibetogether-cf-paytm')
            if (paytmSlot) {
              const paytm = cf.create('upiApp', {
                values: { upiApp: 'paytm', buttonText: 'Pay via Paytm', buttonIcon: true },
              })
              paytm.on('ready', () => active && setIsElementReady(true))
              paytm.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Paytm intent not available.'))
              paytm.mount('#vibetogether-cf-paytm')
              activeComponentRef.current = paytm
            }
          } else {
            const collectSlot = document.getElementById('vibetogether-cf-upi-collect-paytm')
            if (collectSlot) {
              const col = cf.create('upiCollect', {
                values: { placeholder: 'Enter Paytm UPI ID (e.g. mobile@paytm)' },
                style: elementStyle,
              })
              col.on('ready', () => active && setIsElementReady(true))
              col.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Failed to load Paytm UPI field.'))
              col.mount('#vibetogether-cf-upi-collect-paytm')
              activeComponentRef.current = col
            }
          }
        } else if (selectedMethod === 'card') {
          const numSlot = document.getElementById('vibetogether-cf-card-number')
          const expSlot = document.getElementById('vibetogether-cf-card-expiry')
          const cvvSlot = document.getElementById('vibetogether-cf-card-cvv')
          const holderSlot = document.getElementById('vibetogether-cf-card-holder')

          if (numSlot && expSlot && cvvSlot && holderSlot) {
            const cardNum = cf.create('cardNumber', {
              values: { placeholder: '•••• •••• •••• ••••' },
              style: elementStyle,
            })
            const cardExp = cf.create('cardExpiry', { style: elementStyle })
            const cardCvv = cf.create('cardCvv', { values: { cvvLength: 3 }, style: elementStyle })
            const cardHolder = cf.create('cardHolder', { values: { placeholder: 'Name on Card' }, style: elementStyle })

            cardNum.on('ready', () => active && setIsElementReady(true))
            cardNum.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Card element failed.'))

            cardNum.mount('#vibetogether-cf-card-number')
            cardExp.mount('#vibetogether-cf-card-expiry')
            cardCvv.mount('#vibetogether-cf-card-cvv')
            cardHolder.mount('#vibetogether-cf-card-holder')

            cardElementsRef.current = { cardNum, cardExp, cardCvv, cardHolder }
            activeComponentRef.current = cardNum // Payable element coordinating with expiry, cvv, holder
          }
        } else if (selectedMethod === 'netbanking') {
          const nbSlot = document.getElementById('vibetogether-cf-netbanking')
          if (nbSlot) {
            const currentBank = popularBanks.find((b) => b.code === selectedBank)?.name || selectedBank
            const nb = cf.create('netbanking', {
              values: { netbankingBankName: selectedBank, buttonText: `Proceed to ${currentBank}` },
            })
            nb.on('ready', () => active && setIsElementReady(true))
            nb.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Net Banking failed.'))
            nb.mount('#vibetogether-cf-netbanking')
            activeComponentRef.current = nb
          }
        } else if (selectedMethod === 'wallet') {
          const walletSlot = document.getElementById('vibetogether-cf-wallet')
          if (walletSlot) {
            const currentWallet = popularWallets.find((w) => w.code === selectedWallet)?.name || selectedWallet
            const w = cf.create('wallet', {
              values: {
                provider: selectedWallet,
                phone: bookingState.booking?.mobile ? bookingState.booking.mobile.replace(/\D/g, '').slice(-10) : '9999999999',
                buttonText: `Pay with ${currentWallet}`,
              },
            })
            w.on('ready', () => active && setIsElementReady(true))
            w.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Wallet element failed.'))
            w.mount('#vibetogether-cf-wallet')
            activeComponentRef.current = w
          }
        }
      } catch (err) {
        if (active) {
          console.error('[Cashfree Mount Exception]', err)
          setElementLoadError(err instanceof Error ? err.message : 'Could not initialize payment element.')
        }
      }
    })

    return () => {
      active = false
      if (activeComponentRef.current?.unmount) {
        try {
          activeComponentRef.current.unmount()
        } catch {}
      }
      Object.values(cardElementsRef.current).forEach((el) => {
        try {
          el?.unmount?.()
        } catch {}
      })
    }
  }, [cashfreeOrder?.payment_session_id, isCashfreeActive, selectedMethod, upiSubMode, selectedBank, selectedWallet])

  // =========================================================================
  // EXECUTE BRANDED PAYMENT VIA CASHFREE.PAY (WITH INLINE FALLBACK)
  // =========================================================================
  async function handleExecuteCustomPayment() {
    // 1. Validate booking ID
    if (!requestId) {
      setPaymentError('Invalid booking identifier. Please return to the booking steps.')
      return
    }

    // 2. Validate selected payment method
    if (!selectedMethod) {
      setPaymentError('Please select a payment method before proceeding.')
      return
    }

    // 3. Prevent duplicate clicks
    if (isPaying || paying.current || paymentUncertain) return
    paying.current = true
    setIsPaying(true)
    setPaymentError('')

    try {
      // 4 & 5. Ensure valid Cashfree order and payment_session_id
      let currentOrder = cashfreeOrder
      const returnUrl = window.location.protocol === 'https:'
        ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
        : ''

      if (!currentOrder?.payment_session_id) {
        currentOrder = await createCashfreeOrder(requestId, returnUrl)
        setCashfreeOrder(currentOrder)
      }

      if (currentOrder.alreadyPaid) {
        setBookingState({ requestId, status: 'ready', booking: currentOrder.booking, error: '' })
        return
      }

      const sessionId = currentOrder.payment_session_id
      const cf = cashfreeInstanceRef.current || (typeof window.Cashfree === 'function' ? window.Cashfree({
        mode: currentOrder.environment === 'production' ? 'production' : 'sandbox',
      }) : null)

      if (!cf) {
        throw new Error('Payment gateway could not be loaded. Please check your internet connection.')
      }

      // 6. Start the correct payment flow based on selected method
      if (selectedMethod === 'upi_qr') {
        // Pure QR verification
        const res = await checkCashfreePaymentStatus(requestId)
        if (res?.booking?.paymentStatus === 'paid') {
          setBookingState({ requestId, status: 'ready', booking: res.booking, error: '' })
          return
        } else {
          setPaymentError('Payment is awaiting confirmation from your UPI app. Please scan the QR code and approve on your phone.')
          return
        }
      }

      if (['gpay', 'phonepe', 'paytm'].includes(selectedMethod)) {
        const appTitle = selectedMethod === 'gpay' ? 'Google Pay' : selectedMethod === 'phonepe' ? 'PhonePe' : 'Paytm'

        if (device.isAndroid) {
          // Direct one-tap app launch
          const appComponent = activeComponentRef.current
          let payResult = null
          if (appComponent) {
            try {
              payResult = await cf.pay({
                paymentMethod: appComponent,
                paymentSessionId: sessionId,
                returnUrl,
                redirect: 'if_required',
              })
            } catch (err) {
              console.warn(`[Cashfree] ${selectedMethod} app launch error:`, err)
            }
          }

          if (!appComponent || payResult?.error) {
            console.warn(`[Cashfree] Direct ${appTitle} launch unavailable or returned error. Opening modal checkout:`, payResult?.error)
            await cf.checkout({
              paymentSessionId: sessionId,
              redirectTarget: '_modal',
            })
            const checkRes = await checkCashfreePaymentStatus(requestId)
            if (checkRes?.booking?.paymentStatus === 'paid') {
              setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
              return
            }
          }
          return
        } else {
          // Direct UPI ID request (Desktop / iOS)
          const collectComponent = activeComponentRef.current
          let payResult = null

          if (collectComponent) {
            try {
              payResult = await cf.pay({
                paymentMethod: collectComponent,
                paymentSessionId: sessionId,
                returnUrl,
                redirect: 'if_required',
              })
            } catch (err) {
              console.warn(`[Cashfree] ${appTitle} collect exception:`, err)
              payResult = { error: { message: err instanceof Error ? err.message : 'Collect request error' } }
            }
          }

          if (!collectComponent || payResult?.error) {
            console.warn(`[Cashfree] ${appTitle} collect returned error or empty. Opening Cashfree checkout modal:`, payResult?.error)
            await cf.checkout({
              paymentSessionId: sessionId,
              redirectTarget: '_modal',
            })
            const checkRes = await checkCashfreePaymentStatus(requestId)
            if (checkRes?.booking?.paymentStatus === 'paid') {
              setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
              return
            }
          } else {
            setCollectNotice(`Payment request sent to your ${appTitle} app! Please approve ₹${finalPayable} on your phone to complete your booking.`)
            setPaymentError('')
            await refreshPaymentStatus()
          }
          return
        }
      }

      if (selectedMethod === 'card') {
        const cardNum = cardElementsRef.current.cardNum
        let payResult = null
        if (cardNum) {
          try {
            payResult = await cf.pay({
              paymentMethod: cardNum,
              paymentSessionId: sessionId,
              returnUrl,
              redirect: 'if_required',
              redirectTarget: '_modal',
            })
          } catch (err) {
            console.warn('[Cashfree] Card pay exception:', err)
            payResult = { error: { message: err instanceof Error ? err.message : 'Card payment error' } }
          }
        }
        if (!cardNum || payResult?.error) {
          console.warn('[Cashfree] Card custom payment error. Opening Cashfree modal checkout:', payResult?.error)
          await cf.checkout({
            paymentSessionId: sessionId,
            redirectTarget: '_modal',
            returnUrl,
          })
          const checkRes = await checkCashfreePaymentStatus(requestId)
          if (checkRes?.booking?.paymentStatus === 'paid') {
            setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
            return
          }
        } else {
          await refreshPaymentStatus()
        }
        return
      }

      if (selectedMethod === 'netbanking') {
        const nbComponent = activeComponentRef.current
        let payResult = null
        if (nbComponent) {
          try {
            payResult = await cf.pay({
              paymentMethod: nbComponent,
              paymentSessionId: sessionId,
              returnUrl,
              redirect: 'if_required',
              redirectTarget: '_modal',
            })
          } catch (err) {
            console.warn('[Cashfree] Net Banking exception:', err)
          }
        }
        if (!nbComponent || payResult?.error) {
          console.warn('[Cashfree] Net Banking fallback. Opening Cashfree modal checkout.')
          await cf.checkout({
            paymentSessionId: sessionId,
            redirectTarget: '_modal',
            returnUrl,
          })
          const checkRes = await checkCashfreePaymentStatus(requestId)
          if (checkRes?.booking?.paymentStatus === 'paid') {
            setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
            return
          }
        }
        return
      }

      if (selectedMethod === 'wallet') {
        const wComponent = activeComponentRef.current
        let payResult = null
        if (wComponent) {
          try {
            payResult = await cf.pay({
              paymentMethod: wComponent,
              paymentSessionId: sessionId,
              returnUrl,
              redirect: 'if_required',
              redirectTarget: '_modal',
            })
          } catch (err) {
            console.warn('[Cashfree] Wallet exception:', err)
          }
        }
        if (!wComponent || payResult?.error) {
          console.warn('[Cashfree] Wallet fallback. Opening Cashfree modal checkout.')
          await cf.checkout({
            paymentSessionId: sessionId,
            redirectTarget: '_modal',
            returnUrl,
          })
          const checkRes = await checkCashfreePaymentStatus(requestId)
          if (checkRes?.booking?.paymentStatus === 'paid') {
            setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
            return
          }
        }
        return
      }
    } catch (error) {
      console.error('[Cashfree Custom Pay Error]', error)
      setPaymentError(
        error instanceof Error ? error.message : 'Payment could not be started. Check details and retry.',
      )
      void refreshPaymentStatus()
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  async function handleOpenCashfreeModal() {
    if (isPaying || paying.current || !requestId) return
    paying.current = true
    setIsPaying(true)
    setPaymentError('')
    try {
      let currentOrder = cashfreeOrder
      const returnUrl = window.location.protocol === 'https:'
        ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
        : ''
      if (!currentOrder?.payment_session_id) {
        currentOrder = await createCashfreeOrder(requestId, returnUrl)
        setCashfreeOrder(currentOrder)
      }
      const cf = cashfreeInstanceRef.current || (typeof window.Cashfree === 'function' ? window.Cashfree({
        mode: currentOrder.environment === 'production' ? 'production' : 'sandbox',
      }) : null)
      if (!cf) throw new Error('Payment gateway could not be loaded.')
      await cf.checkout({
        paymentSessionId: currentOrder.payment_session_id,
        redirectTarget: '_modal',
      })
      const checkRes = await checkCashfreePaymentStatus(requestId)
      if (checkRes?.booking?.paymentStatus === 'paid') {
        setBookingState({ requestId, status: 'ready', booking: checkRes.booking, error: '' })
      }
    } catch (err) {
      console.error('[Cashfree Modal Error]', err)
      setPaymentError(err instanceof Error ? err.message : 'Could not open payment window.')
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
    setPaymentError(error?.description || 'Payment could not be started. Try another method.')
  })

  // Initialize Razorpay fallback if configured
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
    setPaymentUncertain(false)
    navigate(`/booking/payment/${encodeURIComponent(requestId)}?retry=1`, { replace: true })
    if (isCashfreeActive) {
      setTimeout(() => {
        void handleExecuteCustomPayment()
      }, 100)
    } else {
      setIsInitializingCheckout(true)
      setCheckoutRequested(true)
      setPaymentMethods(null)
      setRazorpayOrder(null)
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
             LUXURY VIP SUCCESS STATE (CONFIRMED PASS)
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
                A confirmation receipt has been generated.
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
                        {memberDetails.map(({ label, name, mobile }) => (
                          <span className="booking-payment__ticket-member-tag" key={label}>
                            {label}: <strong>{name || 'Guest'}</strong>{mobile ? <span className="booking-payment__ticket-member-phone"> ({mobile})</span> : null}
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
             STEP 5: LUXURY TWO-COLUMN PAYMENT PAGE (BRANDED CUSTOM CHECKOUT)
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
                Select your preferred payment method below. Securely processed via encrypted Cashfree Elements.
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
                          {memberDetails.map(({ label, name, mobile }) => (
                            <span className="booking-payment__guest-chip" key={label}>
                              <span className="booking-payment__guest-chip-label">{label}:</span>
                              <strong className="booking-payment__guest-chip-name">{name || 'Guest'}</strong>
                              {mobile && <span className="booking-payment__guest-chip-mobile"> ({mobile})</span>}
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
                 RIGHT COLUMN: ORDER SUMMARY & BRANDED CUSTOM CHECKOUT
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

                {/* Payment Error Alert */}
                {paymentError && (
                  <div className="booking-payment__alert-box" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{paymentError}</span>
                  </div>
                )}

                {/* Payment Routing */}
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
                     FULLY BRANDED CASHFREE CUSTOM CHECKOUT (NO HOSTED POPUP)
                     =================================================================== */
                  <div className="booking-payment__custom-cashfree-shell">
                    <div className="booking-payment__methods-header">
                      <span className="booking-payment__methods-heading">SELECT PAYMENT METHOD</span>
                      <span className="booking-payment__methods-note">Cashfree Encrypted Elements</span>
                    </div>

                    {/* Method Selector Tabs */}
                    <div className="booking-payment__custom-method-selector" role="tablist" aria-label="Payment Methods">
                      {customPaymentMethods.map((method) => {
                        const isSelected = selectedMethod === method.id
                        const MethodIcon = method.icon
                        return (
                          <button
                            key={method.id}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            className={`booking-payment__custom-method-pill${isSelected ? ' is-active' : ''}`}
                            onClick={() => {
                              setSelectedMethod(method.id)
                              setPaymentError('')
                            }}
                          >
                            <span className="booking-payment__custom-pill-icon">
                              <MethodIcon size={16} aria-hidden="true" />
                            </span>
                            <span className="booking-payment__custom-pill-title">{method.name}</span>
                            {method.badge && (
                              <span className="booking-payment__custom-pill-badge">{method.badge}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Active Method Container Card */}
                    <div className="booking-payment__custom-method-details">
                      {isOrderLoading && (
                        <div className="booking-payment__cf-loading-box" role="status">
                          <LoaderCircle className="booking-payment__btn-spinner" size={20} aria-hidden="true" />
                          <span>Preparing secure payment elements…</span>
                        </div>
                      )}

                      {elementLoadError && (
                        <div className="booking-payment__alert-box" role="alert">
                          <AlertTriangle size={15} aria-hidden="true" />
                          <span>{elementLoadError}</span>
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         1. UPI / QR METHOD (PURE QR CODE ONLY)
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'upi_qr' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="UPI and QR">
                          <div className="booking-payment__cf-qr-block">
                            <div className="booking-payment__cf-qr-outer">
                              <div id="vibetogether-cf-upi-qr" className="booking-payment__cf-qr-mount" />
                            </div>
                            <div className="booking-payment__cf-qr-instructions">
                              <span className="booking-payment__cf-qr-caption">
                                Scan using <strong>Google Pay</strong>, <strong>PhonePe</strong>, <strong>Paytm</strong>, <strong>CRED</strong> or any UPI App
                              </span>
                              <div className="booking-payment__cf-qr-beacons">
                                <span className="booking-payment__pulse-beacon" aria-hidden="true" />
                                <span>Dynamic order amount: ₹{finalPayable}</span>
                              </div>
                            </div>
                            <div className="booking-payment__cf-qr-actions">
                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--verify"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Verifying Payment…</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw size={16} aria-hidden="true" />
                                    <span>I HAVE PAID — VERIFY STATUS</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                              <span className="booking-payment__auto-poll-hint">
                                <Sparkles size={13} aria-hidden="true" />
                                Auto-checking for payment confirmation…
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         2. GOOGLE PAY METHOD (DIRECT GPAY ONLY — NO QR)
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'gpay' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="Google Pay">
                          <div className="booking-payment__intent-card">
                            <div className="booking-payment__intent-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(59, 130, 246, 0.2))', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
                              <Smartphone size={28} className="booking-payment__intent-icon" />
                            </div>
                            <div className="booking-payment__intent-copy">
                              <strong className="booking-payment__intent-name">Pay via Google Pay</strong>
                              <span className="booking-payment__intent-desc">
                                {device.isAndroid
                                  ? 'One-tap instant payment. Launches your installed Google Pay application directly.'
                                  : 'Enter your Google Pay UPI ID to receive a payment request directly on your phone.'}
                              </span>
                            </div>
                          </div>

                          {device.isAndroid ? (
                            <>
                              <div id="vibetogether-cf-gpay" className="booking-payment__cf-app-mount" />

                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--gpay"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Launching Google Pay…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>PAY ₹{finalPayable} WITH GOOGLE PAY</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <div className="booking-payment__cf-collect-block">
                              <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-upi-collect-gpay">
                                GOOGLE PAY UPI ID (VPA)
                              </label>
                              <div id="vibetogether-cf-upi-collect-gpay" className="booking-payment__cf-input-mount" />
                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--gpay"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Connecting Google Pay…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>REQUEST ₹{finalPayable} ON GOOGLE PAY</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                              {collectNotice && selectedMethod === 'gpay' && (
                                <div className="booking-payment__collect-notice" role="status">
                                  <CheckCircle2 size={16} aria-hidden="true" />
                                  <span>{collectNotice}</span>
                                </div>
                              )}
                              <button
                                type="button"
                                className="booking-payment__cf-alt-link"
                                onClick={handleOpenCashfreeModal}
                              >
                                Having trouble with UPI ID? Open direct payment window →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         3. PHONEPE METHOD (DIRECT PHONEPE ONLY — NO QR)
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'phonepe' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="PhonePe">
                          <div className="booking-payment__intent-card">
                            <div className="booking-payment__intent-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(91, 33, 182, 0.4), rgba(124, 58, 237, 0.3))', borderColor: 'rgba(139, 92, 246, 0.4)' }}>
                              <Smartphone size={28} className="booking-payment__intent-icon" />
                            </div>
                            <div className="booking-payment__intent-copy">
                              <strong className="booking-payment__intent-name">Pay via PhonePe</strong>
                              <span className="booking-payment__intent-desc">
                                {device.isAndroid
                                  ? 'Seamless payment directly from your PhonePe balance or linked bank account.'
                                  : 'Enter your PhonePe UPI ID or linked mobile number to receive a payment request.'}
                              </span>
                            </div>
                          </div>

                          {device.isAndroid ? (
                            <>
                              <div id="vibetogether-cf-phonepe" className="booking-payment__cf-app-mount" />

                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--phonepe"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Launching PhonePe…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>PAY ₹{finalPayable} WITH PHONEPE</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <div className="booking-payment__cf-collect-block">
                              <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-upi-collect-phonepe">
                                PHONEPE UPI ID / NUMBER
                              </label>
                              <div id="vibetogether-cf-upi-collect-phonepe" className="booking-payment__cf-input-mount" />
                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--phonepe"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Connecting PhonePe…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>REQUEST ₹{finalPayable} ON PHONEPE</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                              {collectNotice && selectedMethod === 'phonepe' && (
                                <div className="booking-payment__collect-notice" role="status">
                                  <CheckCircle2 size={16} aria-hidden="true" />
                                  <span>{collectNotice}</span>
                                </div>
                              )}
                              <button
                                type="button"
                                className="booking-payment__cf-alt-link"
                                onClick={handleOpenCashfreeModal}
                              >
                                Having trouble with UPI ID? Open direct payment window →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         4. PAYTM METHOD (DIRECT PAYTM ONLY — NO QR)
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'paytm' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="Paytm">
                          <div className="booking-payment__intent-card">
                            <div className="booking-payment__intent-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(3, 105, 161, 0.4), rgba(2, 132, 199, 0.3))', borderColor: 'rgba(0, 186, 242, 0.4)' }}>
                              <Smartphone size={28} className="booking-payment__intent-icon" />
                            </div>
                            <div className="booking-payment__intent-copy">
                              <strong className="booking-payment__intent-name">Pay via Paytm</strong>
                              <span className="booking-payment__intent-desc">
                                {device.isAndroid
                                  ? 'Fast checkout using Paytm UPI, Postpaid or Wallet on your mobile device.'
                                  : 'Enter your Paytm UPI ID or linked mobile number to receive a payment request.'}
                              </span>
                            </div>
                          </div>

                          {device.isAndroid ? (
                            <>
                              <div id="vibetogether-cf-paytm" className="booking-payment__cf-app-mount" />

                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--paytm"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Launching Paytm…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>PAY ₹{finalPayable} WITH PAYTM</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <div className="booking-payment__cf-collect-block">
                              <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-upi-collect-paytm">
                                PAYTM UPI ID / NUMBER
                              </label>
                              <div id="vibetogether-cf-upi-collect-paytm" className="booking-payment__cf-input-mount" />
                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn booking-payment__cf-submit-btn--paytm"
                                disabled={isPaying}
                                onClick={handleExecuteCustomPayment}
                              >
                                {isPaying ? (
                                  <>
                                    <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                    <span>Connecting Paytm…</span>
                                  </>
                                ) : (
                                  <>
                                    <LockKeyhole size={16} aria-hidden="true" />
                                    <span>REQUEST ₹{finalPayable} ON PAYTM</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                              {collectNotice && selectedMethod === 'paytm' && (
                                <div className="booking-payment__collect-notice" role="status">
                                  <CheckCircle2 size={16} aria-hidden="true" />
                                  <span>{collectNotice}</span>
                                </div>
                              )}
                              <button
                                type="button"
                                className="booking-payment__cf-alt-link"
                                onClick={handleOpenCashfreeModal}
                              >
                                Having trouble with UPI ID? Open direct payment window →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         5. CREDIT & DEBIT CARDS METHOD
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'card' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="Credit and Debit Cards">
                          <div className="booking-payment__cf-card-form">
                            <div className="booking-payment__cf-field-group">
                              <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-card-number">
                                Card Number
                              </label>
                              <div id="vibetogether-cf-card-number" className="booking-payment__cf-input-mount" />
                            </div>

                            <div className="booking-payment__cf-field-row">
                              <div className="booking-payment__cf-field-group">
                                <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-card-expiry">
                                  Valid Thru (MM / YY)
                                </label>
                                <div id="vibetogether-cf-card-expiry" className="booking-payment__cf-input-mount" />
                              </div>
                              <div className="booking-payment__cf-field-group">
                                <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-card-cvv">
                                  CVV / CVC
                                </label>
                                <div id="vibetogether-cf-card-cvv" className="booking-payment__cf-input-mount" />
                              </div>
                            </div>

                            <div className="booking-payment__cf-field-group">
                              <label className="booking-payment__cf-label" htmlFor="vibetogether-cf-card-holder">
                                Cardholder Name
                              </label>
                              <div id="vibetogether-cf-card-holder" className="booking-payment__cf-input-mount" />
                            </div>

                            <div className="booking-payment__cf-card-badges">
                              <span className="booking-payment__cf-brand-chip">VISA</span>
                              <span className="booking-payment__cf-brand-chip">MasterCard</span>
                              <span className="booking-payment__cf-brand-chip">RuPay</span>
                              <span className="booking-payment__cf-brand-chip">Maestro</span>
                            </div>

                            <button
                              type="button"
                              className="booking-payment__cf-submit-btn"
                              disabled={isPaying}
                              onClick={handleExecuteCustomPayment}
                            >
                              {isPaying ? (
                                <>
                                  <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                  <span>Processing Card Payment…</span>
                                </>
                              ) : (
                                <>
                                  <LockKeyhole size={16} aria-hidden="true" />
                                  <span>PAY ₹{finalPayable} NOW</span>
                                  <ArrowRight size={16} aria-hidden="true" />
                                </>
                              )}
                            </button>
                            <div id="vibetogether-cf-inline-slot" className="booking-payment__cf-inline-slot" />
                          </div>
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         6. NET BANKING METHOD
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'netbanking' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="Net Banking">
                          <label className="booking-payment__cf-label">Select Your Bank</label>
                          <div className="booking-payment__cf-bank-grid" role="radiogroup" aria-label="Select Bank">
                            {popularBanks.map((bank) => {
                              const isBankSelected = selectedBank === bank.code
                              return (
                                <button
                                  key={bank.code}
                                  type="button"
                                  role="radio"
                                  aria-checked={isBankSelected}
                                  className={`booking-payment__cf-bank-chip${isBankSelected ? ' is-selected' : ''}`}
                                  onClick={() => setSelectedBank(bank.code)}
                                >
                                  <Landmark size={15} aria-hidden="true" />
                                  <span>{bank.short}</span>
                                </button>
                              )
                            })}
                          </div>

                          <div id="vibetogether-cf-netbanking" className="booking-payment__cf-app-mount" />

                          <button
                            type="button"
                            className="booking-payment__cf-submit-btn"
                            disabled={isPaying}
                            onClick={handleExecuteCustomPayment}
                          >
                            {isPaying ? (
                              <>
                                <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                <span>Routing to Bank Portal…</span>
                              </>
                            ) : (
                              <>
                                <LockKeyhole size={16} aria-hidden="true" />
                                <span>PAY ₹{finalPayable} VIA NET BANKING</span>
                                <ArrowRight size={16} aria-hidden="true" />
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* -------------------------------------------------------------
                         7. DIGITAL WALLETS METHOD
                         ------------------------------------------------------------- */}
                      {selectedMethod === 'wallet' && (
                        <div className="booking-payment__cf-panel" role="tabpanel" aria-label="Digital Wallets">
                          <label className="booking-payment__cf-label">Choose Digital Wallet</label>
                          <div className="booking-payment__cf-wallet-grid" role="radiogroup" aria-label="Select Wallet">
                            {popularWallets.map((wallet) => {
                              const isWalletSelected = selectedWallet === wallet.code
                              return (
                                <button
                                  key={wallet.code}
                                  type="button"
                                  role="radio"
                                  aria-checked={isWalletSelected}
                                  className={`booking-payment__cf-wallet-chip${isWalletSelected ? ' is-selected' : ''}`}
                                  onClick={() => setSelectedWallet(wallet.code)}
                                >
                                  <WalletCards size={15} aria-hidden="true" />
                                  <span>{wallet.name}</span>
                                </button>
                              )
                            })}
                          </div>

                          <div id="vibetogether-cf-wallet" className="booking-payment__cf-app-mount" />

                          <button
                            type="button"
                            className="booking-payment__cf-submit-btn"
                            disabled={isPaying}
                            onClick={handleExecuteCustomPayment}
                          >
                            {isPaying ? (
                              <>
                                <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                <span>Connecting to Wallet…</span>
                              </>
                            ) : (
                              <>
                                <LockKeyhole size={16} aria-hidden="true" />
                                <span>PAY ₹{finalPayable} VIA WALLET</span>
                                <ArrowRight size={16} aria-hidden="true" />
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Trust Guarantees */}
                    <div className="booking-payment__trust-footer">
                      <div className="booking-payment__trust-item">
                        <ShieldCheck size={14} aria-hidden="true" />
                        <span>PCI-DSS Level 1 Elements</span>
                      </div>
                      <div className="booking-payment__trust-item">
                        <LockKeyhole size={14} aria-hidden="true" />
                        <span>End-to-End Encrypted</span>
                      </div>
                      <div className="booking-payment__trust-item">
                        <Sparkles size={14} aria-hidden="true" />
                        <span>Instant E-Ticket Pass</span>
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
