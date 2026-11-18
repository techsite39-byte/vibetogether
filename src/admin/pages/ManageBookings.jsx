import { useMemo, useState } from 'react'
import { Download, MessageCircle, RefreshCw, Search } from 'lucide-react'
import {
  AdminDialog,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import { getWhatsAppNotificationPreview } from '../../utils/whatsappNotificationPreview.js'
import {
  getWhatsAppRetryIdentifier,
  retryWhatsAppNotification,
  verifyUpiPayment,
} from '../services/adminApi.js'

function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount ?? 0)
  } catch {
    return `${currency || ''} ${amount ?? 0}`.trim()
  }
}

function formatBookingDate(value) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
}

function formatPaymentStatus(status) {
  const label = ({
    unpaid: 'Unpaid',
    demo_paid: 'Demo Paid',
    verified: 'Paid',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    not_required: 'Not required',
    processing: 'Verifying',
  })[status]
  return label ?? (typeof status === 'string' ? status.replaceAll('_', ' ') : 'Unknown')
}

const PAYMENT_EVIDENCE_KEY_PATTERN =
  /(payment|paid|cashfree|razorpay|upi|gateway|provider|transaction|refund|settlement|verification|verified|attempt|order|utr|receipt|payout|financial|audit)/i

function isVisibleNoPaymentCandidate(booking) {
  const source = booking.source === 'booking'
    ? 'booking'
    : booking.source === 'booking-enquiry'
      ? 'enquiry'
      : null
  const expectedStatus = source === 'booking'
    ? 'not_required'
    : source === 'enquiry'
      ? 'unpaid'
      : null
  if (!expectedStatus || booking.paymentStatus !== expectedStatus) {
    return false
  }

  const allowedFields = source === 'booking'
    ? new Set(['paymentStatus'])
    : new Set([
      'paymentStatus', 'paymentAmount', 'paymentAmountPaise', 'paymentOrderAmountPaise',
      'paymentOrders', 'upiPayments', 'paymentProvider', 'cfOrderId', 'cfPaymentId',
      'cfPaymentSessionId', 'cfPaymentStatus', 'cfPaymentMethod', 'paymentReference',
      'paymentOrderId', 'razorpayPaymentId', 'paymentOrderCreatedAt',
      'paymentOrderAttemptNumber', 'paidAt', 'paymentVerifiedAt',
      'paymentFailureReason', 'paymentAttemptId', 'paymentAttemptPricing',
      'paymentAttemptedAt',
    ])

  return Object.entries(booking).every(([key, value]) => {
    if (!PAYMENT_EVIDENCE_KEY_PATTERN.test(key)) {
      return true
    }
    if (!allowedFields.has(key)) {
      return false
    }
    if (key === 'paymentStatus' || key === 'paymentAmount' || key === 'paymentAmountPaise') {
      return true
    }
    if (key === 'paymentOrders' || key === 'upiPayments') {
      return value == null || (Array.isArray(value) && value.length === 0)
    }
    if (key === 'paymentOrderAmountPaise' || key === 'paymentOrderAttemptNumber') {
      return value == null || value === 0
    }
    return value == null || value === ''
  })
}

function hasUniqueVisibleBookingIdentifier(booking, bookings) {
  const identifier = booking.reference || booking.requestId || booking.id
  return Boolean(identifier) && !bookings.some((other) =>
    other !== booking && [other.reference, other.requestId, other.id].includes(identifier),
  )
}

function formatBookingStatus(status) {
  return ({ pending: 'Pending Approval', confirmed: 'Approved', cancelled: 'Cancelled' })[status]
    ?? status.replaceAll('_', ' ')
}

function formatWhatsAppStatus(status, consent) {
  if (status === 'skipped') return consent ? 'Skipped' : 'Skipped – No Consent'
  return ({
    pending: 'Pending',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
  })[status] ?? 'Not Available'
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function getBookingSubject(booking, event) {
  if (booking.category) {
    return `Category interest: ${booking.category}`
  }

  return event?.title ?? booking.event?.title ?? booking.event ?? 'Unknown event'
}

function BookingDetails({ booking, event, organizer, onClose, onBookingUpdated }) {
  const [retrying, setRetrying] = useState(false)
  const [retryResult, setRetryResult] = useState(null)
  const [currentBooking, setCurrentBooking] = useState(booking)
  const notification = currentBooking.whatsappNotification ?? {
    status: 'not_available',
    history: [],
  }
  const adminNotif = currentBooking.adminNotification
  const mobileDigits = String(currentBooking.mobile ?? '').replace(/\D/g, '')
  const primaryBookingIdentifier = getWhatsAppRetryIdentifier(currentBooking)
  const isPaymentFinalized = ['demo_paid', 'paid', 'verified'].includes(currentBooking.paymentStatus)
  const whatsappPreview = getWhatsAppNotificationPreview(
    currentBooking,
    isPaymentFinalized ? 'success' : 'failure',
  )

  const attendeesList = useMemo(() => {
    const list = []
    const maleCount = currentBooking.maleCount ?? 0
    const femaleCount = currentBooking.femaleCount ?? 0
    for (let i = 0; i < maleCount; i++) {
      const name = currentBooking.maleMemberNames?.[i]?.trim() || `Male Member ${i + 1}`
      const mobile = currentBooking.maleMemberMobiles?.[i]?.trim() || ''
      const consent = currentBooking.maleMemberConsents?.[i] === true
      const notif = currentBooking.attendeeNotifications?.find((an) => an.attendeeIndex === i && an.gender === 'Male') ||
        currentBooking.attendeeNotifications?.find((an) => mobile && an.recipient === mobile)
      list.push({ index: i, gender: 'Male', label: `Male Member ${i + 1}`, name, mobile, consent, notif })
    }
    for (let i = 0; i < femaleCount; i++) {
      const name = currentBooking.femaleMemberNames?.[i]?.trim() || `Female Member ${i + 1}`
      const mobile = currentBooking.femaleMemberMobiles?.[i]?.trim() || ''
      const consent = currentBooking.femaleMemberConsents?.[i] === true
      const notif = currentBooking.attendeeNotifications?.find((an) => an.attendeeIndex === i && an.gender === 'Female') ||
        currentBooking.attendeeNotifications?.find((an) => mobile && an.recipient === mobile)
      list.push({ index: i, gender: 'Female', label: `Female Member ${i + 1}`, name, mobile, consent, notif })
    }
    return list
  }, [currentBooking])

  async function handleRetry(target = 'primary', attendeeIndex) {
    const bookingIdentifier = target === 'primary'
      ? primaryBookingIdentifier
      : currentBooking.reference
    if (retrying || !bookingIdentifier) return
    setRetrying(true)
    setRetryResult(null)
    try {
      const response = await retryWhatsAppNotification(bookingIdentifier, { target, attendeeIndex })
      const updated = response.booking ? { ...currentBooking, ...response.booking } : currentBooking
      if (response.notification) {
        updated.whatsappNotification = response.notification
      }
      if (response.attendeeNotifications) {
        updated.attendeeNotifications = response.attendeeNotifications
      }
      if (response.adminNotification) {
        updated.adminNotification = response.adminNotification
      }
      setCurrentBooking(updated)
      setRetryResult({
        tone: response.result?.alreadyDelivered || response.result?.uncertain
          ? 'neutral'
          : response.result?.sent || response.result?.success
            ? 'success'
            : 'error',
        text: response.message,
      })
      if (typeof onBookingUpdated === 'function') {
        onBookingUpdated(updated)
      }
    } catch (error) {
      setRetryResult({
        tone: 'error',
        text: error instanceof Error ? error.message : 'WhatsApp notification retry failed.',
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <AdminDialog onClose={onClose} title={`Booking ${currentBooking.reference || currentBooking.requestId || currentBooking.id}`}>
      <div className="admin-profile">
        <p>Booking information saved by the platform.</p>
        <dl>
          <div><dt>Booking reference</dt><dd>{currentBooking.reference || 'Awaiting payment'}</dd></div>
          {!currentBooking.reference && <div><dt>Request ID</dt><dd>{currentBooking.requestId || currentBooking.id}</dd></div>}
          <div><dt>Customer</dt><dd>{currentBooking.customer}</dd></div>
          <div><dt>Email</dt><dd>{currentBooking.customerEmail || '—'}</dd></div>
          <div><dt>Mobile</dt><dd>{currentBooking.mobile || '—'}</dd></div>
          <div><dt>{currentBooking.category ? 'Category interest' : 'Event'}</dt><dd>{currentBooking.category ?? getBookingSubject(currentBooking, event)}</dd></div>
          <div><dt>Organizer</dt><dd>{currentBooking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</dd></div>
          <div><dt>Ticket type</dt><dd>{currentBooking.ticketTypeName || currentBooking.ticketType || '—'}</dd></div>
          <div><dt>Number of tickets</dt><dd>{currentBooking.ticketQuantity ?? currentBooking.ticketCount ?? 1}</dd></div>
          <div><dt>Male tickets</dt><dd>{currentBooking.maleCount ?? (currentBooking.gender === 'Male' ? currentBooking.ticketQuantity ?? 1 : 0)}</dd></div>
          <div><dt>Female tickets</dt><dd>{currentBooking.femaleCount ?? (currentBooking.gender === 'Female' ? currentBooking.ticketQuantity ?? 1 : 0)}</dd></div>
          <div>
            <dt>Male members</dt>
            <dd>{Array.from({ length: currentBooking.maleCount ?? (currentBooking.gender === 'Male' ? currentBooking.ticketQuantity ?? 1 : 0) }, (_, index) => (
              <span key={`male-${index}`} style={{ display: 'block' }}>Male Member {index + 1}: {currentBooking.maleMemberNames?.[index]?.trim() || 'Not provided'}</span>
            ))}</dd>
          </div>
          <div>
            <dt>Female members</dt>
            <dd>{Array.from({ length: currentBooking.femaleCount ?? (currentBooking.gender === 'Female' ? currentBooking.ticketQuantity ?? 1 : 0) }, (_, index) => (
              <span key={`female-${index}`} style={{ display: 'block' }}>Female Member {index + 1}: {currentBooking.femaleMemberNames?.[index]?.trim() || 'Not provided'}</span>
            ))}</dd>
          </div>
          <div><dt>Price per ticket</dt><dd>{currentBooking.pricePerTicket == null ? '—' : formatAmount(currentBooking.pricePerTicket, currentBooking.currency)}</dd></div>
          <div><dt>Subtotal</dt><dd>{currentBooking.subtotal == null ? '—' : formatAmount(currentBooking.subtotal, currentBooking.currency)}</dd></div>
          <div><dt>Discount</dt><dd>{formatAmount(currentBooking.discount ?? 0, currentBooking.currency)}</dd></div>
          <div><dt>Booking date</dt><dd>{formatBookingDate(currentBooking.createdAt)}</dd></div>
          <div><dt>Total amount charged</dt><dd>{formatAmount(currentBooking.amount, currentBooking.currency)}</dd></div>
          <div><dt>Regular price per ticket</dt><dd>{formatAmount(currentBooking.regularPrice ?? 299, currentBooking.currency)}</dd></div>
          <div><dt>Diwali offer</dt><dd>{currentBooking.diwaliOfferApplied ? `Applied · saved ${formatAmount(currentBooking.discount ?? (currentBooking.regularPrice ?? 299) - currentBooking.amount, currentBooking.currency)}` : 'Not applied'}</dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={currentBooking.paymentStatus}>{formatPaymentStatus(currentBooking.paymentStatus)}</StatusBadge></dd></div>
          <div><dt>Payment provider</dt><dd><strong>{currentBooking.paymentProvider === 'cashfree' ? 'Cashfree Payments' : currentBooking.paymentProvider === 'razorpay' ? 'Razorpay (Historical)' : currentBooking.paymentProvider || '—'}</strong></dd></div>
          {currentBooking.upiPayments?.map((payment, index) => (
            <div key={`${payment.utr}-${index}`}>
              <dt>UPI submission {index + 1}</dt>
              <dd>
                <span style={{ display: 'block' }}>UTR: {payment.utr}</span>
                <span style={{ display: 'block' }}>Payee UPI ID: {payment.upiId}</span>
                <span style={{ display: 'block' }}>Amount: {formatAmount(payment.amount, currentBooking.currency)}</span>
                <span style={{ display: 'block' }}>Status: {payment.status}</span>
                <span style={{ display: 'block' }}>Submitted: {formatBookingDate(payment.submittedAt)}</span>
                <span style={{ display: 'block' }}>Verified/rejected: {formatBookingDate(payment.adminVerifiedAt)}</span>
                {payment.rejectionReason && <span style={{ display: 'block' }}>Rejection reason: {payment.rejectionReason}</span>}
              </dd>
            </div>
          ))}
          {currentBooking.paymentProvider === 'cashfree' ? (
            <>
              <div><dt>Cashfree order ID</dt><dd>{currentBooking.cfOrderId || currentBooking.paymentOrderId || '—'}</dd></div>
              <div><dt>Cashfree payment ID</dt><dd>{currentBooking.cfPaymentId || '—'}</dd></div>
              <div><dt>Cashfree payment status</dt><dd>{currentBooking.cfPaymentStatus || currentBooking.paymentStatus || '—'}</dd></div>
              {currentBooking.cfPaymentMethod && <div><dt>Cashfree payment method</dt><dd>{currentBooking.cfPaymentMethod}</dd></div>}
            </>
          ) : currentBooking.paymentProvider === 'razorpay' ? (
            <>
              <div><dt>Razorpay order ID</dt><dd>{currentBooking.paymentOrderId || '—'}</dd></div>
              <div><dt>Razorpay payment ID</dt><dd>{currentBooking.razorpayPaymentId || '—'}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Order ID</dt><dd>{currentBooking.paymentOrderId || currentBooking.cfOrderId || '—'}</dd></div>
              <div><dt>Payment ID</dt><dd>{currentBooking.cfPaymentId || currentBooking.razorpayPaymentId || '—'}</dd></div>
            </>
          )}
          <div><dt>Payment reference</dt><dd>{currentBooking.paymentReference || '—'}</dd></div>
          <div><dt>Payment verified at</dt><dd>{formatBookingDate(currentBooking.paymentVerifiedAt ?? currentBooking.paidAt)}</dd></div>
          <div><dt>Payment failure</dt><dd>{currentBooking.paymentFailureReason || '—'}</dd></div>
          <div><dt>Booking status</dt><dd><StatusBadge status={currentBooking.status}>{formatBookingStatus(currentBooking.status)}</StatusBadge></dd></div>
          <div><dt>WhatsApp consent</dt><dd>{currentBooking.whatsappConsent ? 'Granted' : 'Not granted'}</dd></div>
          <div><dt>Consent date</dt><dd>{formatBookingDate(currentBooking.whatsappConsentAt)}</dd></div>
          <div><dt>Opt-out date</dt><dd>{formatBookingDate(currentBooking.whatsappOptedOutAt)}</dd></div>
          <div><dt>Customer WhatsApp number</dt><dd>{currentBooking.mobile || '—'}</dd></div>
          <div><dt>Primary WhatsApp status</dt><dd><StatusBadge status={notification.status}>{formatWhatsAppStatus(notification.status, currentBooking.whatsappConsent)}</StatusBadge></dd></div>
          <div><dt>Primary message ID</dt><dd>{notification.providerMessageId || '—'}</dd></div>
          <div><dt>Primary sent at</dt><dd>{formatBookingDate(notification.sentAt)}</dd></div>
          <div><dt>Primary delivered at</dt><dd>{formatBookingDate(notification.deliveredAt)}</dd></div>

          {/* Admin Alert Status */}
          <div><dt>Admin WhatsApp alert</dt><dd><StatusBadge status={adminNotif?.status || 'not_available'}>{adminNotif?.status ? adminNotif.status.toUpperCase() : 'NOT CONFIGURED'}</StatusBadge></dd></div>
          {adminNotif?.recipient && <div><dt>Admin phone</dt><dd>{adminNotif.recipient}</dd></div>}
          {adminNotif?.providerMessageId && <div><dt>Admin alert message ID</dt><dd>{adminNotif.providerMessageId}</dd></div>}
        </dl>
        <AdminNotice tone="neutral">
          Ticket selection and charged pricing are locked after payment. Any change requires a separate payment or refund workflow.
        </AdminNotice>
        {notification.failureReason && <AdminNotice tone="error">{notification.failureReason}</AdminNotice>}
        {adminNotif?.failureReason && <AdminNotice tone="error">{adminNotif.failureReason}</AdminNotice>}
        {retryResult && <AdminNotice tone={retryResult.tone}>{retryResult.text}</AdminNotice>}

        {/* Additional Attendee WhatsApp Status Table */}
        {attendeesList.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <h3>Additional Attendee Notifications</h3>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#c4b5fd' }}>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Attendee</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Mobile</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Consent</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>WhatsApp Status</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {attendeesList.map((att) => {
                  const hasMobile = Boolean(att.mobile)
                  const hasConsent = att.consent
                  const notifStatus = att.notif?.status || (hasMobile ? (hasConsent ? 'pending' : 'no_consent') : 'no_mobile')
                  const canResend = hasMobile && hasConsent && !['delivered', 'read'].includes(att.notif?.status)
                  return (
                    <tr key={`${att.gender}-${att.index}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem' }}><strong>{att.name}</strong> ({att.label})</td>
                      <td style={{ padding: '0.5rem' }}>{att.mobile || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {hasConsent ? <span style={{ color: '#10b981' }}>✓ Granted</span> : <span style={{ color: '#9ca3af' }}>Not opted in</span>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <StatusBadge status={att.notif?.status || notifStatus}>
                          {att.notif?.status ? att.notif.status.toUpperCase() : notifStatus.replace('_', ' ').toUpperCase()}
                        </StatusBadge>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {canResend && (
                          <button
                            type="button"
                            className="admin-button admin-button--secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            disabled={retrying}
                            onClick={() => handleRetry('attendee', att.index)}
                          >
                            Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3>WhatsApp notification history</h3>
        {notification.history?.length ? (
          <ul>
            {notification.history.slice().reverse().map((entry, index) => (
              <li key={`${entry.at}-${entry.status}-${index}`}>
                {formatBookingDate(entry.at)} · {entry.status} · {entry.note || entry.source}
              </li>
            ))}
          </ul>
        ) : <p>No notification history recorded.</p>}
        <h3>WhatsApp message preview</h3>
        <pre className="admin-booking-whatsapp-preview">{whatsappPreview}</pre>
        <div style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          {mobileDigits && (
            <a className="admin-button admin-button--secondary" href={`https://wa.me/${mobileDigits}`} rel="noopener noreferrer" target="_blank">
              <MessageCircle size={16} aria-hidden="true" /> Contact customer on WhatsApp
            </a>
          )}
          {currentBooking.whatsappConsent && (
            <button
              type="button"
              className="admin-button admin-button--primary"
              disabled={retrying || !primaryBookingIdentifier || ['delivered', 'read'].includes(notification.status)}
              onClick={() => handleRetry('primary')}
              title={!primaryBookingIdentifier
                ? 'Booking identifier is unavailable'
                : ['delivered', 'read'].includes(notification.status)
                  ? 'Message is already delivered'
                  : 'Retry sending primary WhatsApp notification'}
            >
              <RefreshCw size={15} className={retrying ? 'admin-spin' : ''} aria-hidden="true" />
              {retrying
                ? 'Retrying…'
                : ['delivered', 'read'].includes(notification.status)
                  ? 'Primary Delivered'
                  : 'Resend Primary WhatsApp'}
            </button>
          )}
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={retrying}
            onClick={() => handleRetry('admin')}
            title="Resend admin alert notification to configured admin number"
          >
            <RefreshCw size={15} className={retrying ? 'admin-spin' : ''} aria-hidden="true" />
            {retrying ? 'Retrying…' : 'Resend Admin Alert'}
          </button>
        </div>
      </div>
    </AdminDialog>
  )
}

export default function ManageBookings() {
  const {
    actor,
    bookings,
    events,
    organizers,
    storageError,
    updateBooking,
    deleteBooking,
    reload,
  } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [gateway, setGateway] = useState('all')
  const [selected, setSelected] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return bookings
      .filter((booking) => status === 'all' || booking.status === status)
      .filter((booking) => paymentStatus === 'all' || (
        paymentStatus === 'paid'
          ? ['paid', 'verified'].includes(booking.paymentStatus)
          : booking.paymentStatus === paymentStatus
      ))
      .filter((booking) => {
        if (gateway === 'all') return true
        const prov = (booking.paymentProvider || '').toLowerCase()
        return prov === gateway
      })
      .filter((booking) => {
        const event = events.find((item) => item.id === booking.eventId)
        const organizer = organizers.find((item) => item.id === booking.organizerId)
        return [
          booking.reference || booking.requestId || booking.id,
          booking.customer,
          booking.customerEmail,
          booking.category,
          event?.title,
          booking.event?.title,
          typeof booking.event === 'string' ? booking.event : '',
          organizer?.name,
          booking.paymentOrderId,
          booking.razorpayPaymentId,
          booking.cfOrderId,
          booking.cfPaymentId,
        ].join(' ').toLocaleLowerCase().includes(term)
      })
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  }, [bookings, events, organizers, paymentStatus, gateway, query, status])
  const pendingUpiPayments = useMemo(
    () => bookings.flatMap((booking) =>
      (booking.upiPayments ?? [])
        .filter((payment) => payment.status === 'Submitted for Verification')
        .map((payment) => ({ booking, payment })),
    ),
    [bookings],
  )

  async function decideUpiPayment(booking, decision) {
    let rejectionReason = ''
    if (decision === 'approve') {
      if (!window.confirm('Confirm that you checked the receiving bank account and matched the actual credited amount and UTR before approving this payment.')) {
        return
      }
    } else {
      rejectionReason = window.prompt('Enter the reason for rejecting this UPI payment:')?.trim() ?? ''
      if (!rejectionReason) {
        setActionError('A rejection reason is required.')
        return
      }
    }

    setActionError('')
    setActionSuccess('')
    try {
      await verifyUpiPayment(booking.requestId, decision, rejectionReason)
      await reload()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The UPI payment decision could not be saved.')
    }
  }

  function exportCsv() {
    const rows = [
      ['Reference', 'Customer', 'Email', 'Event', 'Organizer', 'Ticket type', 'Ticket quantity', 'Price per ticket', 'Subtotal', 'Discount', 'Total amount', 'Booking date', 'Payment status', 'Booking status'],
      ...filtered.map((booking) => {
        const event = events.find((item) => item.id === booking.eventId)
        const organizer = organizers.find((item) => item.id === booking.organizerId)
        return [
          booking.reference,
          booking.customer,
          booking.customerEmail,
          getBookingSubject(booking, event),
          organizer?.name ?? '',
          booking.ticketTypeName ?? booking.ticketType ?? '',
          booking.ticketQuantity ?? booking.ticketCount,
          booking.pricePerTicket ?? '',
          booking.subtotal ?? '',
          booking.discount ?? 0,
          booking.amount,
          booking.createdAt,
          booking.paymentStatus,
          booking.status,
        ]
      }),
    ]
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'vibe-together-bookings.csv'
    document.body.append(link)
    link.click()
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      link.remove()
    }, 1000)
  }

  async function cancel(booking) {
    const bookingIdentifier = booking.reference || booking.requestId || booking.id
    const hasVerifiedPayment = ['verified', 'paid'].includes(booking.paymentStatus)
    const message = hasVerifiedPayment
      ? `Cancel ${bookingIdentifier}? The payment service must handle a verified payment refund.`
      : booking.paymentStatus === 'demo_paid'
        ? `Cancel booking ${bookingIdentifier}? This was a demo payment and no real money was collected.`
        : `Cancel booking ${bookingIdentifier}?`
    if (!window.confirm(message)) {
      return
    }

    if (hasVerifiedPayment) {
      setActionSuccess('')
      setActionError('Bookings with verified real payments must be cancelled by the payment service.')
      return
    }
    setActionSuccess('')
    const saved = await updateBooking(bookingIdentifier, { status: 'cancelled' })
    setActionError(saved ? '' : storageError)
  }

  async function removeBooking(booking) {
    const identifier = booking.reference || booking.requestId || booking.id
    if (!window.confirm(
      `Permanently delete booking ${identifier}? This cannot be undone. Only a uniquely matched record with no payment history can be deleted.`,
    )) {
      return
    }

    setActionError('')
    setActionSuccess('')
    try {
      const result = await deleteBooking(identifier)
      if (!result.success) {
        setActionError(result.error || 'The booking could not be deleted. Refresh and retry.')
        return
      }
      setSelected(null)
      setActionSuccess(`Booking ${identifier} was deleted.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The booking could not be deleted.')
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review booking records and category interests submitted on the platform."
        eyebrow="Reservations"
        title="Booking management"
        actions={<button className="admin-button admin-button--primary" onClick={exportCsv} type="button"><Download size={16} aria-hidden="true" /> Export CSV</button>}
      />
      {actionSuccess && <AdminNotice tone="success">{actionSuccess}</AdminNotice>}
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      <AdminPanel title={`UPI payments awaiting verification · ${pendingUpiPayments.length}`}>
        <AdminNotice tone="neutral">
          Verify the actual credit and exact amount in the authorised receiving bank account before approving. A UTR or customer screenshot alone is not proof of payment.
        </AdminNotice>
        {pendingUpiPayments.length > 0 ? (
          <AdminTable label="UPI payments awaiting verification">
            <thead><tr><th scope="col">Booking / customer</th><th scope="col">Event / ticket</th><th scope="col">Amount</th><th scope="col">UTR</th><th scope="col">Submitted</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {pendingUpiPayments.map(({ booking, payment }) => (
                <tr key={`${booking.requestId}-${payment.utr}`}>
                  <td><strong>{booking.reference || booking.requestId}</strong><span className="admin-table__secondary">{booking.customer} · {booking.mobile || booking.customerEmail}</span></td>
                  <td><strong>{getBookingSubject(booking, events.find((event) => event.id === booking.eventId))}</strong><span className="admin-table__secondary">{booking.ticketTypeName || booking.ticketType} · {booking.ticketQuantity ?? booking.ticketCount} ticket(s)</span></td>
                  <td>{formatAmount(payment.amount, booking.currency)}</td>
                  <td><strong>{payment.utr}</strong><span className="admin-table__secondary">{payment.upiId}</span></td>
                  <td>{formatBookingDate(payment.submittedAt)}</td>
                  <td><div className="admin-row-actions admin-row-actions--wrap">
                    <button className="admin-button admin-button--small" onClick={() => setSelected(booking)} type="button">Booking details</button>
                    <button className="admin-button admin-button--small admin-button--primary" onClick={() => void decideUpiPayment(booking, 'approve')} type="button">Verify &amp; approve</button>
                    <button className="admin-button admin-button--small admin-button--danger" onClick={() => void decideUpiPayment(booking, 'reject')} type="button">Reject</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        ) : <p className="admin-empty">No UPI payments are awaiting verification.</p>}
      </AdminPanel>
      <AdminPanel title={`${filtered.length} booking records`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search bookings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Reference, customer, event, category or organizer" value={query} /></label>
          <label className="admin-select"><span>Booking</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></label>
          <label className="admin-select"><span>Payment</span><select onChange={(event) => setPaymentStatus(event.target.value)} value={paymentStatus}><option value="all">All payment states</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="demo_paid">Demo Paid</option><option value="processing">Verifying</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="not_required">Not required</option></select></label>
          <label className="admin-select"><span>Gateway</span><select onChange={(event) => setGateway(event.target.value)} value={gateway}><option value="all">All Gateways</option><option value="cashfree">Cashfree Payments</option><option value="razorpay">Razorpay (Historical)</option><option value="upi">Direct UPI</option></select></label>
        </div>
        <AdminTable label="Booking records">
          <thead><tr><th scope="col">Reference / customer</th><th scope="col">Event / interest</th><th scope="col">Ticket details</th><th scope="col">Booked</th><th scope="col">Total amount</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">WhatsApp</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((booking) => {
              const event = events.find((item) => item.id === booking.eventId)
              const organizer = organizers.find((item) => item.id === booking.organizerId)
              const mobileDigits = String(booking.mobile ?? '').replace(/\D/g, '')
              const bookingKey = booking.reference || booking.requestId || booking.id
              return (
                <tr key={bookingKey}>
                  <td><strong>{booking.reference || 'Awaiting payment'}</strong>{!booking.reference && <span className="admin-table__secondary">Request {bookingKey}</span>}<span className="admin-table__secondary">{booking.customer}</span><span className="admin-table__secondary">{booking.mobile || booking.customerEmail}</span></td>
                  <td><strong>{getBookingSubject(booking, event)}</strong><span className="admin-table__secondary">{booking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</span></td>
                  <td>
                    <strong>{booking.ticketTypeName || booking.ticketType || '—'} · {booking.ticketQuantity ?? booking.ticketCount ?? 1}</strong>
                    <span className="admin-table__secondary">
                      {booking.pricePerTicket == null ? 'Price per ticket —' : `${formatAmount(booking.pricePerTicket, booking.currency)} per ticket`}
                    </span>
                    <span className="admin-table__secondary">
                      Subtotal {booking.subtotal == null ? '—' : formatAmount(booking.subtotal, booking.currency)} · Discount {formatAmount(booking.discount ?? 0, booking.currency)}
                    </span>
                  </td>
                  <td>{formatBookingDate(booking.createdAt)}</td>
                  <td>
                    {formatAmount(booking.amount, booking.currency)}
                    {booking.diwaliOfferApplied && <span className="admin-table__secondary"><s>{formatAmount(booking.subtotal ?? booking.regularPrice, booking.currency)}</s> Diwali offer · saved {formatAmount(booking.discount ?? 0, booking.currency)}</span>}
                  </td>
                  <td>
                    <StatusBadge status={booking.paymentStatus}>{formatPaymentStatus(booking.paymentStatus)}</StatusBadge>
                    <span className="admin-table__secondary" style={{ display: 'block', marginTop: '3px', fontWeight: 600 }}>
                      {booking.paymentProvider === 'cashfree' ? 'Cashfree' : booking.paymentProvider === 'razorpay' ? 'Razorpay' : booking.paymentProvider === 'upi' ? 'Direct UPI' : '—'}
                    </span>
                  </td>
                  <td><StatusBadge status={booking.status}>{formatBookingStatus(booking.status)}</StatusBadge></td>
                  <td><StatusBadge status={booking.whatsappNotification?.status ?? 'not_available'}>{formatWhatsAppStatus(booking.whatsappNotification?.status, booking.whatsappConsent)}</StatusBadge>{mobileDigits && <a className="admin-button admin-button--small" href={`https://wa.me/${mobileDigits}`} rel="noopener noreferrer" target="_blank"><MessageCircle size={15} aria-hidden="true" /> Contact</a>}</td>
                  <td><div className="admin-row-actions admin-row-actions--wrap">
                    <button className="admin-button admin-button--small" onClick={() => setSelected(booking)} type="button">Details</button>
                    {actor?.role === 'super_admin'
                      && isVisibleNoPaymentCandidate(booking)
                      && hasUniqueVisibleBookingIdentifier(booking, bookings)
                      && <button
                        className="admin-button admin-button--small admin-button--danger"
                        onClick={() => void removeBooking(booking)}
                        type="button"
                      >Delete</button>}
                    {!['cancelled', 'rejected'].includes(booking.status) && !['verified', 'paid'].includes(booking.paymentStatus) && <button className="admin-button admin-button--small admin-button--danger" onClick={() => void cancel(booking)} type="button">Cancel</button>}
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No bookings match these filters.</p>}
      </AdminPanel>
      {selected && (
        <BookingDetails
          booking={selected}
          event={events.find((item) => item.id === selected.eventId)}
          onClose={() => setSelected(null)}
          onBookingUpdated={(updated) => {
            setSelected(updated)
            if (typeof reload === 'function') {
              void reload()
            }
          }}
          organizer={organizers.find((item) => item.id === selected.organizerId)}
        />
      )}
    </div>
  )
}
