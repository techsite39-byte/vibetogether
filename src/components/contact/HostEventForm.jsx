import { useState } from 'react'
import { Send } from 'lucide-react'
import Button from '../common/Button.jsx'
import { categories } from '../../data/categories.js'
import { submitContactRequest } from '../../services/contactSubmission.js'
import { validateHostEventForm } from '../../utils/contactValidation.js'
import ContactField from './ContactField.jsx'

const initialForm = {
  organizerName: '',
  email: '',
  phone: '',
  eventName: '',
  categoryId: '',
  expectedAttendees: '',
  proposedDate: '',
  description: '',
}

function localDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const minimumEventDate = localDateString(new Date())

export default function HostEventForm() {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(field, value) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
    setErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
    setSubmitError('')
    setSuccessMessage('')
  }

  function validateField(field) {
    const fieldError = validateHostEventForm(form)[field]
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }

      if (fieldError) {
        nextErrors[field] = fieldError
      } else {
        delete nextErrors[field]
      }

      return nextErrors
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationErrors = validateHostEventForm(form)
    setErrors(validationErrors)
    setSubmitError('')
    setSuccessMessage('')

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitContactRequest('host-event', {
        ...form,
        organizerName: form.organizerName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        eventName: form.eventName.trim(),
        expectedAttendees: Number(form.expectedAttendees),
        description: form.description.trim(),
      })

      setForm(initialForm)
      setSuccessMessage(result.message || 'Your event proposal was received and saved.')
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Your hosting enquiry could not be submitted. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="contact-form host-event-form" noValidate onSubmit={handleSubmit}>
      <div className="contact-form__grid">
        <ContactField
          error={errors.organizerName}
          id="host-organizer-name"
          label="Organizer name"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              autoComplete="name"
              maxLength={80}
              onBlur={() => validateField('organizerName')}
              onChange={(event) =>
                updateField('organizerName', event.target.value)
              }
              value={form.organizerName}
            />
          )}
        </ContactField>

        <ContactField error={errors.email} id="host-email" label="Email">
          {(fieldProps) => (
            <input
              {...fieldProps}
              autoComplete="email"
              maxLength={254}
              onBlur={() => validateField('email')}
              onChange={(event) => updateField('email', event.target.value)}
              type="email"
              value={form.email}
            />
          )}
        </ContactField>

        <ContactField error={errors.phone} id="host-phone" label="Phone">
          {(fieldProps) => (
            <input
              {...fieldProps}
              autoComplete="tel"
              maxLength={24}
              onBlur={() => validateField('phone')}
              onChange={(event) => updateField('phone', event.target.value)}
              type="tel"
              value={form.phone}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.eventName}
          id="host-event-name"
          label="Event name"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              maxLength={120}
              onBlur={() => validateField('eventName')}
              onChange={(event) => updateField('eventName', event.target.value)}
              value={form.eventName}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.categoryId}
          id="host-event-category"
          label="Event category"
        >
          {(fieldProps) => (
            <select
              {...fieldProps}
              onBlur={() => validateField('categoryId')}
              onChange={(event) =>
                updateField('categoryId', event.target.value)
              }
              value={form.categoryId}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title}
                </option>
              ))}
            </select>
          )}
        </ContactField>

        <ContactField
          error={errors.expectedAttendees}
          id="host-attendees"
          label="Expected attendees"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              max="10000"
              min="1"
              onBlur={() => validateField('expectedAttendees')}
              onChange={(event) =>
                updateField('expectedAttendees', event.target.value)
              }
              type="number"
              value={form.expectedAttendees}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.proposedDate}
          id="host-proposed-date"
          label="Proposed event date"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              min={minimumEventDate}
              onBlur={() => validateField('proposedDate')}
              onChange={(event) =>
                updateField('proposedDate', event.target.value)
              }
              type="date"
              value={form.proposedDate}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.description}
          id="host-description"
          label="Event description"
          hint="Share the format, location, and what attendees can expect."
        >
          {(fieldProps) => (
            <textarea
              {...fieldProps}
              className="contact-form__message"
              maxLength={3000}
              onBlur={() => validateField('description')}
              onChange={(event) =>
                updateField('description', event.target.value)
              }
              rows={5}
              value={form.description}
            />
          )}
        </ContactField>
      </div>

      {submitError && (
        <p className="contact-form__feedback contact-form__feedback--error" role="alert">
          {submitError}
        </p>
      )}
      {successMessage && (
        <p className="contact-form__feedback contact-form__feedback--success" role="status">
          {successMessage}
        </p>
      )}
      <Button
        className="contact-form__submit"
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingText="Sending event proposal..."
        type="submit"
      >
        Send hosting enquiry <Send size={17} aria-hidden="true" />
      </Button>
    </form>
  )
}
