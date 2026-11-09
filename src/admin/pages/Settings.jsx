import { useEffect, useState } from 'react'
import { CheckCircle2, Save, Send, ShieldAlert } from 'lucide-react'
import { AdminNotice, AdminPageHeader, AdminPanel } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import { adminRequest } from '../services/adminApi.js'

const defaultWhatsAppSettings = {
  enabled: true,
  displayNumber: '',
  businessContact: '',
  templateName: 'vibe_booking_confirmation_v1',
  templateLanguage: 'en',
}

export default function Settings() {
  const { settings, storageError, updateSettings } = useAdminData()
  const [draft, setDraft] = useState(null)
  const form = draft ?? settings
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [whatsapp, setWhatsApp] = useState(defaultWhatsAppSettings)
  const [whatsappDraft, setWhatsAppDraft] = useState(null)
  const [whatsappStatus, setWhatsAppStatus] = useState(null)
  const [whatsappMessage, setWhatsAppMessage] = useState('')
  const [whatsappError, setWhatsAppError] = useState('')
  const [whatsappSaving, setWhatsAppSaving] = useState(false)
  const whatsappForm = whatsappDraft ?? whatsapp

  useEffect(() => {
    let active = true
    adminRequest('/admin/settings/whatsapp')
      .then(({ settings, configuration }) => {
        if (active) {
          setWhatsApp({ ...defaultWhatsAppSettings, ...settings })
          setWhatsAppStatus(configuration)
        }
      })
      .catch((loadError) => {
        if (active) {
          setWhatsAppError(loadError instanceof Error ? loadError.message : 'WhatsApp settings could not be loaded.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  function updateField(key, value) {
    setDraft((current) => ({ ...(current ?? settings), [key]: value }))
    setMessage('')
    setError('')
  }

  async function saveWhatsAppSettings(event) {
    event.preventDefault()
    setWhatsAppSaving(true)
    setWhatsAppError('')
    setWhatsAppMessage('')
    try {
      const { settings: saved, configuration } = await adminRequest('/admin/settings/whatsapp', {
        method: 'PUT',
        body: JSON.stringify(whatsappForm),
      })
      setWhatsApp({ ...defaultWhatsAppSettings, ...saved })
      setWhatsAppStatus(configuration)
      setWhatsAppDraft(null)
      setWhatsAppMessage('WhatsApp settings saved.')
    } catch (saveError) {
      setWhatsAppError(saveError instanceof Error ? saveError.message : 'WhatsApp settings could not be saved.')
    } finally {
      setWhatsAppSaving(false)
    }
  }

  async function sendWhatsAppTest() {
    setWhatsAppError('')
    setWhatsAppMessage('')
    try {
      await adminRequest('/admin/settings/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setWhatsAppMessage('Test message accepted by WhatsApp. Delivery is not yet confirmed.')
    } catch (testError) {
      setWhatsAppError(testError instanceof Error ? testError.message : 'WhatsApp test could not be sent.')
    }
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
      {(whatsappError || whatsappMessage) && (
        <AdminNotice tone={whatsappError ? 'error' : 'success'}>
          {whatsappError || whatsappMessage}
        </AdminNotice>
      )}
      <form className="admin-settings" onSubmit={saveSettings}>
        <AdminPanel title="WhatsApp Business confirmations">
          <div className="admin-settings__grid">
            <label className="admin-checkbox">
              <input checked={whatsappForm.enabled} onChange={(event) => setWhatsAppDraft((current) => ({ ...(current ?? whatsapp), enabled: event.target.checked }))} type="checkbox" />
              Enable consent-based booking confirmations
            </label>
            <label>Business display number<input autoComplete="off" maxLength={30} onChange={(event) => setWhatsAppDraft((current) => ({ ...(current ?? whatsapp), displayNumber: event.target.value }))} placeholder="Not configured" value={whatsappForm.displayNumber} /></label>
            <label>Business contact information<input autoComplete="off" maxLength={200} onChange={(event) => setWhatsAppDraft((current) => ({ ...(current ?? whatsapp), businessContact: event.target.value }))} placeholder="Support contact details" value={whatsappForm.businessContact} /></label>
            <label>Approved booking template<input autoComplete="off" maxLength={80} onChange={(event) => setWhatsAppDraft((current) => ({ ...(current ?? whatsapp), templateName: event.target.value }))} value={whatsappForm.templateName} /></label>
            <label>Template language code<input autoComplete="off" maxLength={8} onChange={(event) => setWhatsAppDraft((current) => ({ ...(current ?? whatsapp), templateLanguage: event.target.value }))} placeholder="en" value={whatsappForm.templateLanguage} /></label>
          </div>
          <p className="admin-muted">
            API secrets stay in Render environment variables. API connection: {whatsappStatus?.configured ? 'configured' : 'not configured'}; webhook verification: {whatsappStatus?.webhookConfigured ? 'configured' : 'not configured'}; authorized test recipient: {whatsappStatus?.testNumberConfigured ? 'configured' : 'not configured'}.
          </p>
          {whatsappStatus?.configured && (
            <p className="admin-settings__security"><CheckCircle2 size={18} aria-hidden="true" /><span>Messages use the approved template and the WhatsApp Cloud API.</span></p>
          )}
          <div className="admin-toolbar">
            <button className="admin-button admin-button--primary" disabled={whatsappSaving} type="button" onClick={(event) => void saveWhatsAppSettings(event)}><Save size={17} aria-hidden="true" /> Save WhatsApp settings</button>
            <button className="admin-button" onClick={() => { setWhatsAppDraft(null); setWhatsAppError(''); setWhatsAppMessage('') }} type="button">Cancel</button>
            <button className="admin-button" disabled={!whatsappStatus?.testNumberConfigured || !whatsappStatus?.configured} onClick={() => void sendWhatsAppTest()} type="button"><Send size={16} aria-hidden="true" /> Send authorized test</button>
          </div>
        </AdminPanel>
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
