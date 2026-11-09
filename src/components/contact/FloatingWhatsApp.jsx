import WhatsAppLink from './WhatsAppLink.jsx'

const welcomeMessage = [
  '✨ VIBE TOGETHER ✨',
  '',
  'Hey! 👋 Welcome to Vibe Together!',
  '',
  'Your next story starts here! 💜',
  '',
  "We're here to help you discover exciting experiences, connect with amazing people and create unforgettable memories.",
  '',
  "Whether you have a booking enquiry, need assistance or want to know more about our experiences, we're happy to help!",
  '',
  "Let's vibe together! 🎉",
  '',
  'What would you like to know?',
].join('\n')

const whatsappUrl = `https://wa.me/918778595810?text=${encodeURIComponent(welcomeMessage)}`

export default function FloatingWhatsApp() {
  return (
    <WhatsAppLink
      className="whatsapp-action--floating"
      href={whatsappUrl}
      iconOnly
      label="WhatsApp"
    />
  )
}
