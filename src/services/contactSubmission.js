import { contactConfig } from '../data/contact.js'
import { API_BASE_URL } from '../config/api.js'

export async function submitContactRequest(type, payload) {
  if (!['contact', 'host-event'].includes(type)) {
    throw new Error('This enquiry type is not supported.')
  }

  if (contactConfig.apiConfigurationError) {
    throw new Error(contactConfig.apiConfigurationError)
  }

  let response

  try {
    const endpoint = contactConfig.apiUrl
      ? `${contactConfig.apiUrl}/${type}`
      : `${API_BASE_URL}/enquiries/${type}`
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error(
      'We could not reach the contact service. Please try again later.',
    )
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The contact service returned an invalid response. Please try again later.')
  }
  if (!response.ok) {
    throw new Error(result.message || `The contact service returned an error (${response.status}).`)
  }

  return { mode: 'sent', message: result.message }
}
