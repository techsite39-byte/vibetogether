import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import {
  AdminDialog,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

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
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function BookingDetails({ booking, event, organizer, onClose }) {
  return (
    <AdminDialog onClose={onClose} title={`Booking ${booking.reference}`}>
      <div className="admin-profile">
        <p>Booking information saved by the platform.</p>
        <dl>
          <div><dt>Customer</dt><dd>{booking.customer}</dd></div>
          <div><dt>Email</dt><dd>{booking.customerEmail || '—'}</dd></div>
          <div><dt>Event</dt><dd>{event?.title ?? booking.event?.title ?? booking.event ?? 'Unknown event'}</dd></div>
          <div><dt>Organizer</dt><dd>{organizer?.name ?? event?.organizer ?? '—'}</dd></div>
          <div><dt>Tickets</dt><dd>{booking.ticketCount}</dd></div>
          <div><dt>Booking date</dt><dd>{formatBookingDate(booking.createdAt)}</dd></div>
          <div><dt>Amount</dt><dd>{formatAmount(booking.amount, booking.currency)}</dd></div>
          <div><dt>Payment status</dt><dd><StatusBadge status={booking.paymentStatus}>{booking.paymentStatus.replaceAll('_', ' ')}</StatusBadge></dd></div>
          <div><dt>Booking status</dt><dd><StatusBadge status={booking.status}>{booking.status}</StatusBadge></dd></div>
        </dl>
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
      .filter((booking) => paymentStatus === 'all' || booking.paymentStatus === paymentStatus)
      .filter((booking) => {
        const event = events.find((item) => item.id === booking.eventId)
        const organizer = organizers.find((item) => item.id === booking.organizerId)
        return [
          booking.reference,
          booking.customer,
          booking.customerEmail,
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
          event?.title ?? booking.event?.title ?? booking.event ?? '',
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
    const message = booking.paymentStatus === 'not_required'
      ? `Cancel booking ${booking.reference}?`
      : `Cancel ${booking.reference}? The payment service must handle paid booking cancellations.`
    if (!window.confirm(message)) {
      return
    }
    if (booking.paymentStatus !== 'not_required') {
      setActionError('Paid bookings must be cancelled by the payment service.')
      return
    }
    const saved = await updateBooking(booking.reference, { status: 'cancelled' })
    setActionError(saved ? '' : storageError)
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review and manage booking records persisted by the platform."
        eyebrow="Reservations"
        title="Booking management"
        actions={<button className="admin-button admin-button--primary" onClick={exportCsv} type="button"><Download size={16} aria-hidden="true" /> Export CSV</button>}
      />
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} booking records`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search bookings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Reference, customer, event or organizer" value={query} /></label>
          <label className="admin-select"><span>Booking</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></label>
          <label className="admin-select"><span>Payment</span><select onChange={(event) => setPaymentStatus(event.target.value)} value={paymentStatus}><option value="all">All payment states</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="not_required">Not required</option></select></label>
        </div>
        <AdminTable label="Booking records">
          <thead><tr><th scope="col">Reference / customer</th><th scope="col">Event / organizer</th><th scope="col">Tickets</th><th scope="col">Booked</th><th scope="col">Amount</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((booking) => {
              const event = events.find((item) => item.id === booking.eventId)
              const organizer = organizers.find((item) => item.id === booking.organizerId)
              return (
                <tr key={booking.reference}>
                  <td><strong>{booking.reference}</strong><span className="admin-table__secondary">{booking.customer}</span></td>
                  <td><strong>{event?.title ?? booking.event?.title ?? booking.event ?? 'Unknown event'}</strong><span className="admin-table__secondary">{organizer?.name ?? event?.organizer ?? '—'}</span></td>
                  <td>{booking.ticketCount}</td>
                  <td>{formatBookingDate(booking.createdAt)}</td>
                  <td>{formatAmount(booking.amount, booking.currency)}</td>
                  <td><StatusBadge status={booking.paymentStatus}>{booking.paymentStatus.replaceAll('_', ' ')}</StatusBadge></td>
                  <td><StatusBadge status={booking.status}>{booking.status}</StatusBadge></td>
                  <td><div className="admin-row-actions admin-row-actions--wrap">
                    <button className="admin-button admin-button--small" onClick={() => setSelected(booking)} type="button">Details</button>
                    {booking.status === 'confirmed' && booking.paymentStatus === 'not_required' && <button className="admin-button admin-button--small admin-button--danger" onClick={() => void cancel(booking)} type="button">Cancel</button>}
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
