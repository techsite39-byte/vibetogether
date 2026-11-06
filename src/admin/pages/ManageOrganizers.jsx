import { useMemo, useState } from 'react'
import { Search, UserRound } from 'lucide-react'
import { AdminDialog, AdminNotice, AdminPageHeader, AdminPanel, AdminTable, StatusBadge } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

function OrganizerProfile({ organizer, onClose, events, bookings }) {
  const organizerEvents = events.filter((event) => event.organizerId === organizer.id)
  const organizerBookings = bookings.filter((booking) => booking.organizerId === organizer.id)

  return (
    <AdminDialog onClose={onClose} title={organizer.name}>
      <div className="admin-profile">
        <p>{organizer.description}</p>
        <dl>
          <div><dt>Contact</dt><dd>{organizer.contactEmail}</dd></div>
          <div><dt>Application status</dt><dd><StatusBadge status={organizer.status}>{organizer.status}</StatusBadge></dd></div>
          <div><dt>Joined</dt><dd>{organizer.joinedAt}</dd></div>
          <div><dt>Events</dt><dd>{organizerEvents.length}</dd></div>
          <div><dt>Bookings</dt><dd>{organizerBookings.length}</dd></div>
          <div><dt>Tickets booked</dt><dd>{organizerBookings.reduce((total, booking) => total + booking.ticketCount, 0)}</dd></div>
        </dl>
        <h3>Events</h3>
        {organizerEvents.length ? (
          <ul>{organizerEvents.map((event) => <li key={event.id}>{event.title} · {event.status}</li>)}</ul>
        ) : <p>No events are assigned to this organizer.</p>}
      </div>
    </AdminDialog>
  )
}

export default function ManageOrganizers() {
  const { bookings, events, organizers, storageError, updateOrganizer } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return organizers
      .filter((organizer) => status === 'all' || organizer.status === status)
      .filter((organizer) => [organizer.name, organizer.contactEmail].join(' ').toLocaleLowerCase().includes(term))
  }, [organizers, query, status])

  function changeStatus(organizer, nextStatus) {
    if (!window.confirm(`${nextStatus === 'approved' ? 'Approve' : nextStatus === 'rejected' ? 'Reject' : 'Change status for'} "${organizer.name}"?`)) {
      return
    }

    try {
      updateOrganizer(organizer.id, { status: nextStatus })
      setError('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Organizer status could not be updated.')
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review organizer profiles and applications, account status, event activity, and booking totals."
        eyebrow="Partners"
        title="Organizer management"
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} organizers`}>
        <div className="admin-toolbar">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search organizers</span><input onChange={(e) => setQuery(e.target.value)} placeholder="Search organizer or email" value={query} /></label>
          <label className="admin-select"><span>Application</span><select onChange={(e) => setStatus(e.target.value)} value={status}><option value="all">All applications</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></label>
        </div>
        <AdminTable label="Organizer applications and profiles">
          <thead><tr><th scope="col">Organizer</th><th scope="col">Categories</th><th scope="col">Events</th><th scope="col">Bookings</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((organizer) => {
              const eventCount = events.filter((event) => event.organizerId === organizer.id).length
              const organizerBookings = bookings.filter((booking) => booking.organizerId === organizer.id)
              return (
                <tr key={organizer.id}>
                  <td><strong>{organizer.name}</strong><span className="admin-table__secondary">{organizer.contactEmail}</span></td>
                  <td>{organizer.categoryIds.join(', ')}</td>
                  <td>{eventCount}</td>
                  <td>{organizerBookings.length}</td>
                  <td><StatusBadge status={organizer.status}>{organizer.status}</StatusBadge></td>
                  <td>
                    <div className="admin-row-actions admin-row-actions--wrap">
                      <button className="admin-button admin-button--small" onClick={() => setSelected(organizer)} type="button"><UserRound size={15} aria-hidden="true" /> Review</button>
                      {organizer.status === 'pending' && <>
                        <button className="admin-button admin-button--small admin-button--primary" onClick={() => changeStatus(organizer, 'approved')} type="button">Approve</button>
                        <button className="admin-button admin-button--small admin-button--danger" onClick={() => changeStatus(organizer, 'rejected')} type="button">Reject</button>
                      </>}
                      {organizer.status === 'approved' && <button className="admin-button admin-button--small admin-button--danger" onClick={() => changeStatus(organizer, 'suspended')} type="button">Suspend</button>}
                      {organizer.status === 'suspended' && <button className="admin-button admin-button--small admin-button--primary" onClick={() => changeStatus(organizer, 'approved')} type="button">Activate</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No organizers match this filter.</p>}
      </AdminPanel>
      {selected && <OrganizerProfile bookings={bookings} events={events} onClose={() => setSelected(null)} organizer={selected} />}
    </div>
  )
}
