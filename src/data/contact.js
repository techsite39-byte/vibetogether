const env = import.meta.env
const configuredWhatsApp = (env.VITE_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')
const configuredContactApiUrl = (env.VITE_CONTACT_API_URL ?? '').trim()
function isSecureSocialUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const contactApiUrlIsValid = (() => {
  if (!configuredContactApiUrl) {
    return true
  }

  if (
    configuredContactApiUrl.startsWith('/') &&
    !configuredContactApiUrl.startsWith('//')
  ) {
    return true
  }

  try {
    const url = new URL(configuredContactApiUrl)
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)))
    )
  } catch {
    return false
  }
})()

export const contactConfig = {
  phone: (env.VITE_CONTACT_PHONE ?? '').trim(),
  email: (env.VITE_CONTACT_EMAIL ?? '').trim(),
  officeLocation: (env.VITE_CONTACT_LOCATION ?? '').trim(),
  whatsappNumber:
    /^\d{8,15}$/.test(configuredWhatsApp) ? configuredWhatsApp : '',
  apiUrl:
    contactApiUrlIsValid && configuredContactApiUrl
      ? configuredContactApiUrl.replace(/\/+$/, '')
      : '',
  apiConfigurationError:
    configuredContactApiUrl && !contactApiUrlIsValid
      ? 'VITE_CONTACT_API_URL must use HTTPS, localhost HTTP, or a same-origin path without credentials or query parameters.'
      : '',
  socialLinks: [
    { label: 'Instagram', url: (env.VITE_SOCIAL_INSTAGRAM ?? '').trim() },
    { label: 'Facebook', url: (env.VITE_SOCIAL_FACEBOOK ?? '').trim() },
    { label: 'TikTok', url: (env.VITE_SOCIAL_TIKTOK ?? '').trim() },
    { label: 'YouTube', url: (env.VITE_SOCIAL_YOUTUBE ?? '').trim() },
    { label: 'LinkedIn', url: (env.VITE_SOCIAL_LINKEDIN ?? '').trim() },
  ].filter(({ url }) => isSecureSocialUrl(url)),
}

export const enquiryTypes = [
  { value: 'general', label: 'General enquiry' },
  { value: 'booking', label: 'Event booking' },
  { value: 'hosting', label: 'Event hosting' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'technical', label: 'Technical support' },
]

export const faqItems = [
  {
    id: 'join-event',
    question: 'How can I join an event?',
    answer:
      'Explore the events page, choose an experience, and follow the booking steps on its details page. Event availability and booking options are shown for each event.',
  },
  {
    id: 'host-event',
    question: 'How can I host an event?',
    answer:
      'Share your event idea using the host enquiry form below. Your proposal is saved for the VIBE TOGETHER team to review.',
  },
  {
    id: 'free-paid',
    question: 'Are events free or paid?',
    answer:
      'Both free and paid events are available. Each event listing shows its price and any booking requirements before you continue.',
  },
  {
    id: 'cancel-booking',
    question: 'Can I cancel a booking?',
    answer:
      'Free development bookings can be managed from My Bookings. Paid booking cancellation needs to be handled by the configured booking service.',
  },
  {
    id: 'contact-support',
    question: 'How do I contact support?',
    answer:
      'Use the contact form on this page. Phone, email, social, and WhatsApp actions become available once those details are configured by the site owner.',
  },
]
