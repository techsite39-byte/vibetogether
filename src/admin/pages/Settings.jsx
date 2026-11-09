import { useState } from 'react'
import { Save, ShieldAlert } from 'lucide-react'
import { AdminNotice, AdminPageHeader, AdminPanel } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

export default function Settings() {
  const { settings, diwaliOffer, actor, storageError, updateSettings, updateDiwaliOffer } = useAdminData()
  const [draft, setDraft] = useState(null)
  const [offerDraft, setOfferDraft] = useState(null)
  const form = draft ?? settings
  const offerForm = offerDraft ?? diwaliOffer
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function toIstDateTimeInput(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('sv-SE', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
    }).replace(' ', 'T').slice(0, 16)
  }

  function fromIstDateTimeInput(value) {
    return value ? new Date(`${value}:00+05:30`).toISOString() : ''
  }

  function offerDateToIso(value) {
    if (!value) return ''
    return /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? new Date(value).toISOString()
      : fromIstDateTimeInput(value)
  }

  function updateField(key, value) {
    setDraft((current) => ({ ...(current ?? settings), [key]: value }))
    setMessage('')
    setError('')
  }

  function updateCategory(categoryId, updates) {
    setDraft((current) => {
      const base = current ?? settings
      return {
        ...base,
        categories: base.categories.map((category) =>
          category.id === categoryId ? { ...category, ...updates } : category,
        ),
      }
    })
  }

  function updateNotification(key, checked) {
    setDraft((current) => {
      const base = current ?? settings
      return {
        ...base,
        notifications: { ...base.notifications, [key]: checked },
      }
    })
  }

  function updateOfferField(key, value) {
    setOfferDraft((current) => ({ ...(current ?? diwaliOffer), [key]: value }))
    setMessage('')
    setError('')
  }

  async function saveOffer() {
    if (!offerForm) {
      setError('Offer settings are still loading.')
      return
    }
    try {
      const saved = await updateDiwaliOffer({
        enabled: offerForm.enabled,
        regularPrice: Number(offerForm.regularPrice),
        offerPrice: Number(offerForm.offerPrice),
        activationAt: offerDateToIso(offerForm.activationAt),
        expiresAt: offerDateToIso(offerForm.expiresAt),
      })
      if (saved) {
        setMessage('Diwali offer settings saved.')
        setError('')
        setOfferDraft(null)
      } else {
        setError('Diwali offer settings could not be saved.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Offer settings could not be saved.')
    }
  }

  async function saveSettings(event) {
    event.preventDefault()
    if (!form.platformName.trim() || !form.tagline.trim()) {
      setError('Platform name and tagline are required.')
      return
    }

    if (
      form.contactEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)
    ) {
      setError('Enter a valid contact email address.')
      return
    }

    const whatsappDigits = form.whatsappNumber.replace(/\D/g, '')
    if (form.whatsappNumber && !/^\d{8,15}$/.test(whatsappDigits)) {
      setError('WhatsApp number must include 8 to 15 digits with country code.')
      return
    }

    try {
      const saved = await updateSettings({
        ...form,
        platformName: form.platformName.trim(),
        tagline: form.tagline.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        whatsappNumber: whatsappDigits,
      })
      if (saved) {
        setMessage('Platform settings saved.')
        setError('')
        setDraft(null)
      } else {
        setError('Platform settings could not be saved.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Settings could not be saved.')
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Manage non-secret platform information and category availability."
        eyebrow="Configuration"
        title="Platform settings"
      />
      <AdminNotice tone="warning">
        Settings are stored in the platform database. Never enter API keys,
        payment credentials, or other secrets here.
      </AdminNotice>
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      {message && <AdminNotice tone="success">{message}</AdminNotice>}
      <form className="admin-settings" onSubmit={saveSettings}>
        <AdminPanel title="Brand and contact">
          <div className="admin-settings__grid">
            <label>Platform name<input maxLength={80} onChange={(e) => updateField('platformName', e.target.value)} value={form.platformName} /></label>
            <label>Tagline<input maxLength={120} onChange={(e) => updateField('tagline', e.target.value)} value={form.tagline} /></label>
            <label>Contact email<input autoComplete="email" onChange={(e) => updateField('contactEmail', e.target.value)} type="email" value={form.contactEmail} /></label>
            <label>Contact phone<input autoComplete="tel" onChange={(e) => updateField('contactPhone', e.target.value)} value={form.contactPhone} /></label>
            <label>WhatsApp number with country code<input autoComplete="off" inputMode="numeric" onChange={(e) => updateField('whatsappNumber', e.target.value)} placeholder="Not configured" value={form.whatsappNumber} /></label>
          </div>
        </AdminPanel>
        <AdminPanel title="Social media links">
          <div className="admin-settings__grid">
            <label>Instagram URL<input autoComplete="url" onChange={(e) => updateField('socialInstagram', e.target.value)} placeholder="Not configured" value={form.socialInstagram} /></label>
            <label>Facebook URL<input autoComplete="url" onChange={(e) => updateField('socialFacebook', e.target.value)} placeholder="Not configured" value={form.socialFacebook} /></label>
            <label>YouTube URL<input autoComplete="url" onChange={(e) => updateField('socialYoutube', e.target.value)} placeholder="Not configured" value={form.socialYoutube} /></label>
            <label>LinkedIn URL<input autoComplete="url" onChange={(e) => updateField('socialLinkedin', e.target.value)} placeholder="Not configured" value={form.socialLinkedin} /></label>
          </div>
        </AdminPanel>
        <AdminPanel title="Diwali special offer">
          <p className="admin-muted">
            Offer dates use Asia/Kolkata. Expiry must be exactly 72 hours after activation.
            Current status: <strong>{diwaliOffer?.status ?? 'Loading'}</strong>
          </p>
          <div className="admin-settings__grid">
            <label className="admin-checkbox">
              <input
                checked={Boolean(offerForm?.enabled)}
                disabled={!offerForm || actor?.role !== 'super_admin'}
                onChange={(event) => updateOfferField('enabled', event.target.checked)}
                type="checkbox"
              />
              Enable Diwali offer
            </label>
            <label>Regular price (₹)<input
              min="1"
              onChange={(event) => updateOfferField('regularPrice', event.target.value)}
              type="number"
              value={offerForm?.regularPrice ?? ''}
            /></label>
            <label>Offer price (₹)<input
              min="1"
              onChange={(event) => updateOfferField('offerPrice', event.target.value)}
              type="number"
              value={offerForm?.offerPrice ?? ''}
            /></label>
            <label>Activation date and time (IST)<input
              onChange={(event) => updateOfferField('activationAt', event.target.value)}
              type="datetime-local"
              value={toIstDateTimeInput(offerForm?.activationAt)}
            /></label>
            <label>Expiry date and time (IST)<input
              onChange={(event) => updateOfferField('expiresAt', event.target.value)}
              type="datetime-local"
              value={toIstDateTimeInput(offerForm?.expiresAt)}
            /></label>
          </div>
          <p className="admin-muted">
            Savings: ₹{Math.max(0, Number(offerForm?.regularPrice ?? 0) - Number(offerForm?.offerPrice ?? 0))}
          </p>
          {actor?.role === 'super_admin' && (
            <button className="admin-button admin-button--secondary" onClick={() => void saveOffer()} type="button">
              Save Diwali offer
            </button>
          )}
        </AdminPanel>
        <AdminPanel title="Event categories">
          <p className="admin-muted">Category availability and names are stored in the platform database.</p>
          <div className="admin-settings__categories">
            {form.categories.map((category) => (
              <div className="admin-settings__category" key={category.id}>
                <label>Category name<input maxLength={60} onChange={(e) => updateCategory(category.id, { title: e.target.value })} value={category.title} /></label>
                <label className="admin-checkbox"><input checked={category.enabled} onChange={(e) => updateCategory(category.id, { enabled: e.target.checked })} type="checkbox" /> Enabled</label>
              </div>
            ))}
          </div>
        </AdminPanel>
        <AdminPanel title="Booking policies">
          <label className="admin-settings__full">Demo booking policy<textarea maxLength={1000} onChange={(e) => updateField('bookingPolicy', e.target.value)} rows={4} value={form.bookingPolicy} /></label>
          <div className="admin-settings__security"><ShieldAlert size={18} aria-hidden="true" /><span>Payment verification and refunds must be enforced by trusted backend services.</span></div>
        </AdminPanel>
        <AdminPanel title="Platform notifications">
          <div className="admin-settings__notifications">
            {[
              ['newBooking', 'New booking'],
              ['eventSubmission', 'Event submission'],
              ['organizerApplication', 'Organizer application'],
            ].map(([key, label]) => (
              <label className="admin-checkbox" key={key}>
                <input checked={Boolean(form.notifications[key])} onChange={(e) => updateNotification(key, e.target.checked)} type="checkbox" />
                {label}
              </label>
            ))}
          </div>
        </AdminPanel>
        <button className="admin-button admin-button--primary" type="submit"><Save size={17} aria-hidden="true" /> Save settings</button>
      </form>
    </div>
  )
}
