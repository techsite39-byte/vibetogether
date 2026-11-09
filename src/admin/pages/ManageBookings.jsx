import { useMemo, useState } from 'react'
import { Download, MessageCircle, RotateCw, Search } from 'lucide-react'
import {
  AdminDialog,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import { adminRequest } from '../services/adminApi.js'

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
    not_required: 'Not required',
  })[status] ?? status.replaceAll('_', ' ')
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

function BookingDetails({ booking, event, organizer, onClose }) {
  const notification = booking.whatsappNotification ?? {
    status: booking.whatsappConsent ? 'pending' : 'skipped',
    history: [],
  }
  const mobileDigits = String(booking.mobile ?? '').replace(/\D/g, '')
  return (
    <AdminDialog onClose={onClose} title={`Booking ${booking.reference}`}>
      <div className="admin-profile">
        <p>Booking information saved by the platform.</p>
        <dl>
          <div><dt>Customer</dt><dd>{booking.customer}</dd></div>
          <div><dt>Email</dt><dd>{booking.customerEmail || '—'}</dd></div>
          <div><dt>Mobile</dt><dd>{booking.mobile || '—'}</dd></div>
          <div><dt>{booking.category ? 'Category interest' : 'Event'}</dt><dd>{booking.category ?? getBookingSubject(booking, event)}</dd></div>
          <div><dt>Organizer</dt><dd>{booking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</dd></div>
          <div><dt>Tickets</dt><dd>{booking.ticketCount}</dd></div>
          <div><dt>Booking date</dt><dd>{formatBookingDate(booking.createdAt)}</dd></div>
          <div><dt>Amount</dt><dd>{formatAmount(booking.amount, booking.currency)}</dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={booking.paymentStatus}>{formatPaymentStatus(booking.paymentStatus)}</StatusBadge></dd></div>
          <div><dt>Booking status</dt><dd><StatusBadge status={booking.status}>{booking.status}</StatusBadge></dd></div>
          <div><dt>WhatsApp consent</dt><dd>{booking.whatsappConsent ? 'Granted' : 'Not granted'}</dd></div>
          <div><dt>Consent date</dt><dd>{formatBookingDate(booking.whatsappConsentAt)}</dd></div>
          <div><dt>Opt-out date</dt><dd>{formatBookingDate(booking.whatsappOptedOutAt)}</dd></div>
          <div><dt>WhatsApp notification</dt><dd><StatusBadge status={notification.status}>{notification.status}</StatusBadge></dd></div>
          <div><dt>Last attempt</dt><dd>{formatBookingDate(notification.lastAttemptAt)}</dd></div>
          <div><dt>Provider message ID</dt><dd>{notification.providerMessageId || '—'}</dd></div>
        </dl>
        {notification.failureReason && <AdminNotice tone="error">{notification.failureReason}</AdminNotice>}
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
        {mobileDigits && (
          <a href={`https://wa.me/${mobileDigits}`} rel="noreferrer" target="_blank">
            <MessageCircle size={16} aria-hidden="true" /> Contact customer on WhatsApp
          </a>
        )}
      </div>
    </AdminDialog>
  )
}

export default function ManageBookings() {
  const { bookings, events, organizers, storageError, updateBooking, reload } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [selected, setSelected] = useState(null)
  const [actionError, setActionError] = useState('')
  const [retryingReference, setRetryingReference] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return bookings
      .filter((booking) => status === 'all' || booking.status === status)
      .filter((booking) => paymentStatus === 'all' || booking.paymentStatus === paymentStatus)
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

  async function retryWhatsApp(booking) {
    if (!window.confirm(`Retry the WhatsApp confirmation for ${booking.reference}?`)) {
      return
    }
    setRetryingReference(booking.reference)
    setActionError('')
    try {
      await adminRequest(`/admin/bookings/${encodeURIComponent(booking.reference)}/whatsapp/retry`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      await reload(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'WhatsApp retry failed.')
    } finally {
      setRetryingReference('')
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
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} booking records`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search bookings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Reference, customer, event, category or organizer" value={query} /></label>
          <label className="admin-select"><span>Booking</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></label>
          <label className="admin-select"><span>Payment</span><select onChange={(event) => setPaymentStatus(event.target.value)} value={paymentStatus}><option value="all">All payment states</option><option value="verified">Paid</option><option value="unpaid">Unpaid</option><option value="demo_paid">Demo Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="not_required">Not required</option></select></label>
        </div>
        <AdminTable label="Booking records">
          <thead><tr><th scope="col">Reference / customer</th><th scope="col">Event / interest</th><th scope="col">Tickets</th><th scope="col">Booked</th><th scope="col">Amount</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">WhatsApp</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((booking) => {
              const event = events.find((item) => item.id === booking.eventId)
              const organizer = organizers.find((item) => item.id === booking.organizerId)
              return (
                <tr key={booking.reference}>
                  <td><strong>{booking.reference}</strong><span className="admin-table__secondary">{booking.customer}</span><span className="admin-table__secondary">{booking.mobile || booking.customerEmail}</span></td>
                  <td><strong>{getBookingSubject(booking, event)}</strong><span className="admin-table__secondary">{booking.category ? 'Our team will match an event.' : organizer?.name ?? event?.organizer ?? '—'}</span></td>
                  <td>{booking.ticketCount}</td>
                  <td>{formatBookingDate(booking.createdAt)}</td>
                  <td>{formatAmount(booking.amount, booking.currency)}</td>
                  <td><StatusBadge status={booking.paymentStatus}>{formatPaymentStatus(booking.paymentStatus)}</StatusBadge></td>
                  <td><StatusBadge status={booking.status}>{booking.status}</StatusBadge></td>
                  <td><StatusBadge status={booking.whatsappNotification?.status ?? (booking.whatsappConsent ? 'pending' : 'skipped')}>{booking.whatsappNotification?.status ?? (booking.whatsappConsent ? 'pending' : 'skipped')}</StatusBadge></td>
                  <td><div className="admin-row-actions admin-row-actions--wrap">
                    <button className="admin-button admin-button--small" onClick={() => setSelected(booking)} type="button">Details</button>
                    {!['cancelled', 'rejected'].includes(booking.status) && !['verified', 'paid'].includes(booking.paymentStatus) && <button className="admin-button admin-button--small admin-button--danger" onClick={() => void cancel(booking)} type="button">Cancel</button>}
                    {booking.whatsappNotification?.status === 'failed' && booking.whatsappNotification?.retryable && booking.whatsappConsent && <button className="admin-button admin-button--small" disabled={retryingReference === booking.reference} onClick={() => void retryWhatsApp(booking)} type="button"><RotateCw size={15} aria-hidden="true" /> Retry</button>}
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
          organizer={organizers.find((item) => item.id === selected.organizerId)}
        />
      )}
    </div>
  )
}
