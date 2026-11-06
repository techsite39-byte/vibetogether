import { useState } from 'react'
import { Send } from 'lucide-react'
import Button from '../common/Button.jsx'
import { enquiryTypes } from '../../data/contact.js'
import { submitContactRequest } from '../../services/contactSubmission.js'
import { validateContactForm } from '../../utils/contactValidation.js'
import ContactField from './ContactField.jsx'

const initialForm = {
  fullName: '',
  email: '',
  mobile: '',
  subject: '',
  enquiryType: '',
  message: '',
}

export default function ContactForm() {
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
    const fieldError = validateContactForm(form)[field]
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
    const validationErrors = validateContactForm(form)
    setErrors(validationErrors)
    setSubmitError('')
    setSuccessMessage('')

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitContactRequest('contact', {
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      })

      setForm(initialForm)
      setSuccessMessage(result.message || 'Your enquiry was received and saved.')
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Your enquiry could not be submitted. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="contact-form" noValidate onSubmit={handleSubmit}>
      <div className="contact-form__grid">
        <ContactField
          error={errors.fullName}
          id="contact-full-name"
          label="Full name"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              autoComplete="name"
              maxLength={80}
              onBlur={() => validateField('fullName')}
              onChange={(event) => updateField('fullName', event.target.value)}
              value={form.fullName}
            />
          )}
        </ContactField>

        <ContactField error={errors.email} id="contact-email" label="Email">
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

        <ContactField
          error={errors.mobile}
          id="contact-mobile"
          label="Mobile number"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              autoComplete="tel"
              maxLength={24}
              onBlur={() => validateField('mobile')}
              onChange={(event) => updateField('mobile', event.target.value)}
              type="tel"
              value={form.mobile}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.enquiryType}
          id="contact-enquiry-type"
          label="Enquiry type"
        >
          {(fieldProps) => (
            <select
              {...fieldProps}
              onBlur={() => validateField('enquiryType')}
              onChange={(event) =>
                updateField('enquiryType', event.target.value)
              }
              value={form.enquiryType}
            >
              <option value="">Choose an enquiry type</option>
              {enquiryTypes.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </ContactField>

        <ContactField
          error={errors.subject}
          id="contact-subject"
          label="Subject"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              maxLength={120}
              onBlur={() => validateField('subject')}
              onChange={(event) => updateField('subject', event.target.value)}
              value={form.subject}
            />
          )}
        </ContactField>

        <ContactField
          error={errors.message}
          id="contact-message"
          label="Message"
          hint="Tell us a little more so we can point you in the right direction."
        >
          {(fieldProps) => (
            <textarea
              {...fieldProps}
              className="contact-form__message"
              maxLength={2000}
              onBlur={() => validateField('message')}
              onChange={(event) => updateField('message', event.target.value)}
              rows={5}
              value={form.message}
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
        loadingText="Sending enquiry..."
        type="submit"
      >
        Send enquiry <Send size={17} aria-hidden="true" />
      </Button>
    </form>
  )
}
