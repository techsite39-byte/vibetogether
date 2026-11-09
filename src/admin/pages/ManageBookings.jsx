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
import { retryWhatsAppNotification } from '../services/adminApi.js'

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
  return ({
    unpaid: 'Unpaid',
    demo_paid: 'Demo Paid',
    verified: 'Paid',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    not_required: 'Not required',
    processing: 'Verifying',
  })[status] ?? status.replaceAll('_', ' ')
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
  const mobileDigits = String(currentBooking.mobile ?? '').replace(/\D/g, '')
  const isPaymentFinalized = ['demo_paid', 'paid', 'verified'].includes(currentBooking.paymentStatus)
  const whatsappPreview = getWhatsAppNotificationPreview(
    currentBooking,
    isPaymentFinalized ? 'success' : 'failure',
  )

  async function handleRetryWhatsApp() {
    if (retrying || !currentBooking.reference) return
    setRetrying(true)
    setRetryResult(null)
    try {
      const response = await retryWhatsAppNotification(currentBooking.reference)
      const updated = response.booking ? { ...currentBooking, ...response.booking } : currentBooking
      if (response.notification) {
        updated.whatsappNotification = response.notification
      }
      setCurrentBooking(updated)
      setRetryResult({
        tone: response.result?.alreadyDelivered || response.result?.uncertain
          ? 'neutral'
          : response.result?.sent
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
    <AdminDialog onClose={onClose} title={`Booking ${currentBooking.reference}`}>
      <div className="admin-profile">
        <p>Booking information saved by the platform.</p>
        <dl>
          <div><dt>Customer</dt><dd>{currentBooking.customer}</dd></div>
          <div><dt>Email</dt><dd>{currentBooking.customerEmail || '—'}</dd></div>
          <div><dt>Mobile</dt><dd>{currentBooking.mobile || '—'}</dd></div>
          <div><dt>{currentBooking.category ? 'Category interest' : 'Event'}</dt><dd>{currentBooking.category ?? getBookingSubject(currentBooking, event)}</dd></div>
          <div><dt>Organizer</dt><dd>{currentBooking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</dd></div>
          <div><dt>Tickets</dt><dd>{currentBooking.ticketCount}</dd></div>
          <div><dt>Booking date</dt><dd>{formatBookingDate(currentBooking.createdAt)}</dd></div>
          <div><dt>Amount</dt><dd>{formatAmount(currentBooking.amount, currentBooking.currency)}</dd></div>
          <div><dt>Regular price</dt><dd>{formatAmount(currentBooking.regularPrice ?? 299, currentBooking.currency)}</dd></div>
          <div><dt>Diwali offer</dt><dd>{currentBooking.diwaliOfferApplied ? `Applied · saved ${formatAmount((currentBooking.regularPrice ?? 299) - currentBooking.amount, currentBooking.currency)}` : 'Not applied'}</dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={currentBooking.paymentStatus}>{formatPaymentStatus(currentBooking.paymentStatus)}</StatusBadge></dd></div>
          <div><dt>Payment provider</dt><dd>{currentBooking.paymentProvider || '—'}</dd></div>
          <div><dt>Razorpay order ID</dt><dd>{currentBooking.paymentOrderId || '—'}</dd></div>
          <div><dt>Razorpay payment ID</dt><dd>{currentBooking.razorpayPaymentId || '—'}</dd></div>
          <div><dt>Payment reference</dt><dd>{currentBooking.paymentReference || '—'}</dd></div>
          <div><dt>Payment verified at</dt><dd>{formatBookingDate(currentBooking.paymentVerifiedAt ?? currentBooking.paidAt)}</dd></div>
          <div><dt>Payment failure</dt><dd>{currentBooking.paymentFailureReason || '—'}</dd></div>
          <div><dt>Booking status</dt><dd><StatusBadge status={currentBooking.status}>{formatBookingStatus(currentBooking.status)}</StatusBadge></dd></div>
          <div><dt>WhatsApp consent</dt><dd>{currentBooking.whatsappConsent ? 'Granted' : 'Not granted'}</dd></div>
          <div><dt>Consent date</dt><dd>{formatBookingDate(currentBooking.whatsappConsentAt)}</dd></div>
          <div><dt>Opt-out date</dt><dd>{formatBookingDate(currentBooking.whatsappOptedOutAt)}</dd></div>
          <div><dt>Customer WhatsApp number</dt><dd>{currentBooking.mobile || '—'}</dd></div>
          <div><dt>WhatsApp notification status</dt><dd><StatusBadge status={notification.status}>{formatWhatsAppStatus(notification.status, currentBooking.whatsappConsent)}</StatusBadge></dd></div>
          <div><dt>Last attempt</dt><dd>{formatBookingDate(notification.lastAttemptAt)}</dd></div>
          <div><dt>Sent at</dt><dd>{formatBookingDate(notification.sentAt)}</dd></div>
          <div><dt>Delivered at</dt><dd>{formatBookingDate(notification.deliveredAt)}</dd></div>
          <div><dt>Provider message ID</dt><dd>{notification.providerMessageId || '—'}</dd></div>
        </dl>
        {notification.failureReason && <AdminNotice tone="error">{notification.failureReason}</AdminNotice>}
        {retryResult && <AdminNotice tone={retryResult.tone}>{retryResult.text}</AdminNotice>}
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
              disabled={retrying || ['delivered', 'read'].includes(notification.status)}
              onClick={handleRetryWhatsApp}
              title={['delivered', 'read'].includes(notification.status) ? 'Message is already delivered' : 'Retry sending WhatsApp notification'}
            >
              <RefreshCw size={15} className={retrying ? 'admin-spin' : ''} aria-hidden="true" />
              {retrying
                ? 'Retrying…'
                : ['delivered', 'read'].includes(notification.status)
                  ? 'Delivered (No Retry Needed)'
                  : 'Retry WhatsApp Notification'}
            </button>
          )}
        </div>
      </div>
    </AdminDialog>
  )
}

export default function ManageBookings() {
  const { bookings, events, organizers, storageError, updateBooking } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [selected, setSelected] = useState(null)
  const [actionError, setActionError] = useState('')

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
        const event = events.find((item) => item.id === booking.eventId)
        const organizer = organizers.find((item) => item.id === booking.organizerId)
        return [
          booking.reference,
          booking.customer,
          booking.customerEmail,
          booking.category,
          event?.title,
          booking.event?.title,
          typeof booking.event === 'string' ? booking.event : '',
          organizer?.name,
        ].join(' ').toLocaleLowerCase().includes(term)
      })
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  }, [bookings, events, organizers, paymentStatus, query, status])

  function exportCsv() {
    const rows = [
      ['Reference', 'Customer', 'Email', 'Event', 'Organizer', 'Tickets', 'Booking date', 'Amount', 'Payment status', 'Booking status'],
      ...filtered.map((booking) => {
        const event = events.find((item) => item.id === booking.eventId)
        const organizer = organizers.find((item) => item.id === booking.organizerId)
        return [
          booking.reference,
          booking.customer,
          booking.customerEmail,
          getBookingSubject(booking, event),
          organizer?.name ?? '',
          booking.ticketCount,
          booking.createdAt,
          booking.amount,
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
    const hasVerifiedPayment = ['verified', 'paid'].includes(booking.paymentStatus)
    const message = hasVerifiedPayment
      ? `Cancel ${booking.reference}? The payment service must handle a verified payment refund.`
      : booking.paymentStatus === 'demo_paid'
        ? `Cancel booking ${booking.reference}? This was a demo payment and no real money was collected.`
        : `Cancel booking ${booking.reference}?`
    if (!window.confirm(message)) {
      return
    }

    if (hasVerifiedPayment) {
      setActionError('Bookings with verified real payments must be cancelled by the payment service.')
      return
    }
    const saved = await updateBooking(booking.reference, { status: 'cancelled' })
    setActionError(saved ? '' : storageError)
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review booking records and category interests submitted on the platform."
        eyebrow="Reservations"
        title="Booking management"
        actions={<button className="admin-button admin-button--primary" onClick={exportCsv} type="button"><Download size={16} aria-hidden="true" /> Export CSV</button>}
      />
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} booking records`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search bookings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Reference, customer, event, category or organizer" value={query} /></label>
          <label className="admin-select"><span>Booking</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></label>
          <label className="admin-select"><span>Payment</span><select onChange={(event) => setPaymentStatus(event.target.value)} value={paymentStatus}><option value="all">All payment states</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="demo_paid">Demo Paid</option><option value="processing">Verifying</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="not_required">Not required</option></select></label>
        </div>
        <AdminTable label="Booking records">
          <thead><tr><th scope="col">Reference / customer</th><th scope="col">Event / interest</th><th scope="col">Tickets</th><th scope="col">Booked</th><th scope="col">Amount</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">WhatsApp</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((booking) => {
              const event = events.find((item) => item.id === booking.eventId)
              const organizer = organizers.find((item) => item.id === booking.organizerId)
              const mobileDigits = String(booking.mobile ?? '').replace(/\D/g, '')
              return (
                <tr key={booking.reference}>
                  <td><strong>{booking.reference}</strong><span className="admin-table__secondary">{booking.customer}</span><span className="admin-table__secondary">{booking.mobile || booking.customerEmail}</span></td>
                  <td><strong>{getBookingSubject(booking, event)}</strong><span className="admin-table__secondary">{booking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</span></td>
                  <td>{booking.ticketCount}</td>
                  <td>{formatBookingDate(booking.createdAt)}</td>
                  <td>
                    {formatAmount(booking.amount, booking.currency)}
                    {booking.diwaliOfferApplied && <span className="admin-table__secondary"><s>{formatAmount(booking.regularPrice, booking.currency)}</s> Diwali offer</span>}
                  </td>
                  <td><StatusBadge status={booking.paymentStatus}>{formatPaymentStatus(booking.paymentStatus)}</StatusBadge></td>
                  <td><StatusBadge status={booking.status}>{formatBookingStatus(booking.status)}</StatusBadge></td>
                  <td><StatusBadge status={booking.whatsappNotification?.status ?? 'not_available'}>{formatWhatsAppStatus(booking.whatsappNotification?.status, booking.whatsappConsent)}</StatusBadge>{mobileDigits && <a className="admin-button admin-button--small" href={`https://wa.me/${mobileDigits}`} rel="noopener noreferrer" target="_blank"><MessageCircle size={15} aria-hidden="true" /> Contact</a>}</td>
                  <td><div className="admin-row-actions admin-row-actions--wrap">
                    <button className="admin-button admin-button--small" onClick={() => setSelected(booking)} type="button">Details</button>
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
            updateBooking(updated.id || updated._id || updated.reference, updated)
            setSelected(updated)
          }}
          organizer={organizers.find((item) => item.id === selected.organizerId)}
        />
      )}
    </div>
  )
}
