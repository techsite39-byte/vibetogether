const env = import.meta.env ?? {}
const configuredApiUrl = (env.VITE_API_URL ?? env.VITE_API_BASE_URL ?? '').trim()
const trimmedApiUrl = configuredApiUrl.replace(/\/+$/, '')

export const API_BASE_URL = trimmedApiUrl
  ? /\/api$/i.test(trimmedApiUrl)
    ? trimmedApiUrl
    : `${trimmedApiUrl}/api`
  : '/api'
