import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Info,
  LoaderCircle,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  XCircle,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import UpiPayment from './UpiPayment.jsx'
import usePublicEvents from '../hooks/usePublicEvents.js'
import {
  createGooglePayPaymentIntent,
  createPaytmPaymentIntent,
  createPhonePePaymentIntent,
} from '../services/upiPaymentIntent.js'
import {
  checkCashfreePaymentStatus,
  createCashfreeOrder,
  recordCashfreePaymentFailure,
  verifyCashfreePayment,
  getBookingEnquiry,
} from '../services/bookingEnquiryPayment.js'
import { resolveBookingSubtotal } from '../utils/bookingTotals.js'
import './BookingPayment.css'

const paymentAttemptTimeoutMs = 2 * 60 * 1000
const cashfreeScriptUrl = 'https://sdk.cashfree.com/js/v3/cashfree.js'

function getDeviceCapabilities() {
  if (typeof navigator === 'undefined') {
    return { isAndroid: false, isAndroidWebView: false, isIOS: false }
  }
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroidWebView = isAndroid && (/[;\s]wv\)/i.test(ua) || /Version\/\d+\.\d+.*Chrome\//i.test(ua))
  return { isAndroid, isAndroidWebView, isIOS }
}

// These are the only website-owned Cashfree method choices. Hosted checkout is intentionally absent.
const _allCustomPaymentMethods = [
  {
    id: 'upiQr',
    name: 'Other UPI · QR',
    subtitle: 'Scan QR with any UPI app',
    badge: 'POPULAR · 0% FEE',
    icon: QrCode,
    desc: 'Scan the QR code with Google Pay, PhonePe, Paytm, CRED or any UPI app.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    subtitle: 'Mobile app handoff',
    badge: 'MOBILE ONLY',
    icon: Smartphone,
    desc: 'Requires the PhonePe app and an external UPI intent handoff.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    subtitle: 'Mobile app handoff',
    badge: 'MOBILE ONLY',
    icon: Smartphone,
    desc: 'Requires the Google Pay app and an external UPI intent handoff.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'paytm',
    name: 'Paytm',
    subtitle: 'Mobile app handoff',
    badge: 'MOBILE ONLY',
    icon: Smartphone,
    desc: 'Requires the Paytm app and an external UPI intent handoff.',
    platforms: ['desktop', 'android', 'ios'],
  },
  {
    id: 'card',
    name: 'Credit & Debit Cards',
    subtitle: 'Visa · MasterCard · RuPay · Maestro',
    badge: 'CASHFREE ELEMENTS',
    icon: CreditCard,
    desc: 'Pay securely with Cashfree-hosted card fields on this page.',
    platforms: ['desktop', 'android', 'ios'],
  },
]

const cashfreeUpiApps = {
  phonepe: { id: 'phonepe', name: 'PhonePe', selector: 'vibetogether-cf-phonepe' },
  gpay: { id: 'gpay', name: 'Google Pay', selector: 'vibetogether-cf-gpay' },
  paytm: { id: 'paytm', name: 'Paytm', selector: 'vibetogether-cf-paytm' },
}

function unmountCashfreeComponents(componentRef, selectedComponentRef, instanceRef) {
  Object.values(componentRef.current).forEach((component) => {
    if (typeof component?.unmount === 'function') {
      try { component.unmount() } catch {}
    }
  })
  componentRef.current = {}
  selectedComponentRef.current = null
  instanceRef.current = null
}

function requestCashfreeOrderOnce(requestRef, requestId, returnUrl) {
  const pendingRequest = requestRef.current
  if (pendingRequest?.requestId === requestId) {
    return pendingRequest.promise
  }

  const request = { requestId, promise: null }
  request.promise = createCashfreeOrder(requestId, returnUrl).finally(() => {
    if (requestRef.current === request) {
      requestRef.current = null
    }
  })
  requestRef.current = request
  return request.promise
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

function formatEventDate(value) {
  if (typeof value !== 'string' || !value) {
    return ''
  }
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
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

export default function BookingPayment() {
  const { events: publicEvents } = usePublicEvents()
  const { requestId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  useEffect(() => {
    const root = document.documentElement
    const previousRootOverflowY = root.style.overflowY
    const previousOverflow = document.body.style.overflow
    root.style.overflowY = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      root.style.overflowY = previousRootOverflowY
      document.body.style.overflow = previousOverflow
    }
  }, [])

  // Custom Checkout state
  const [selectedMethod, setSelectedMethod] = useState('phonepe')
  const [cashfreeOrder, setCashfreeOrder] = useState(null)
  const [isOrderLoading, setIsOrderLoading] = useState(false)
  const [isElementReady, setIsElementReady] = useState(false)
  const [elementLoadError, setElementLoadError] = useState('')

  // Active Cashfree instances & elements for the currently selected method.
  const cashfreeInstanceRef = useRef(null)
  const activeComponentsRef = useRef({})
  const selectedPaymentComponentRef = useRef(null)
  const cashfreeOrderRequestRef = useRef(null)
  const cashfreeRetryingRef = useRef(false)
  const paying = useRef(false)

  // Device capability detection (Android / iOS / Desktop)
  const device = useMemo(() => getDeviceCapabilities(), [])

  const activeProvider = bookingState.booking?.paymentProviderMode || bookingState.booking?.paymentProvider || 'cashfree'
  const isCashfreeActive = activeProvider === 'cashfree'
  const cashfreeConfiguredForBooking = Boolean(bookingState.booking?.cashfreeConfigured)

  // Preload Cashfree SDK immediately on mount
  useEffect(() => {
    void loadCashfreeSdk()
  }, [])

  const refreshPaymentStatus = useCallback(async () => {
    setPaymentError('')
    try {
      let booking = await getBookingEnquiry(requestId)
      if (booking.paymentStatus !== 'paid') {
        if (
          booking.paymentProviderMode === 'cashfree' ||
          booking.paymentProvider === 'cashfree' ||
          booking.cfOrderId ||
          booking.cfPaymentSessionId
        ) {
          try {
            const status = await checkCashfreePaymentStatus(requestId)
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
  }, [requestId])

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
  }, [bookingState.booking?.paymentStatus, refreshPaymentStatus, requestId])

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
      return undefined
    }

    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) setIsOrderLoading(true)
    })

    const returnUrl = window.location.protocol === 'https:'
      ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
      : ''

    requestCashfreeOrderOnce(cashfreeOrderRequestRef, requestId, returnUrl)
      .then((order) => {
        if (controller.signal.aborted) return
        if (order.alreadyPaid) {
          setBookingState({ requestId, status: 'ready', booking: order.booking, error: '' })
          return
        }
        setCashfreeOrder(order)
        setPaymentError('')
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
        if (controller.signal.aborted) return
        console.error('[Cashfree Order Error]', err)
        setPaymentError(err instanceof Error ? err.message : 'Could not prepare payment channels.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsOrderLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [isCashfreeActive, bookingState.status, bookingState.booking, requestId, cashfreeOrder])


  // =========================================================================
  // DYNAMIC UPI AUTO-POLLING (QR CONFIRMATION)
  // =========================================================================
  useEffect(() => {
    if (
      !isCashfreeActive ||
      selectedMethod !== 'upiQr' ||
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
  // CASHFREE ELEMENT MOUNTING
  // Only the selected method is mounted. Cards require all four secure fields.
  // =========================================================================
  useEffect(() => {
    if (!cashfreeOrder?.payment_session_id || !isCashfreeActive) return undefined

    const elementController = new AbortController()
    queueMicrotask(() => {
      if (!elementController.signal.aborted) {
        setIsElementReady(false)
        setElementLoadError('')
      }
    })
    unmountCashfreeComponents(activeComponentsRef, selectedPaymentComponentRef, cashfreeInstanceRef)

    const selectedUpiApp = cashfreeUpiApps[selectedMethod]
    if (selectedUpiApp && (device.isAndroidWebView || (!device.isAndroid && !device.isIOS))) {
      const errorMsg = device.isAndroidWebView
        ? `${selectedUpiApp.name} app handoff is not supported inside this Android WebView. Use Other UPI · QR instead.`
        : `${selectedUpiApp.name} app handoff is only available on a supported mobile browser. Use Other UPI · QR on this device.`
      queueMicrotask(() => {
        if (!elementController.signal.aborted) setElementLoadError(errorMsg)
      })
      return () => {
        elementController.abort()
        unmountCashfreeComponents(activeComponentsRef, selectedPaymentComponentRef, cashfreeInstanceRef)
      }
    }

    loadCashfreeSdk().then((loaded) => {
      if (elementController.signal.aborted || !loaded || typeof window.Cashfree !== 'function') {
        if (!elementController.signal.aborted) setElementLoadError('Payment interface could not connect. Check internet access.')
        return
      }
      try {
        const mode = cashfreeOrder.environment === 'production' ? 'production' : 'sandbox'
        const cf = window.Cashfree({ mode })
        cashfreeInstanceRef.current = cf

        const readyComponents = new Set()
        const requiredComponents = selectedMethod === 'card'
          ? ['cardNumber', 'cardExpiry', 'cardCvv', 'cardHolder']
          : [selectedUpiApp ? 'upiApp' : selectedMethod]

        const mountComponent = (componentName, options, selector) => {
          const component = cf.create(componentName, options)
          activeComponentsRef.current[componentName] = component
          component.on('ready', () => {
            if (elementController.signal.aborted) return
            readyComponents.add(componentName)
            if (requiredComponents.every((name) => readyComponents.has(name))) {
              setIsElementReady(true)
            }
          })
          component.on('loaderror', (event) => {
            if (elementController.signal.aborted) return
            setIsElementReady(false)
            setElementLoadError(event?.error?.message || `Failed to load ${componentName}.`)
          })
          component.mount(selector)
          return component
        }

        if (selectedMethod === 'upiQr') {
          selectedPaymentComponentRef.current = mountComponent(
            'upiQr',
            { values: { size: '220px' } },
            '#vibetogether-cf-upi-qr',
          )
        } else if (selectedUpiApp) {
          selectedPaymentComponentRef.current = mountComponent(
            'upiApp',
            {
              values: {
                upiApp: selectedUpiApp.id,
                buttonText: selectedUpiApp.name,
                buttonIcon: true,
              },
              style: {
                base: {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(199, 125, 255, 0.35)',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  fontWeight: '700',
                  padding: '12px 16px',
                },
              },
            },
            `#${selectedUpiApp.selector}`,
          )
        } else if (selectedMethod === 'card') {
          selectedPaymentComponentRef.current = mountComponent(
            'cardNumber',
            { values: { placeholder: 'Enter card number' } },
            '#vibetogether-cf-card-number',
          )
          mountComponent('cardExpiry', {}, '#vibetogether-cf-card-expiry')
          mountComponent('cardCvv', {}, '#vibetogether-cf-card-cvv')
          mountComponent('cardHolder', {}, '#vibetogether-cf-card-holder')
        }
      } catch (err) {
        if (!elementController.signal.aborted) {
          console.error('[Cashfree Element Mount Exception]', err)
          setElementLoadError(err instanceof Error ? err.message : 'Could not load the payment element.')
        }
      }
    })

    return () => {
      elementController.abort()
      unmountCashfreeComponents(activeComponentsRef, selectedPaymentComponentRef, cashfreeInstanceRef)
    }
  }, [cashfreeOrder?.environment, cashfreeOrder?.payment_session_id, device.isAndroid, device.isAndroidWebView, device.isIOS, isCashfreeActive, selectedMethod])

  // =========================================================================
  // CASHFREE PAYMENT HANDLER
  // QR, UPI app intent, and Cards use the documented custom Elements pay() contract.
  // =========================================================================
  function getCashfreeReturnUrl() {
    return window.location.protocol === 'https:'
      ? `${window.location.origin}/booking/payment/${encodeURIComponent(requestId)}?order_id={order_id}`
      : ''
  }

  async function reconcileCashfreeSdkError(sdkError, orderId) {
    const errorCode = sdkError?.code || sdkError?.type || ''
    const wasCancelled = ['USER_DROPPED', 'CHECKOUT_CANCELLED', 'PAYMENT_CANCELLED'].includes(errorCode)
    let reconciledBooking = null

    try {
      const statusResult = await checkCashfreePaymentStatus(requestId)
      reconciledBooking = statusResult?.booking || null
      if (reconciledBooking) {
        setBookingState({ requestId, status: 'ready', booking: reconciledBooking, error: '' })
        setPaymentUncertain(Boolean(statusResult.pending) || isRecentProcessing(reconciledBooking))
      }
    } catch {
      setPaymentUncertain(true)
    }

    if (['paid', 'demo_paid'].includes(reconciledBooking?.paymentStatus)) {
      return
    }

    if (reconciledBooking?.paymentStatus === 'failed') {
      if (!wasCancelled) {
        try {
          const failureResult = await recordCashfreePaymentFailure(requestId, {
            orderId,
            outcome: 'failed',
          })
          if (failureResult?.booking) {
            setBookingState({ requestId, status: 'ready', booking: failureResult.booking, error: '' })
          }
        } catch {
          // The reconciled provider state remains authoritative if recording fails.
        }
      }
      setPaymentUncertain(false)
      setPaymentError(wasCancelled
        ? 'Payment was cancelled. Your booking is still safe; choose another payment method.'
        : 'Payment was not completed. Please try again or choose another payment method.')
      return
    }

    setPaymentError(wasCancelled
      ? 'Payment cancellation is being checked. Please wait for Cashfree confirmation before trying again.'
      : 'Payment confirmation is pending. Please wait or recheck status before trying again.')
  }

  async function handleCashfreePay() {
    if (!requestId) {
      setPaymentError('Invalid booking identifier. Please return to the booking steps.')
      return
    }
    if (isPaying || paying.current || paymentUncertain) return
    paying.current = true
    setIsPaying(true)
    setPaymentError('')

    try {
      const sdkLoaded = await loadCashfreeSdk()
      if (!sdkLoaded || typeof window.Cashfree !== 'function') {
        throw new Error('Payment gateway could not be loaded. Please check your internet connection and try again.')
      }

      let currentOrder = cashfreeOrder
      const returnUrl = getCashfreeReturnUrl()

      if (!currentOrder?.payment_session_id) {
        currentOrder = await requestCashfreeOrderOnce(cashfreeOrderRequestRef, requestId, returnUrl)
        setCashfreeOrder(currentOrder)
        setPaymentError('Your secure payment session is ready. Press Pay again to continue.')
        return
      }

      if (currentOrder.alreadyPaid) {
        setBookingState({ requestId, status: 'ready', booking: currentOrder.booking, error: '' })
        return
      }

      const paymentMethod = selectedPaymentComponentRef.current
      if (!paymentMethod || !isElementReady) {
        throw new Error('The selected Cashfree payment element is still loading. Please wait and try again.')
      }

      if (selectedMethod === 'card') {
        const requiredCardComponents = ['cardNumber', 'cardExpiry', 'cardCvv', 'cardHolder']
        const incompleteCardComponent = requiredCardComponents.find((name) => {
          const component = activeComponentsRef.current[name]
          return !component || typeof component.isComplete !== 'function' || !component.isComplete()
        })
        if (incompleteCardComponent) {
          throw new Error('Complete all card fields before pressing Pay.')
        }
      } else if (typeof paymentMethod.isComplete === 'function' && !paymentMethod.isComplete()) {
        throw new Error('Complete the selected Cashfree payment element before pressing Pay.')
      }

      const mode = currentOrder.environment === 'production' ? 'production' : 'sandbox'
      const cf = cashfreeInstanceRef.current || window.Cashfree({ mode })
      cashfreeInstanceRef.current = cf
      const paymentOptions = {
        paymentMethod,
        paymentSessionId: currentOrder.payment_session_id,
        redirect: 'if_required',
      }
      if (returnUrl) paymentOptions.returnUrl = returnUrl

      const paymentResult = await cf.pay(paymentOptions)
      if (paymentResult?.error) {
        await reconcileCashfreeSdkError(paymentResult.error, currentOrder.order_id)
        return
      }

      // SDK results are provisional. Only the existing backend verification can mark the booking paid.
      const verifyResult = await verifyCashfreePayment(requestId, { order_id: currentOrder.order_id })
      setBookingState({ requestId, status: 'ready', booking: verifyResult.booking, error: '' })
      setPaymentUncertain(Boolean(verifyResult.pending) || isRecentProcessing(verifyResult.booking))
      if (verifyResult.pending || !['paid', 'demo_paid'].includes(verifyResult.booking?.paymentStatus)) {
        setPaymentError('Payment was submitted. Cashfree is still confirming the result; please wait or recheck status.')
      }
    } catch (error) {
      console.error('[Cashfree Pay Error]', error)
      setPaymentError(error instanceof Error ? error.message : 'Payment could not be started. Please try again.')
      void refreshPaymentStatus()
    } finally {
      paying.current = false
      setIsPaying(false)
    }
  }

  // Alias retained for the existing payment button call sites.
  async function handleExecuteCustomPayment() { return handleCashfreePay() }

  async function prepareCashfreeRetry() {
    if (cashfreeRetryingRef.current || isPaying || paying.current || paymentUncertain) return

    cashfreeRetryingRef.current = true
    setPaymentError('Rechecking Cashfree payment status before retrying…')

    try {
      const statusResult = await checkCashfreePaymentStatus(requestId)
      const reconciledBooking = statusResult?.booking

      if (!reconciledBooking) {
        throw new Error('Payment status could not be verified. Check again before retrying.')
      }

      setBookingState({ requestId, status: 'ready', booking: reconciledBooking, error: '' })

      if (['paid', 'demo_paid'].includes(reconciledBooking.paymentStatus)) {
        setPaymentUncertain(false)
        setPaymentError('')
        return
      }

      const paymentPending = Boolean(statusResult.pending) ||
        reconciledBooking.paymentStatus === 'processing' ||
        isRecentProcessing(reconciledBooking)
      if (paymentPending) {
        setPaymentUncertain(true)
        setPaymentError('Payment confirmation is still pending. Please recheck status before retrying.')
        return
      }

      if (!['failed', 'unpaid'].includes(reconciledBooking.paymentStatus)) {
        setPaymentUncertain(true)
        setPaymentError('Payment status could not be safely reconciled. Please recheck before retrying.')
        return
      }

      unmountCashfreeComponents(activeComponentsRef, selectedPaymentComponentRef, cashfreeInstanceRef)
      setIsElementReady(false)
      setElementLoadError('')
      setPaymentUncertain(false)
      setPaymentError('Preparing a new secure payment session…')
      navigate(`/booking/payment/${encodeURIComponent(requestId)}?retry=1`, { replace: true })
      setCashfreeOrder(null)
    } catch (error) {
      setPaymentUncertain(true)
      setPaymentError(
        error instanceof Error
          ? error.message
          : 'Payment status could not be verified. Check again before retrying.',
      )
    } finally {
      cashfreeRetryingRef.current = false
    }
  }


  function handleTryPaymentAgain() {
    setPaymentError('')

    if (isCashfreeActive) {
      void prepareCashfreeRetry()
      return
    }

    setPaymentError('Cashfree checkout is not available for this booking. Please contact support.')
  }

  function handleCopyReference() {
    if (!booking?.reference) return
    navigator.clipboard?.writeText(booking.reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2400)
  }

  function handleBackToDetails() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/booking')
  }

  const currentBookingState = bookingState.requestId === requestId
    ? bookingState
    : { status: 'loading', booking: null, error: '' }
  const booking = currentBookingState.booking
  const matchedEvent = useMemo(() => {
    const rawEventTitle = typeof booking?.event === 'string'
      ? booking.event
      : booking?.event?.title
    const eventTitle = typeof rawEventTitle === 'string'
      ? rawEventTitle.trim().toLocaleLowerCase()
      : ''
    return eventTitle
      ? publicEvents.find((event) => (
        typeof event.title === 'string' &&
        event.title.trim().toLocaleLowerCase() === eventTitle
      )) ?? null
      : null
  }, [booking?.event, publicEvents])
  const formattedEventDate = matchedEvent ? formatEventDate(matchedEvent.date) : ''
  const matchedEventTime = typeof matchedEvent?.time === 'string' ? matchedEvent.time : ''
  const matchedEventLocation = typeof matchedEvent?.location === 'string' ? matchedEvent.location : ''
  const displayEventName = matchedEvent?.title ||
    (typeof booking?.event === 'string' ? booking.event : '') ||
    booking?.category ||
    'Vibe Together Experience'
  const isPaid = ['demo_paid', 'paid'].includes(booking?.paymentStatus) && Boolean(booking?.reference)
  const isUpiPayment = Boolean(booking) && !isPaid && (
    booking.paymentProvider === 'upi' ||
    booking.paymentProviderMode === 'upi'
  )
  const isGatewayConfigured = cashfreeConfiguredForBooking
  const isDemoPayment = !isGatewayConfigured && !isUpiPayment
  const isPaymentFailed =
    booking?.paymentStatus === 'failed' &&
    booking?.paymentProvider !== 'upi' &&
    !isUpiPayment
  const isTerminalFailed = Boolean(
    isPaymentFailed &&
    !paymentUncertain &&
    booking?.paymentFailureReason !== 'cancelled' &&
    booking?.cfPaymentStatus !== 'USER_DROPPED'
  )
  const isCancelledView = Boolean(
    isPaymentFailed &&
    !paymentUncertain &&
    (booking?.paymentFailureReason === 'cancelled' || booking?.cfPaymentStatus === 'USER_DROPPED') &&
    searchParams.get('retry') !== '1'
  )
  const isVerifying = paymentUncertain || isRecentProcessing(booking)
  const bookingLabel = booking?.status === 'confirmed' ? 'Approved' : 'Pending Approval'

  // Pricing calculations
  const ticketQuantity = booking?.ticketQuantity ?? 1
  const ticketTypeName = booking?.ticketTypeName || 'General Admission'
  const pricePerTicket = Number.isFinite(Number(booking?.pricePerTicket))
    ? Number(booking.pricePerTicket)
    : 199
  const subtotal = resolveBookingSubtotal(
    booking?.subtotal,
    pricePerTicket,
    ticketQuantity,
  )
  const finalPayable = ticketQuantity > 1
    ? pricePerTicket * ticketQuantity
    : (Number.isFinite(Number(booking?.paymentAmount))
      ? Number(booking.paymentAmount)
      : subtotal)
  const isDiwali = Boolean(booking?.diwaliOfferApplied)
  const discount = booking?.discount ?? 0
  const memberDetails = getBookingMembers(booking)
  const selectedUpiApp = cashfreeUpiApps[selectedMethod]

  return (
    <main className="booking-payment">
      {/* Cinematic ambient background glow accents */}
      <div className="booking-payment__glow-orb booking-payment__glow-orb--top" aria-hidden="true" />
      <div className="booking-payment__glow-orb booking-payment__glow-orb--bottom" aria-hidden="true" />

      <div className="booking-payment__container">
        <header className="booking-payment__topbar">
          <Link className="booking-payment__brand-link" to="/" aria-label="VibeTogether home">
            <img
              src="/assets/optimized/favicon-256-v1.webp"
              alt=""
              width="42"
              height="42"
            />
            <span>VibeTogether</span>
          </Link>
          <div className="booking-payment__topbar-right">
            {!isPaid && !isTerminalFailed && (
              <button
                className="booking-payment__back-button"
                onClick={handleBackToDetails}
                type="button"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
            )}
            <span className="booking-payment__tagline">Music <i /> Events <i /> Together</span>
          </div>
        </header>

        {!isPaid && !isTerminalFailed && !isCancelledView && currentBookingState.status === 'ready' && (
          <section className="booking-payment__hero">
            <div className="booking-payment__secure-badge">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Secure &amp; Encrypted Payment</span>
            </div>
            <h1>Complete Your Payment</h1>
            <p>Your booking is almost done! Choose a payment method to confirm your tickets.</p>
          </section>
        )}

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
                Your spot for <strong>{displayEventName}</strong> is officially reserved.
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
                      {displayEventName}
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
                      ₹{finalPayable}
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
              <Link className="booking-payment__btn booking-payment__btn--primary" to={`/booking/confirmation/${encodeURIComponent(requestId)}`}>
                <Ticket size={18} aria-hidden="true" />
                <span>View Full Ticket &amp; Confirmation</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="booking-payment__btn booking-payment__btn--ghost" to="/">
                <span>Back to Homepage</span>
              </Link>
            </div>
          </div>
        ) : isTerminalFailed ? (
          /* =========================================================================
             SIMPLE PAYMENT FAILED SCREEN (CONFIRMED TERMINAL FAILURE)
             ========================================================================= */
          <div className="booking-payment__state-card booking-payment__state-card--failure" role="alert">
            <div className="booking-payment__failure-beacon" aria-hidden="true">
              <XCircle size={44} className="booking-payment__failure-icon" />
            </div>
            <h1 className="booking-payment__state-title">Payment Failed</h1>
            <p className="booking-payment__state-desc">Your payment could not be completed.</p>
            <div className="booking-payment__failure-cta-wrap">
              <Link to="/" className="booking-payment__btn booking-payment__btn--primary booking-payment__return-home-btn">
                Return Home
              </Link>
            </div>
          </div>
        ) : isCancelledView ? (
          /* =========================================================================
             USER CANCELLED STATE
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
                <strong>{displayEventName}</strong>
              </div>
              <div className="booking-payment__held-row">
                <span>Passes:</span>
                <strong>{ticketTypeName} × {ticketQuantity}</strong>
              </div>
              <div className="booking-payment__held-row">
                <span>Payable Amount:</span>
                <strong className="booking-payment__held-amount">₹{finalPayable}</strong>
              </div>
            </div>

            <div className="booking-payment__failure-cta-wrap">
              <button
                type="button"
                className="booking-payment__btn booking-payment__btn--primary booking-payment__btn--pulse"
                onClick={handleTryPaymentAgain}
              >
                <RefreshCw size={18} aria-hidden="true" />
                <span>TRY PAYMENT AGAIN · ₹{finalPayable}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <div className="booking-payment__failure-sublinks">
                <Link className="booking-payment__link-inline" to="/">Return to home</Link>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             STEP 5: LUXURY TWO-COLUMN PAYMENT PAGE (BRANDED CUSTOM CHECKOUT)
             ========================================================================= */
          <div className="booking-payment__checkout-shell">
            {/* Main Two-Column Layout */}
            <div className="booking-payment__layout">
              {/* ===================================================================
                 LEFT COLUMN: BOOKING SUMMARY
                 =================================================================== */}
              <section className="booking-payment__card booking-payment__summary-card" aria-labelledby="summary-heading">
                <div className="booking-payment__card-header">
                  <span className="booking-payment__meta-badge">BOOKING SUMMARY</span>
                  <h2 id="summary-heading" className="booking-payment__card-title">Order Details</h2>
                </div>

                {matchedEvent?.image && (
                  <div className="booking-payment__event-poster">
                    <img
                      src={matchedEvent.image}
                      alt={matchedEvent.imageAlt || displayEventName}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}

                <div className="booking-payment__summary-event-info">
                  <span className="booking-payment__event-category-badge">
                    {matchedEvent?.category || booking.category || 'Live Experience'}
                  </span>
                  <h3 className="booking-payment__summary-event-name">{displayEventName}</h3>
                  {matchedEvent?.description && (
                    <p className="booking-payment__summary-event-desc">{matchedEvent.description}</p>
                  )}

                  <div className="booking-payment__summary-meta-row">
                    {formattedEventDate && (
                      <span className="booking-payment__meta-item">
                        <Calendar size={14} aria-hidden="true" />
                        {formattedEventDate}
                      </span>
                    )}
                    {matchedEventTime && (
                      <span className="booking-payment__meta-item">
                        {matchedEventTime}
                      </span>
                    )}
                    {matchedEventLocation && (
                      <span className="booking-payment__meta-item">
                        {matchedEventLocation}
                      </span>
                    )}
                  </div>
                </div>

                <div className="booking-payment__pricing-ledger">
                  <div className="booking-payment__ledger-row">
                    <span className="booking-payment__ledger-name">Number of tickets</span>
                    <span className="booking-payment__ledger-val">{ticketQuantity} ticket(s)</span>
                  </div>
                  <div className="booking-payment__ledger-row">
                    <span className="booking-payment__ledger-name">Price per ticket</span>
                    <span className="booking-payment__ledger-val">₹{pricePerTicket}</span>
                  </div>
                  <div className="booking-payment__ledger-row">
                    <span className="booking-payment__ledger-name">Total amount</span>
                    <span className="booking-payment__ledger-val">₹{subtotal}</span>
                  </div>
                  {(discount > 0 || isDiwali) && (
                    <div className="booking-payment__ledger-row booking-payment__ledger-row--discount">
                      <span className="booking-payment__discount-tag">
                        <Sparkles size={13} aria-hidden="true" /> Offer Savings
                      </span>
                      <span className="booking-payment__discount-amount">−₹{discount}</span>
                    </div>
                  )}
                  <div className="booking-payment__ledger-divider" aria-hidden="true" />
                  <div className="booking-payment__ledger-total-row">
                    <div>
                      <span className="booking-payment__total-caption">FINAL PAYABLE AMOUNT</span>
                      <span className="booking-payment__total-subcaption">Inclusive of all taxes &amp; entry</span>
                    </div>
                    <strong className="booking-payment__final-amount">₹{finalPayable}</strong>
                  </div>
                </div>
              </section>

              {/* ===================================================================
                 RIGHT COLUMN: PAYMENT METHOD
                 =================================================================== */}
              <section className="booking-payment__card booking-payment__methods-column" aria-labelledby="payment-heading">
                <div className="booking-payment__card-header">
                  <span className="booking-payment__meta-badge">PAYMENT METHOD</span>
                  <h2 id="payment-heading" className="booking-payment__card-title">Choose Payment Option</h2>
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
                  <div className="booking-payment__custom-cashfree-shell">
                    {/* Method Selector Cards */}
                    <div className="booking-payment__methods-list" role="radiogroup" aria-label="Payment Methods">
                      {/* 1. UPI Payment */}
                      <div
                        className={`booking-payment__method-card${['upi', 'upiQr'].includes(selectedMethod) ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelectedMethod('upiQr')
                          setPaymentError('')
                        }}
                        role="radio"
                        aria-checked={['upi', 'upiQr'].includes(selectedMethod)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            setSelectedMethod('upiQr')
                            setPaymentError('')
                          }
                        }}
                      >
                        <div className="booking-payment__method-head">
                          <span className="booking-payment__radio-indicator">
                            {['upi', 'upiQr'].includes(selectedMethod) && <span className="booking-payment__radio-dot" />}
                          </span>
                          <div className="booking-payment__method-title-wrap">
                            <span className="booking-payment__method-name">UPI Payment</span>
                            <span className="booking-payment__method-desc">Instant payment via any UPI app (Google Pay, PhonePe, Paytm, CRED)</span>
                          </div>
                          <span className="booking-payment__method-badge">RECOMMENDED</span>
                        </div>

                        {['upi', 'upiQr'].includes(selectedMethod) && (
                          <div className="booking-payment__method-content" onClick={(e) => e.stopPropagation()}>
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
                                  disabled={isPaying || !isElementReady}
                                  onClick={handleExecuteCustomPayment}
                                >
                                  {isPaying ? (
                                    <>
                                      <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                      <span>Starting UPI QR…</span>
                                    </>
                                  ) : (
                                    <>
                                      <LockKeyhole size={16} aria-hidden="true" />
                                      <span>PAY ₹{finalPayable} WITH UPI QR</span>
                                      <ArrowRight size={16} aria-hidden="true" />
                                    </>
                                  )}
                                </button>
                                <span className="booking-payment__auto-poll-hint">
                                  <Sparkles size={13} aria-hidden="true" />
                                  Scan the QR, approve in your UPI app, then wait for server confirmation.
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Credit / Debit Card */}
                      <div
                        className={`booking-payment__method-card${selectedMethod === 'card' ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelectedMethod('card')
                          setPaymentError('')
                        }}
                        role="radio"
                        aria-checked={selectedMethod === 'card'}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            setSelectedMethod('card')
                            setPaymentError('')
                          }
                        }}
                      >
                        <div className="booking-payment__method-head">
                          <span className="booking-payment__radio-indicator">
                            {selectedMethod === 'card' && <span className="booking-payment__radio-dot" />}
                          </span>
                          <div className="booking-payment__method-title-wrap">
                            <span className="booking-payment__method-name">Credit / Debit Card</span>
                            <span className="booking-payment__method-desc">Visa, MasterCard, RuPay, Maestro accepted</span>
                          </div>
                          <span className="booking-payment__method-badge">SECURE ELEMENTS</span>
                        </div>

                        {selectedMethod === 'card' && (
                          <div className="booking-payment__method-content" onClick={(e) => e.stopPropagation()}>
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

                              <div className="booking-payment__cf-inline-warning" role="note">
                                <Info size={16} aria-hidden="true" />
                                <span>Card details stay inside Cashfree Elements. Your issuer may require 3DS authentication.</span>
                              </div>

                              <button
                                type="button"
                                className="booking-payment__cf-submit-btn"
                                disabled={isPaying || !isElementReady}
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
                                    <span>PAY ₹{finalPayable} VIA CARD</span>
                                    <ArrowRight size={16} aria-hidden="true" />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Net Banking */}
                      <div
                        className={`booking-payment__method-card${selectedMethod === 'netbanking' ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelectedMethod('netbanking')
                          setPaymentError('')
                        }}
                        role="radio"
                        aria-checked={selectedMethod === 'netbanking'}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            setSelectedMethod('netbanking')
                            setPaymentError('')
                          }
                        }}
                      >
                        <div className="booking-payment__method-head">
                          <span className="booking-payment__radio-indicator">
                            {selectedMethod === 'netbanking' && <span className="booking-payment__radio-dot" />}
                          </span>
                          <div className="booking-payment__method-title-wrap">
                            <span className="booking-payment__method-name">Net Banking</span>
                            <span className="booking-payment__method-desc">All major Indian banks supported (SBI, HDFC, ICICI, Axis, Kotak)</span>
                          </div>
                        </div>

                        {selectedMethod === 'netbanking' && (
                          <div className="booking-payment__method-content" onClick={(e) => e.stopPropagation()}>
                            <div className="booking-payment__bank-list-preview">
                              <span className="booking-payment__bank-chip">State Bank of India</span>
                              <span className="booking-payment__bank-chip">HDFC Bank</span>
                              <span className="booking-payment__bank-chip">ICICI Bank</span>
                              <span className="booking-payment__bank-chip">Axis Bank</span>
                              <span className="booking-payment__bank-chip">Kotak Mahindra</span>
                              <span className="booking-payment__bank-chip">+ 40 More Banks</span>
                            </div>
                            <div className="booking-payment__cf-inline-warning" role="note">
                              <Info size={16} aria-hidden="true" />
                              <span>For fastest 0-wait instant ticket issuing, UPI Payment or Cards are processed in 0 seconds.</span>
                            </div>
                            <button
                              type="button"
                              className="booking-payment__cf-submit-btn"
                              onClick={() => setSelectedMethod('upiQr')}
                            >
                              <span>Use Instant UPI Payment instead</span>
                              <ArrowRight size={16} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 4. Wallets */}
                      <div
                        className={`booking-payment__method-card${selectedMethod === 'wallet' ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelectedMethod('wallet')
                          setPaymentError('')
                        }}
                        role="radio"
                        aria-checked={selectedMethod === 'wallet'}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            setSelectedMethod('wallet')
                            setPaymentError('')
                          }
                        }}
                      >
                        <div className="booking-payment__method-head">
                          <span className="booking-payment__radio-indicator">
                            {selectedMethod === 'wallet' && <span className="booking-payment__radio-dot" />}
                          </span>
                          <div className="booking-payment__method-title-wrap">
                            <span className="booking-payment__method-name">Wallets</span>
                            <span className="booking-payment__method-desc">Paytm, PhonePe, Mobikwik &amp; Amazon Pay</span>
                          </div>
                        </div>

                        {selectedMethod === 'wallet' && (
                          <div className="booking-payment__method-content" onClick={(e) => e.stopPropagation()}>
                            <div className="booking-payment__bank-list-preview">
                              <span className="booking-payment__bank-chip">Paytm Wallet</span>
                              <span className="booking-payment__bank-chip">PhonePe Wallet</span>
                              <span className="booking-payment__bank-chip">Mobikwik</span>
                              <span className="booking-payment__bank-chip">Amazon Pay</span>
                            </div>
                            <div className="booking-payment__cf-inline-warning" role="note">
                              <Info size={16} aria-hidden="true" />
                              <span>UPI QR is universally supported by all wallet apps.</span>
                            </div>
                            <button
                              type="button"
                              className="booking-payment__cf-submit-btn"
                              onClick={() => setSelectedMethod('upiQr')}
                            >
                              <span>Pay via UPI QR · ₹{finalPayable}</span>
                              <ArrowRight size={16} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 5. Other UPI Apps */}
                      <div
                        className={`booking-payment__method-card${['otherUpi', 'phonepe', 'gpay', 'paytm'].includes(selectedMethod) ? ' is-active' : ''}`}
                        onClick={() => {
                          setSelectedMethod('phonepe')
                          setPaymentError('')
                        }}
                        role="radio"
                        aria-checked={['otherUpi', 'phonepe', 'gpay', 'paytm'].includes(selectedMethod)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            setSelectedMethod('phonepe')
                            setPaymentError('')
                          }
                        }}
                      >
                        <div className="booking-payment__method-head">
                          <span className="booking-payment__radio-indicator">
                            {['otherUpi', 'phonepe', 'gpay', 'paytm'].includes(selectedMethod) && <span className="booking-payment__radio-dot" />}
                          </span>
                          <div className="booking-payment__method-title-wrap">
                            <span className="booking-payment__method-name">Other UPI Apps</span>
                            <span className="booking-payment__method-desc">Direct mobile app handoff via PhonePe, Google Pay, or Paytm</span>
                          </div>
                        </div>

                        {['otherUpi', 'phonepe', 'gpay', 'paytm'].includes(selectedMethod) && (
                          <div className="booking-payment__method-content" onClick={(e) => e.stopPropagation()}>
                            <div className="booking-payment__upi-apps-selector">
                              {Object.entries(cashfreeUpiApps).map(([appKey, app]) => {
                                const isThisApp = selectedMethod === appKey
                                return (
                                  <button
                                    key={appKey}
                                    type="button"
                                    className={`booking-payment__upi-app-btn${isThisApp ? ' is-active' : ''}`}
                                    onClick={() => {
                                      setSelectedMethod(appKey)
                                      setPaymentError('')
                                    }}
                                  >
                                    <Smartphone size={16} aria-hidden="true" />
                                    <span>{app.name}</span>
                                  </button>
                                )
                              })}
                            </div>

                            {selectedUpiApp && (
                              <div className="booking-payment__intent-card">
                                {device.isAndroid && (
                                  <a
                                    className="booking-payment__direct-app-link"
                                    href={
                                      selectedMethod === 'phonepe'
                                        ? createPhonePePaymentIntent(
                                          { ...booking, paymentAmount: finalPayable },
                                            window.location.href,
                                          )
                                        : selectedMethod === 'gpay'
                                          ? createGooglePayPaymentIntent(
                                            { ...booking, paymentAmount: finalPayable },
                                              window.location.href,
                                            )
                                          : createPaytmPaymentIntent(
                                            { ...booking, paymentAmount: finalPayable },
                                              window.location.href,
                                            )
                                    }
                                  >
                                    <Smartphone size={16} aria-hidden="true" />
                                    Open in {selectedUpiApp.name}
                                  </a>
                                )}
                                <div id={selectedUpiApp.selector} className="booking-payment__cf-app-mount" />
                                <button
                                  type="button"
                                  className={`booking-payment__cf-submit-btn booking-payment__cf-submit-btn--${selectedMethod}`}
                                  disabled={isPaying || !isElementReady || paymentUncertain}
                                  onClick={handleExecuteCustomPayment}
                                >
                                  {isPaying ? (
                                    <>
                                      <LoaderCircle className="booking-payment__btn-spinner" size={17} aria-hidden="true" />
                                      <span>Opening {selectedUpiApp.name}…</span>
                                    </>
                                  ) : (
                                    <>
                                      <Smartphone size={16} aria-hidden="true" />
                                      <span>PAY ₹{finalPayable} VIA {selectedUpiApp.name.toUpperCase()}</span>
                                      <ArrowRight size={16} aria-hidden="true" />
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trust Guarantees */}
                    <div className="booking-payment__trust-footer">
                      <div className="booking-payment__trust-item">
                        <ShieldCheck size={16} aria-hidden="true" />
                        <span>Your payment is 100% secure and encrypted</span>
                      </div>
                      <div className="booking-payment__trust-sub">
                        <span>PCI-DSS Level 1</span>
                        <span>•</span>
                        <span>256-Bit SSL</span>
                        <span>•</span>
                        <span>Cashfree Payments</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="booking-payment__unavailable-block" role="status">
                    <LockKeyhole size={20} aria-hidden="true" />
                    <p>Online checkout is unavailable for this booking. Your booking details are safely saved.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
