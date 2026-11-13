const productionApiUrl = 'https://vibetogether-ahgy.onrender.com/api'

export function resolveApiBaseUrl(env = import.meta.env ?? {}) {
  const configuredApiUrl = (env.VITE_API_URL ?? env.VITE_API_BASE_URL ?? '').trim()
  const trimmedApiUrl = configuredApiUrl.replace(/\/+$/, '')

  if (trimmedApiUrl) {
    return /\/api$/i.test(trimmedApiUrl)
      ? trimmedApiUrl
      : `${trimmedApiUrl}/api`
  }

  return env.PROD ? productionApiUrl : '/api'
}

export const API_BASE_URL = resolveApiBaseUrl()
