import { Check } from 'lucide-react'
import './BookingProgress.css'

const steps = ['Name', 'WhatsApp', 'Category', 'Gender & attendees', 'Payment']

export default function BookingProgress({ activeStep }) {
  return (
    <nav aria-label="Booking progress" className="booking-progress">
      <ol className="booking-progress__list">
        {steps.map((label, index) => (
          <li
            aria-current={index === activeStep ? 'step' : undefined}
            className={`booking-progress__step${index < activeStep ? ' is-complete' : ''}${index === activeStep ? ' is-active' : ''}`}
            key={label}
          >
            <span className="booking-progress__dot">
              {index < activeStep ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}
            </span>
            <span className="booking-progress__label">{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
