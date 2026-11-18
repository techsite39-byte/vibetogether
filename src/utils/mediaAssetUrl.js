import { API_BASE_URL } from '../config/api.js'

export function resolveMediaAssetUrl(url, apiBaseUrl = API_BASE_URL) {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/api/media/') ||
    apiBaseUrl.startsWith('/')
  ) {
    return url
  }

  const apiUrl = new URL(apiBaseUrl)
  return apiUrl.protocol === 'https:' ? new URL(url, apiUrl).toString() : url
}
