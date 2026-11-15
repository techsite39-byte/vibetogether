import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Clipboard,
  Download,
  LoaderCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getBookingEnquiry,
  submitUpiPayment,
} from '../services/bookingEnquiryPayment.js'
import {
  createPhonePePaymentIntent,
  createGooglePayPaymentIntent,
  createPaytmPaymentIntent,
  createUpiPaymentIntent,
} from '../services/upiPaymentIntent.js'
import { rememberBookingReference } from '../utils/bookingStorage.js'
import './UpiPayment.css'

const qrImageUrl = '/assets/folder/qr_files/qr.png'

function formatAmount(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount ?? 0)
}

function copyTextFallback(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

export default function UpiPayment({ booking: initialBooking, bookingRequestId }) {
  const [booking, setBooking] = useState(initialBooking)
  const [submitError, setSubmitError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [storageWarning, setStorageWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [utr, setUtr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrImageError, setQrImageError] = useState(false)
  const [showUtrForm, setShowUtrForm] = useState(false)
  const [hasLaunchedUpi, setHasLaunchedUpi] = useState(false)
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isAndroid = /Android/i.test(userAgent)

  const refreshBooking = useCallback(async () => {
    setRefreshError('')
    try {
      const currentBooking = await getBookingEnquiry(bookingRequestId)
      setBooking(currentBooking)
      return currentBooking
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Payment status could not be refreshed.')
      return null
    }
  }, [bookingRequestId])

  const isSubmitted = booking?.upiPayment?.status === 'Submitted for Verification'

  useEffect(() => {
    try {
      rememberBookingReference(bookingRequestId)
    } catch (error) {
      setStorageWarning(error instanceof Error ? error.message : 'This device could not save your booking status link.')
    }
  }, [bookingRequestId])

  useEffect(() => {
    if (!isSubmitted) return undefined
    const timer = window.setInterval(() => {
      void refreshBooking()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [isSubmitted, refreshBooking])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && hasLaunchedUpi) {
        setShowUtrForm(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [hasLaunchedUpi])

  async function copyUpiId() {
    setNotice('')
    setSubmitError('')
    try {
      let copied = false
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(booking.upiId)
          copied = true
        } catch {
          copied = copyTextFallback(booking.upiId)
        }
      } else {
        copied = copyTextFallback(booking.upiId)
      }
      if (!copied) throw new Error('Clipboard access is unavailable.')
      setCopied(true)
      setNotice('UPI ID Copied')
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
      setSubmitError('Could not access the clipboard. Select and copy the UPI ID instead.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitError('')
    setRefreshError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await submitUpiPayment(bookingRequestId, utr)
      setBooking(result.booking)
      setUtr('')
      setNotice('Payment submitted. Awaiting verification.')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Payment details could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await refreshBooking()
    setRefreshing(false)
  }

  const isPaid = booking?.paymentStatus === 'paid' && Boolean(booking.reference)
  const isRejected = booking?.upiPayment?.status === 'Rejected'
  const hasValidAmount =
    typeof booking?.paymentAmount === 'number' &&
    Number.isFinite(booking.paymentAmount) &&
    booking.paymentAmount > 0
  const hasValidPayee =
    typeof booking?.upiId === 'string' &&
    Boolean(booking.upiId.trim()) &&
    typeof booking?.upiPayeeName === 'string' &&
    Boolean(booking.upiPayeeName.trim())
  const upiIntentUrl =
    booking && hasValidAmount && hasValidPayee
      ? createUpiPaymentIntent(booking)
      : ''
  const fallbackUrl =
    typeof window === 'undefined' ? null : new URL(window.location.href)
  fallbackUrl?.searchParams.set('upiFallback', '1')
  const phonePeIntentUrl =
    isAndroid && upiIntentUrl && fallbackUrl
      ? createPhonePePaymentIntent(booking, fallbackUrl.href)
      : ''
  const googlePayIntentUrl =
    isAndroid && upiIntentUrl && fallbackUrl
      ? createGooglePayPaymentIntent(booking, fallbackUrl.href)
      : ''
  const paytmIntentUrl =
    isAndroid && upiIntentUrl && fallbackUrl
      ? createPaytmPaymentIntent(booking, fallbackUrl.href)
      : ''
  const phonePeFallbackNotice =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('upiFallback') === '1'

  return (
    <section className="upi-payment" aria-label="UPI payment">
      {isPaid ? (
        <div className="upi-payment__submitted" role="status">
          <h3>Payment Verified — Booking Confirmed</h3>
          <Link className="upi-payment__button" to={`/booking/confirmation/${encodeURIComponent(booking.reference)}`}>
            View confirmed booking
          </Link>
        </div>
      ) : isSubmitted ? (
        <div className="upi-payment__submitted" role="status">
          <h3>Pending Verification</h3>
          <p>Payment submitted. Awaiting verification.</p>
          <p><span>Submitted UTR</span> <strong>{booking.upiPayment.utr}</strong></p>
          {refreshError && <p className="upi-payment__error" role="alert">{refreshError}</p>}
          <button
            type="button"
            className="upi-payment__button upi-payment__button--secondary"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {refreshing ? 'Checking…' : 'Refresh status'}
          </button>
        </div>
      ) : (
        <>
          {isRejected && (
            <div className="upi-payment__rejected" role="alert">
              <strong>Payment Not Verified</strong>
              <span>{booking.upiPayment.rejectionReason || 'Please contact support before making another payment.'}</span>
            </div>
          )}

          {phonePeFallbackNotice && (
            <p className="upi-payment__notice" role="status">
              The selected UPI app could not be opened. Choose another app or scan the QR code.
            </p>
          )}
          {(!hasValidAmount || !hasValidPayee) && (
            <p className="upi-payment__error" role="alert">
              Verified payment details are unavailable. Refresh the booking before paying.
            </p>
          )}

          <div className="upi-payment__qr-panel">
            {qrImageError ? (
              <div className="upi-payment__qr-unavailable" role="alert">
                The original QR image could not be loaded. You can still pay using the UPI ID below.
              </div>
            ) : (
              <div className="upi-payment__qr-card">
                <img
                  className="upi-payment__qr-image"
                  src={qrImageUrl}
                  alt="Original UPI payment QR code"
                  onError={() => setQrImageError(true)}
                />
              </div>
            )}

            <p className="upi-payment__payee">Payee Name <strong>{booking.upiPayeeName}</strong></p>
            <div className="upi-payment__upi-id">
              <span>UPI ID: <strong>{booking.upiId}</strong></span>
              <button type="button" onClick={() => void copyUpiId()}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
                {copied ? 'UPI ID Copied' : 'Copy UPI ID'}
              </button>
            </div>
            {!qrImageError && (
              <a className="upi-payment__download" href={qrImageUrl} download="vibe-together-upi-qr.png">
                <Download size={15} aria-hidden="true" /> Download QR
              </a>
            )}
            <p className="upi-payment__scan-instruction">
              Scan using Google Pay, PhonePe or Paytm.
            </p>
            {isAndroid && phonePeIntentUrl && (
              <>
                <a
                  className="upi-payment__button upi-payment__launch"
                  href={phonePeIntentUrl}
                  onClick={() => setHasLaunchedUpi(true)}
                >
                  <Smartphone size={17} aria-hidden="true" />
                  PAY WITH PHONEPE <span> · {formatAmount(booking.paymentAmount)}</span>
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
                <div className="upi-payment__app-options" role="group" aria-label="Other UPI apps">
                  <a
                    className="upi-payment__button upi-payment__button--secondary"
                    href={googlePayIntentUrl}
                    onClick={() => setHasLaunchedUpi(true)}
                  >
                    Google Pay
                  </a>
                  <a
                    className="upi-payment__button upi-payment__button--secondary"
                    href={paytmIntentUrl}
                    onClick={() => setHasLaunchedUpi(true)}
                  >
                    Paytm
                  </a>
                </div>
                <p className="upi-payment__launch-note">
                  Payments remain pending until verification. If an app is unavailable, try another listed app or scan the QR.
                </p>
              </>
            )}
            {!isAndroid && (
              <p className="upi-payment__launch-note">
                Scan the QR with a UPI app on another device. Payments remain pending until verification.
              </p>
            )}
          </div>

          {notice && <p className="upi-payment__notice" role="status">{notice}</p>}
          {submitError && <p className="upi-payment__error" role="alert">{submitError}</p>}
          <button
            className="upi-payment__button upi-payment__paid-button"
            onClick={() => setShowUtrForm(true)}
            type="button"
          >
            I Have Paid
          </button>
          {showUtrForm && (
            <form className="upi-payment__utr-form" onSubmit={handleSubmit}>
              <label htmlFor="upi-utr">UPI transaction reference number (UTR)</label>
              <input
                autoComplete="off"
                autoCapitalize="characters"
                id="upi-utr"
                inputMode="text"
                maxLength={32}
                minLength={8}
                onChange={(event) => setUtr(event.target.value)}
                pattern="[A-Za-z0-9 ]{8,32}"
                placeholder="Enter your UTR"
                required
                value={utr}
              />
              <button className="upi-payment__button" disabled={submitting} type="submit">
                {submitting && <LoaderCircle size={17} aria-hidden="true" />}
                {submitting ? 'Submitting…' : 'Submit Payment Details'}
              </button>
            </form>
          )}
        </>
      )}
      {storageWarning && <p className="upi-payment__storage-warning" role="note">{storageWarning}</p>}
    </section>
  )
}
