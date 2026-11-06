import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

const initialForm = {
  title: '',
  caption: '',
  src: '',
  alt: '',
  categoryId: '',
  featured: false,
}

export default function ManageGallery() {
  const { categories, createRecord, deleteRecord, gallery, storageError } = useAdminData()
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const created = await createRecord('gallery', {
        ...form,
        title: form.title.trim(),
        caption: form.caption.trim(),
        src: form.src.trim(),
        alt: form.alt.trim(),
      })
      if (created) {
        setForm(initialForm)
        setMessage('Gallery item saved.')
      } else {
        setError('Gallery item could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}" from the gallery?`)) {
      return
    }
    const deleted = await deleteRecord('gallery', item.id)
    setError(deleted ? '' : storageError || 'Gallery item could not be deleted.')
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Manage image records stored in the platform gallery."
        eyebrow="Media"
        title="Gallery management"
      />
      {message && <AdminNotice tone="success">{message}</AdminNotice>}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminPanel title="Add gallery item">
        <form className="admin-form" onSubmit={submit}>
          <label>Title<input maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
          <label>Image path or HTTPS URL<input maxLength={2048} onChange={(event) => setForm({ ...form, src: event.target.value })} required value={form.src} /></label>
          <label>Alternative text<input maxLength={300} onChange={(event) => setForm({ ...form, alt: event.target.value })} required value={form.alt} /></label>
          <label>Caption<textarea maxLength={500} onChange={(event) => setForm({ ...form, caption: event.target.value })} rows={3} value={form.caption} /></label>
          <label>Category<select onChange={(event) => setForm({ ...form, categoryId: event.target.value })} value={form.categoryId}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
          <label className="admin-checkbox"><input checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} type="checkbox" /> Featured</label>
          <button className="admin-button admin-button--primary" disabled={saving} type="submit"><ImagePlus size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save gallery item'}</button>
        </form>
      </AdminPanel>
      <AdminPanel title={`${gallery.length} gallery items`}>
        {gallery.length ? (
          <div className="admin-gallery-grid">
            {gallery.map((item) => (
              <article className="admin-panel" key={item.id}>
                <img alt={item.alt} loading="lazy" src={item.src} />
                <h3>{item.title}</h3>
                {item.caption && <p>{item.caption}</p>}
                <button className="admin-button admin-button--danger" onClick={() => void remove(item)} type="button"><Trash2 size={15} aria-hidden="true" /> Delete</button>
              </article>
            ))}
          </div>
        ) : <p className="admin-empty">No gallery items are stored yet.</p>}
      </AdminPanel>
    </div>
  )
}
