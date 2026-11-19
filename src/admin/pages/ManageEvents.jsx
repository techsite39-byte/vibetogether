import { useMemo, useRef, useState } from 'react'
import { Image, Plus, Search, Trash2, Upload } from 'lucide-react'
import {
  AdminDialog,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import {
  resolveMediaAssetUrl,
  uploadMediaImage,
} from '../services/adminApi.js'
import { buildEventImageUpdate } from '../data/adminEventOperations.js'

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

function EventImageUploadField({ image, imageAlt, onImageChange, onImageAltChange }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewImage = resolveMediaAssetUrl(image)
  const prevImageRef = useRef(previewImage)

  if (prevImageRef.current !== previewImage) {
    prevImageRef.current = previewImage
    if (previewFailed) {
      setPreviewFailed(false)
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')
    setPreviewFailed(false)
    try {
      const result = await uploadMediaImage(file)
      if (result?.url) {
        setPreviewFailed(false)
        onImageChange(result.url)
      } else {
        throw new Error('Image upload failed to return a valid URL.')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed. Try another file or paste a URL.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleRemove() {
    setPreviewFailed(false)
    onImageChange('')
  }

  return (
    <div className="admin-image-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {image ? (
        <div className="admin-image-upload__preview-card">
          <div className="admin-image-upload__preview-img-wrap">
            {previewFailed ? (
              <div className="admin-image-upload__fallback" role="status" aria-label="Poster preview unavailable">
                <Image size={24} className="admin-muted" aria-hidden="true" />
                <span className="admin-muted">
                  Poster preview unavailable. Use “Change image” to upload it again.
                </span>
              </div>
            ) : (
              <img
                src={previewImage}
                alt={imageAlt || 'Event poster preview'}
                className="admin-image-upload__preview-img"
                onError={() => setPreviewFailed(true)}
              />
            )}
          </div>
          <div className="admin-image-upload__preview-actions">
            <button
              type="button"
              className="admin-button admin-button--small admin-button--primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Change image'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--small admin-button--danger"
              disabled={uploading}
              onClick={handleRemove}
            >
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
            <button
              type="button"
              className="admin-image-upload__url-toggle"
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              {showUrlInput ? 'Hide direct URL' : 'Edit direct URL'}
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className="admin-image-upload__dropzone"
          onClick={() => !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
        >
          <Upload size={24} aria-hidden="true" />
          <span>{uploading ? 'Uploading image from device…' : 'Click to upload event image from your device'}</span>
          <span className="admin-muted">Supports JPG, PNG, WEBP, GIF (up to 12MB)</span>
          <button
            type="button"
            className="admin-image-upload__url-toggle"
            onClick={(e) => {
              e.stopPropagation()
              setShowUrlInput(!showUrlInput)
            }}
          >
            {showUrlInput ? 'Hide direct URL' : 'Or enter custom image URL / path'}
          </button>
        </div>
      )}

      {uploadError && <AdminNotice tone="error">{uploadError}</AdminNotice>}

      {(showUrlInput || (!image && showUrlInput)) && (
        <label style={{ marginTop: '0.4rem' }}>
          Direct image URL or path
          <input
            maxLength={2048}
            placeholder="https://... or /m1.webp"
            value={image}
            onChange={(e) => {
              setFailedPreview('')
              onImageChange(e.target.value)
            }}
          />
        </label>
      )}

      <label style={{ marginTop: '0.4rem' }}>
        Image alternative text (for accessibility)
        <input
          maxLength={300}
          placeholder="Brief visual description of the event poster"
          value={imageAlt}
          onChange={(e) => onImageAltChange(e.target.value)}
        />
      </label>
    </div>
  )
}

function EditEventDialog({ categories, event, onClose, onSave, storageError }) {
  const [form, setForm] = useState({
    title: event.title || '',
    category: event.category || (categories[0]?.title ?? ''),
    location: event.location || '',
    price: event.price || '',
    description: event.description || '',
    date: event.date || '',
    time: event.time || '',
    image: event.image || '',
    imageAlt: event.imageAlt || '',
    status: event.status || 'published',
  })
  const [error, setError] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(eventObject) {
    eventObject.preventDefault()
    if (saving) {
      return
    }
    if (!form.title.trim() || !form.location.trim()) {
      setError('Event title and location are required.')
      return
    }

    setError('')
    setSaveFailed(false)
    setSaving(true)
    try {
      const { image: formImage, ...formValues } = form
      const image = formImage.trim()
      const existingImage = (event.image ?? '').trim()
      const saved = await onSave(event.id, {
        ...formValues,
        title: form.title.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        ...buildEventImageUpdate(existingImage, image),
        imageAlt: form.imageAlt.trim(),
        status: form.status,
      })
      if (saved) {
        onClose()
      } else {
        setSaveFailed(true)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Event could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminDialog onClose={onClose} title={`Edit ${event.title}`}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Event name
          <input maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} value={form.title} required />
        </label>
        <label>
          Category
          <select onChange={(e) => setForm({ ...form, category: e.target.value })} value={form.category}>
            {categories.map((category) => <option key={category.id} value={category.title}>{category.title}</option>)}
          </select>
        </label>
        <label>
          Date
          <input onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" value={form.date} />
        </label>
        <label>
          Time
          <input maxLength={30} onChange={(e) => setForm({ ...form, time: e.target.value })} value={form.time} placeholder="e.g. 7:30 PM" />
        </label>
        <label>
          Location
          <input maxLength={160} onChange={(e) => setForm({ ...form, location: e.target.value })} value={form.location} required />
        </label>
        <label>
          Display price
          <input maxLength={30} onChange={(e) => setForm({ ...form, price: e.target.value })} value={form.price} />
        </label>
        <label>
          Description
          <textarea maxLength={2000} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} value={form.description} />
        </label>
        <div>
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Event poster image
          </span>
          <EventImageUploadField
            image={form.image}
            imageAlt={form.imageAlt}
            onImageChange={(url) => setForm((prev) => ({ ...prev, image: url }))}
            onImageAltChange={(alt) => setForm((prev) => ({ ...prev, imageAlt: alt }))}
          />
        </div>
        <label>
          Status
          <select onChange={(e) => setForm({ ...form, status: e.target.value })} value={form.status}>
            {eventStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {saveFailed && (
          <AdminNotice tone="error">
            {storageError || 'Event could not be saved. Check the admin service connection and try again.'}
          </AdminNotice>
        )}
        <div className="admin-form__actions">
          <button className="admin-button admin-button--secondary" onClick={onClose} type="button">Cancel</button>
          <button className="admin-button admin-button--primary" disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save event'}
          </button>
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
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      image: form.image.trim(),
      imageAlt: form.imageAlt.trim(),
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
        <label>Time<input maxLength={30} onChange={(event) => setForm({ ...form, time: event.target.value })} value={form.time} placeholder="e.g. 7:30 PM" /></label>
        <label>Location<input maxLength={200} onChange={(event) => setForm({ ...form, location: event.target.value })} required value={form.location} /></label>
        <div>
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Event poster image
          </span>
          <EventImageUploadField
            image={form.image}
            imageAlt={form.imageAlt}
            onImageChange={(url) => setForm((prev) => ({ ...prev, image: url }))}
            onImageAltChange={(alt) => setForm((prev) => ({ ...prev, imageAlt: alt }))}
          />
        </div>
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
  const { actor, categories, createRecord, deleteEvent, eventError, events, organizers, updateEvent } = useAdminData()
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

  async function changeStatus(event, nextStatus) {
    const action = nextStatus === 'rejected' ? 'Reject' : nextStatus === 'cancelled' ? 'Cancel' : 'Update'
    if (!window.confirm(`${action} the event "${event.title}"?`)) {
      return
    }

    try {
      const result = await updateEvent(event.id, { status: nextStatus })
      if (result && typeof result === 'object' && result.success === false) {
        setError(result.error || 'Event status could not be changed.')
      } else if (result === false) {
        setError('Event status could not be changed.')
      } else {
        setError('')
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Event status could not be changed.')
    }
  }

  async function removeEvent(event) {
    if (!window.confirm(`Delete the event "${event.title}"? This cannot be undone.`)) {
      return
    }

    try {
      const result = await deleteEvent(event.id)
      if (result && typeof result === 'object' && result.success === false) {
        setError(result.error || 'Event could not be deleted.')
      } else if (result === false) {
        setError('Event could not be deleted.')
      } else {
        setError('')
      }
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
      {(error || eventError) && <AdminNotice tone="error">{error || eventError}</AdminNotice>}
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
                <td>
                  <div className="admin-event-table-cell">
                    {event.image ? (
                      <img
                        src={resolveMediaAssetUrl(event.image)}
                        alt=""
                        className="admin-event-thumbnail"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="admin-event-thumbnail admin-event-thumbnail--fallback">
                        <Image size={18} aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <strong>{event.title}</strong>
                      <span className="admin-table__secondary">{event.location}</span>
                    </div>
                  </div>
                </td>
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
      {editingEvent && <EditEventDialog categories={categories} event={editingEvent} onClose={() => setEditingEvent(null)} onSave={updateEvent} storageError={eventError || storageError} />}
      {addingEvent && <NewEventDialog categories={categories} onClose={() => setAddingEvent(false)} onSave={(record) => createRecord('events', record)} />}
    </div>
  )
}
