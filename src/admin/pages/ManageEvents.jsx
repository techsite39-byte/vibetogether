import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import {
  AdminDialog,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

const eventStatuses = [
  'draft',
  'pending',
  'approved',
  'published',
  'rejected',
  'cancelled',
]
const statusLabels = {
  draft: 'Draft',
  pending: 'Pending Approval',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

function EditEventDialog({ categories, event, onClose, onSave }) {
  const [form, setForm] = useState({
    title: event.title,
    category: event.category,
    location: event.location,
    price: event.price,
    status: event.status,
  })
  const [error, setError] = useState('')

  async function submit(eventObject) {
    eventObject.preventDefault()
    if (!form.title.trim() || !form.location.trim()) {
      setError('Event title and location are required.')
      return
    }

    try {
      const saved = await onSave(event.id, {
        ...form,
        title: form.title.trim(),
        location: form.location.trim(),
        status: form.status,
      })
      if (saved) {
        onClose()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Event could not be updated.')
    }
  }

  return (
    <AdminDialog onClose={onClose} title={`Edit ${event.title}`}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Event name
          <input maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} value={form.title} />
        </label>
        <label>
          Category
          <select onChange={(e) => setForm({ ...form, category: e.target.value })} value={form.category}>
            {categories.map((category) => <option key={category.id} value={category.title}>{category.title}</option>)}
          </select>
        </label>
        <label>
          Location
          <input maxLength={160} onChange={(e) => setForm({ ...form, location: e.target.value })} value={form.location} />
        </label>
        <label>
          Display price
          <input maxLength={30} onChange={(e) => setForm({ ...form, price: e.target.value })} value={form.price} />
        </label>
        <label>
          Status
          <select onChange={(e) => setForm({ ...form, status: e.target.value })} value={form.status}>
            {eventStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        <div className="admin-form__actions">
          <button className="admin-button admin-button--secondary" onClick={onClose} type="button">Cancel</button>
          <button className="admin-button admin-button--primary" type="submit">Save event</button>
        </div>
      </form>
    </AdminDialog>
  )
}

function NewEventDialog({ categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: categories[0]?.title ?? '',
    date: '',
    time: '',
    location: '',
    image: '',
    imageAlt: '',
    priceAmount: '0',
    seatsAvailable: '0',
    currency: 'INR',
    status: 'draft',
  })
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const priceAmount = Number(form.priceAmount)
    const saved = await onSave({
      ...form,
      priceAmount,
      seatsAvailable: Number(form.seatsAvailable),
      isFree: priceAmount === 0,
      price: priceAmount === 0 ? 'Free' : `${form.currency} ${priceAmount}`,
    })
    if (saved) {
      onClose()
    } else {
      setError('Event could not be saved. Check the form and try again.')
    }
  }

  return (
    <AdminDialog onClose={onClose} title="Add event">
      <form className="admin-form" onSubmit={submit}>
        <label>Event name<input maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
        <label>Description<textarea maxLength={2000} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} value={form.description} /></label>
        <label>Category<select onChange={(event) => setForm({ ...form, category: event.target.value })} required value={form.category}>{categories.map((category) => <option key={category.id} value={category.title}>{category.title}</option>)}</select></label>
        <label>Date<input onChange={(event) => setForm({ ...form, date: event.target.value })} required type="date" value={form.date} /></label>
        <label>Time<input maxLength={30} onChange={(event) => setForm({ ...form, time: event.target.value })} value={form.time} /></label>
        <label>Location<input maxLength={200} onChange={(event) => setForm({ ...form, location: event.target.value })} required value={form.location} /></label>
        <label>Image path or HTTPS URL<input maxLength={2048} onChange={(event) => setForm({ ...form, image: event.target.value })} value={form.image} /></label>
        <label>Image alternative text<input maxLength={300} onChange={(event) => setForm({ ...form, imageAlt: event.target.value })} value={form.imageAlt} /></label>
        <label>Price amount<input min="0" onChange={(event) => setForm({ ...form, priceAmount: event.target.value })} required step="0.01" type="number" value={form.priceAmount} /></label>
        <label>Available seats<input min="0" onChange={(event) => setForm({ ...form, seatsAvailable: event.target.value })} required step="1" type="number" value={form.seatsAvailable} /></label>
        <label>Status<select onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}>{eventStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        <div className="admin-form__actions">
          <button className="admin-button admin-button--secondary" onClick={onClose} type="button">Cancel</button>
          <button className="admin-button admin-button--primary" type="submit">Create event</button>
        </div>
      </form>
    </AdminDialog>
  )
}

export default function ManageEvents() {
  const { actor, categories, createRecord, deleteEvent, events, organizers, storageError, updateEvent } = useAdminData()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [organizer, setOrganizer] = useState('all')
  const [status, setStatus] = useState('all')
  const [editingEvent, setEditingEvent] = useState(null)
  const [addingEvent, setAddingEvent] = useState(false)
  const [error, setError] = useState('')
  const scopedEvents = events

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return scopedEvents
      .filter((event) => category === 'all' || event.category === category)
      .filter((event) => organizer === 'all' || event.organizerId === organizer)
      .filter((event) => status === 'all' || event.status === status)
      .filter((event) => [event.title, event.location, event.organizer].join(' ').toLocaleLowerCase().includes(term))
  }, [category, organizer, scopedEvents, search, status])

  function changeStatus(event, nextStatus) {
    const action = nextStatus === 'rejected' ? 'Reject' : nextStatus === 'cancelled' ? 'Cancel' : 'Update'
    if (!window.confirm(`${action} the event "${event.title}"?`)) {
      return
    }

    try {
      updateEvent(event.id, { status: nextStatus })
      setError('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Event status could not be changed.')
    }
  }

  function removeEvent(event) {
    if (!window.confirm(`Delete the event "${event.title}"? This cannot be undone.`)) {
      return
    }

    try {
      deleteEvent(event.id)
      setError('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Event could not be deleted.')
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Review event submissions, manage listing status, and update event information."
        eyebrow="Programming"
        title="Event management"
        actions={<button className="admin-button admin-button--primary" onClick={() => setAddingEvent(true)} type="button"><Plus size={16} aria-hidden="true" /> Add event</button>}
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      <AdminPanel title={`${filteredEvents.length} events`}>
        <div className="admin-toolbar admin-toolbar--wrap">
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search events</span>
            <input onChange={(e) => setSearch(e.target.value)} placeholder="Search events, organizer, location" value={search} />
          </label>
          <label className="admin-select"><span>Category</span><select onChange={(e) => setCategory(e.target.value)} value={category}><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}</select></label>
          {actor.role !== 'organizer' && (
            <label className="admin-select"><span>Organizer</span><select onChange={(e) => setOrganizer(e.target.value)} value={organizer}><option value="all">All organizers</option>{organizers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          )}
          <label className="admin-select"><span>Status</span><select onChange={(e) => setStatus(e.target.value)} value={status}><option value="all">All statuses</option>{eventStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
        </div>
        <AdminTable label="Event listings">
          <thead><tr><th scope="col">Event</th><th scope="col">Organizer</th><th scope="col">Category</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {filteredEvents.map((event) => (
              <tr key={event.id}>
                <td><strong>{event.title}</strong><span className="admin-table__secondary">{event.location}</span></td>
                <td>{event.organizer}</td>
                <td>{event.category}</td>
                <td>{event.date}</td>
                <td><StatusBadge status={event.status}>{statusLabels[event.status]}</StatusBadge></td>
                <td>
                  <div className="admin-row-actions admin-row-actions--wrap">
                    {event.status === 'pending' && <>
                      <button className="admin-button admin-button--small admin-button--primary" onClick={() => changeStatus(event, 'approved')} type="button">Approve</button>
                      <button className="admin-button admin-button--small admin-button--danger" onClick={() => changeStatus(event, 'rejected')} type="button">Reject</button>
                    </>}
                    {event.status === 'approved' && <button className="admin-button admin-button--small admin-button--primary" onClick={() => changeStatus(event, 'published')} type="button">Publish</button>}
                    {event.status === 'published' && <button className="admin-button admin-button--small admin-button--secondary" onClick={() => changeStatus(event, 'approved')} type="button">Unpublish</button>}
                    <button className="admin-button admin-button--small" onClick={() => setEditingEvent(event)} type="button">Edit</button>
                    <button className="admin-button admin-button--small admin-button--danger" onClick={() => removeEvent(event)} type="button">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        {!filteredEvents.length && <p className="admin-empty">No events match these filters.</p>}
      </AdminPanel>
      {editingEvent && <EditEventDialog categories={categories} event={editingEvent} onClose={() => setEditingEvent(null)} onSave={updateEvent} />}
      {addingEvent && <NewEventDialog categories={categories} onClose={() => setAddingEvent(false)} onSave={(record) => createRecord('events', record)} />}
    </div>
  )
}
