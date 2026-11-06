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
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

export default function ManageSubscribers() {
  const { deleteRecord, storageError, subscribers, updateRecord } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [error, setError] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return subscribers
      .filter((subscriber) => status === 'all' || subscriber.status === status)
      .filter((subscriber) => subscriber.email.toLocaleLowerCase().includes(term))
      .sort((first, second) => new Date(second.subscribedAt) - new Date(first.subscribedAt))
  }, [query, status, subscribers])

  async function changeStatus(subscriber) {
    const nextStatus = subscriber.status === 'subscribed' ? 'unsubscribed' : 'subscribed'
    const saved = await updateRecord('subscribers', subscriber.id, { status: nextStatus })
    setError(saved ? '' : storageError || 'Subscriber status could not be updated.')
  }

  async function removeSubscriber(subscriber) {
    if (!window.confirm(`Delete the newsletter record for "${subscriber.email}"?`)) {
      return
    }
    const deleted = await deleteRecord('subscribers', subscriber.id)
    setError(deleted ? '' : storageError || 'Subscriber could not be deleted.')
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review newsletter sign-ups and manage subscription consent."
        eyebrow="Audience"
        title="Newsletter subscribers"
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} subscribers`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search subscribers</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search email address" value={query} />
          </label>
          <label className="admin-select">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="all">All statuses</option>
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </label>
        </div>
        <AdminTable label="Newsletter subscribers">
          <thead><tr><th scope="col">Email</th><th scope="col">Subscribed</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((subscriber) => (
              <tr key={subscriber.id}>
                <td><strong>{subscriber.email}</strong></td>
                <td>{formatDate(subscriber.subscribedAt ?? subscriber.createdAt)}</td>
                <td><StatusBadge status={subscriber.status}>{subscriber.status}</StatusBadge></td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-button admin-button--small" onClick={() => void changeStatus(subscriber)} type="button">
                      {subscriber.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                    </button>
                    <button aria-label={`Delete ${subscriber.email}`} className="admin-button admin-button--small admin-button--danger" onClick={() => void removeSubscriber(subscriber)} type="button">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No subscribers match these filters.</p>}
      </AdminPanel>
    </div>
  )
}
