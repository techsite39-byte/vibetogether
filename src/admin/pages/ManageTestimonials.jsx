import { useMemo, useState } from 'react'
import { Search, Star, Trash2 } from 'lucide-react'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

const initialForm = {
  name: '',
  event: '',
  rating: '5',
  title: '',
  quote: '',
}

export default function ManageTestimonials() {
  const {
    createRecord,
    deleteRecord,
    storageError,
    testimonials,
    updateRecord,
  } = useAdminData()
  const [form, setForm] = useState(initialForm)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return testimonials.filter((testimonial) =>
      (status === 'all' || testimonial.status === status) &&
      [testimonial.name, testimonial.event, testimonial.title, testimonial.quote]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term),
    )
  }, [query, status, testimonials])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const created = await createRecord('testimonials', {
        ...form,
        name: form.name.trim(),
        event: form.event.trim(),
        rating: Number(form.rating),
        title: form.title.trim(),
        quote: form.quote.trim(),
        status: 'approved',
        featured: false,
      })
      if (created) {
        setForm(initialForm)
        setMessage('Testimonial saved and approved.')
      } else {
        setError('Testimonial could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function changeTestimonial(testimonial, updates) {
    const saved = await updateRecord('testimonials', testimonial.id, updates)
    setError(saved ? '' : storageError || 'Testimonial could not be updated.')
  }

  async function removeTestimonial(testimonial) {
    if (!window.confirm(`Delete the testimonial from "${testimonial.name}"?`)) {
      return
    }
    const deleted = await deleteRecord('testimonials', testimonial.id)
    setError(deleted ? '' : storageError || 'Testimonial could not be deleted.')
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review and publish community feedback, and add testimonials collected by your team."
        eyebrow="Community"
        title="Testimonials"
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      {message && <AdminNotice tone="success">{message}</AdminNotice>}
      <AdminPanel title="Add a testimonial">
        <form className="admin-form" onSubmit={submit}>
          <label>
            Name
            <input maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
          </label>
          <label>
            Event
            <input maxLength={160} onChange={(event) => setForm({ ...form, event: event.target.value })} value={form.event} />
          </label>
          <label>
            Rating
            <select onChange={(event) => setForm({ ...form, rating: event.target.value })} value={form.rating}>
              {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
            </select>
          </label>
          <label>
            Title
            <input maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} value={form.title} />
          </label>
          <label>
            Quote
            <textarea maxLength={2000} onChange={(event) => setForm({ ...form, quote: event.target.value })} required rows={3} value={form.quote} />
          </label>
          <button className="admin-button admin-button--primary" disabled={saving} type="submit">
            <Star size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save testimonial'}
          </button>
        </form>
      </AdminPanel>
      <AdminPanel title={`${filtered.length} testimonials`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search testimonials</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search name, event or quote" value={query} />
          </label>
          <label className="admin-select">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
        <AdminTable label="Testimonials">
          <thead><tr><th scope="col">Person / event</th><th scope="col">Feedback</th><th scope="col">Rating</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filtered.map((testimonial) => (
              <tr key={testimonial.id}>
                <td><strong>{testimonial.name}</strong><span className="admin-table__secondary">{testimonial.event || 'Event not specified'}</span></td>
                <td><strong>{testimonial.title || 'Community feedback'}</strong><span className="admin-table__secondary">{testimonial.quote}</span></td>
                <td>{testimonial.rating} / 5</td>
                <td><StatusBadge status={testimonial.status}>{testimonial.status}</StatusBadge></td>
                <td>
                  <div className="admin-row-actions admin-row-actions--wrap">
                    {testimonial.status !== 'approved' && <button className="admin-button admin-button--small" onClick={() => void changeTestimonial(testimonial, { status: 'approved' })} type="button">Approve</button>}
                    {testimonial.status !== 'rejected' && <button className="admin-button admin-button--small" onClick={() => void changeTestimonial(testimonial, { status: 'rejected' })} type="button">Reject</button>}
                    <button className="admin-button admin-button--small" onClick={() => void changeTestimonial(testimonial, { featured: !testimonial.featured })} type="button">{testimonial.featured ? 'Unfeature' : 'Feature'}</button>
                    <button aria-label={`Delete testimonial from ${testimonial.name}`} className="admin-button admin-button--small admin-button--danger" onClick={() => void removeTestimonial(testimonial)} type="button"><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No testimonials match these filters.</p>}
      </AdminPanel>
    </div>
  )
}
