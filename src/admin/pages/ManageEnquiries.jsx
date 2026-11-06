import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

export default function ManageEnquiries() {
  const { deleteRecord, enquiries, storageError, updateRecord } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [error, setError] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return enquiries
      .filter((enquiry) => status === 'all' || enquiry.status === status)
      .filter((enquiry) =>
        [
          enquiry.name,
          enquiry.email,
          enquiry.subject,
          enquiry.message,
          enquiry.type,
        ].join(' ').toLocaleLowerCase().includes(term),
      )
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  }, [enquiries, query, status])

  async function changeStatus(enquiry, nextStatus) {
    const saved = await updateRecord('enquiries', enquiry.id, { status: nextStatus })
    setError(saved ? '' : storageError || 'Enquiry status could not be updated.')
  }

  async function removeEnquiry(enquiry) {
    if (!window.confirm(`Delete the enquiry from "${enquiry.name}"?`)) {
      return
    }
    const deleted = await deleteRecord('enquiries', enquiry.id)
    setError(deleted ? '' : storageError || 'Enquiry could not be deleted.')
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review contact messages and event-hosting requests submitted through the public site."
        eyebrow="Inbox"
        title="Contact and host enquiries"
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} enquiries`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search enquiries</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or message" value={query} />
          </label>
          <label className="admin-select">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="read">Read</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
        <AdminTable label="Contact and host enquiries">
          <thead><tr><th scope="col">Contact</th><th scope="col">Message</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((enquiry) => (
              <tr key={enquiry.id}>
                <td><strong>{enquiry.name}</strong><span className="admin-table__secondary">{enquiry.email}</span><span className="admin-table__secondary">{enquiry.type === 'host-event' ? 'Host an event' : 'Contact'}</span></td>
                <td><strong>{enquiry.subject || 'No subject'}</strong><span className="admin-table__secondary">{enquiry.message}</span></td>
                <td>{formatDate(enquiry.createdAt)}</td>
                <td><StatusBadge status={enquiry.status}>{enquiry.status}</StatusBadge></td>
                <td>
                  <div className="admin-row-actions admin-row-actions--wrap">
                    {enquiry.status === 'pending' && <button className="admin-button admin-button--small" onClick={() => void changeStatus(enquiry, 'read')} type="button">Mark read</button>}
                    {enquiry.status !== 'resolved' && <button className="admin-button admin-button--small" onClick={() => void changeStatus(enquiry, 'resolved')} type="button">Resolve</button>}
                    <button aria-label={`Delete enquiry from ${enquiry.name}`} className="admin-button admin-button--small admin-button--danger" onClick={() => void removeEnquiry(enquiry)} type="button"><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No enquiries match these filters.</p>}
      </AdminPanel>
    </div>
  )
}
