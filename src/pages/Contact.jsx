import {
  ArrowDown,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Sparkles,
} from 'lucide-react'
import ContactCard from '../components/contact/ContactCard.jsx'
import ContactForm from '../components/contact/ContactForm.jsx'
import FAQAccordion from '../components/contact/FAQAccordion.jsx'
import HostEventForm from '../components/contact/HostEventForm.jsx'
import WhatsAppLink from '../components/contact/WhatsAppLink.jsx'
import Button from '../components/common/Button.jsx'
import Container from '../components/common/Container.jsx'
import { contactConfig, faqItems } from '../data/contact.js'
import './Contact.css'

export default function Contact() {
  const phoneDigits = contactConfig.phone.replace(/\D/g, '')
  const phoneHref =
    phoneDigits.length >= 7 && phoneDigits.length <= 15
      ? `tel:${contactConfig.phone.trim().replace(/[^\d+]/g, '')}`
      : ''
  const emailHref = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactConfig.email)
    ? `mailto:${contactConfig.email}`
    : ''

  return (
    <div className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-title">
        <div
          className="contact-hero__orb contact-hero__orb--one"
          aria-hidden="true"
        />
        <div
          className="contact-hero__orb contact-hero__orb--two"
          aria-hidden="true"
        />
        <div className="contact-hero__ring" aria-hidden="true" />
        <Container className="contact-hero__content">
          <p className="contact-eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            Good conversations start here
          </p>
          <h1 id="contact-title">
            LET&apos;S CONNECT
            <br />
            AND <span className="gradient-text">VIBE TOGETHER.</span>
          </h1>
          <p className="contact-hero__subtitle">
            Have questions? Want to host an event? We&apos;re here for you.
          </p>
          <div className="contact-hero__actions">
            <a className="button button--primary" href="#contact-form">
              Send us a message <ArrowDown size={17} aria-hidden="true" />
            </a>
            <WhatsAppLink
              message="Hi VIBE TOGETHER, I have a question and would love to connect."
            />
          </div>
          <p className="contact-hero__demo">
            Contact details are configurable. Unavailable details are not
            guessed or linked.
          </p>
        </Container>
      </section>

      <section
        className="contact-information contact-section"
        aria-labelledby="contact-options-title"
      >
        <Container>
          <div className="contact-section__heading">
            <div>
              <p className="contact-eyebrow">Find your way to us</p>
              <h2 id="contact-options-title">Choose what works for you.</h2>
              <p>
                Contact channels appear here as soon as the site owner
                configures them.
              </p>
            </div>
          </div>
          <div className="contact-cards">
            <ContactCard
              description="Call availability depends on the configured team line."
              href={phoneHref}
              icon={Phone}
              label="Phone"
              value={contactConfig.phone}
            />
            <ContactCard
              description="Open a chat with a ready-to-send hello."
              icon={MessageCircle}
              label="WhatsApp"
            >
              <WhatsAppLink
                className="whatsapp-action--inline"
                label="Start a conversation"
                message="Hi VIBE TOGETHER, I have a question and would love to connect."
              />
            </ContactCard>
            <ContactCard
              description="Send a note to the configured contact inbox."
              href={emailHref}
              icon={Mail}
              label="Email"
              value={contactConfig.email}
            />
            <ContactCard
              description="Our office location will be listed once configured."
              icon={MapPin}
              label="Office location"
              value={contactConfig.officeLocation}
            />
          </div>
          <section className="contact-social" aria-labelledby="contact-social-title">
            <div>
              <Share2 size={19} aria-hidden="true" />
              <h3 id="contact-social-title">Find us around the web</h3>
            </div>
            {contactConfig.socialLinks.length > 0 ? (
              <ul>
                {contactConfig.socialLinks.map(({ label, url }) => (
                  <li key={`${label}-${url}`}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Social media links are not configured yet. We don&apos;t link to
                placeholder accounts.
              </p>
            )}
          </section>
        </Container>
      </section>

      <section
        className="contact-enquiry contact-section"
        id="contact-form"
        aria-labelledby="contact-form-title"
      >
        <Container className="contact-enquiry__layout">
          <div className="contact-enquiry__intro">
            <p className="contact-eyebrow">We&apos;re listening</p>
            <h2 id="contact-form-title">What&apos;s on your mind?</h2>
            <p>
              Send a question about an event, a booking, a partnership, or
              anything else. Until an API is configured, this form only
              simulates a demo submission in your current browser session.
            </p>
            <span className="contact-demo-pill">DEMO · NOT SENT OR STORED</span>
          </div>
          <ContactForm />
        </Container>
      </section>

      <section
        className="host-event contact-section"
        id="host-event"
        aria-labelledby="host-event-title"
      >
        <Container className="host-event__layout">
          <div className="host-event__intro">
            <p className="contact-eyebrow">
              <Sparkles size={16} aria-hidden="true" />
              Bring your idea to life
            </p>
            <h2 id="host-event-title">Host an event with us.</h2>
            <p>
              Tell us what you&apos;re planning and who you hope to bring
              together. Hosting enquiries use the same demo/API-ready
              submission flow.
            </p>
            <WhatsAppLink
              className="whatsapp-action--inline"
              label="Ask about hosting"
              message="Hi VIBE TOGETHER, I have an event idea and would like to ask about hosting it."
            />
          </div>
          <div className="host-event__form">
            <p className="host-event__form-label">Event proposal</p>
            <HostEventForm />
          </div>
        </Container>
      </section>

      <section
        className="contact-faq contact-section"
        aria-labelledby="contact-faq-title"
      >
        <Container className="contact-faq__layout">
          <div className="contact-faq__intro">
            <p className="contact-eyebrow">A few quick answers</p>
            <h2 id="contact-faq-title">Frequently asked.</h2>
            <p>
              Need a hand with something else? Send us a note and we&apos;ll
              point you in the right direction.
            </p>
            <Button to="/events" variant="outline">
              Explore events
            </Button>
          </div>
          <FAQAccordion items={faqItems} />
        </Container>
      </section>
    </div>
  )
}
