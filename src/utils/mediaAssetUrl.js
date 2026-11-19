import { API_BASE_URL } from '../config/api.js'

export function resolveMediaAssetUrl(url, apiBaseUrl = API_BASE_URL) {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/api/media/') ||
    typeof apiBaseUrl !== 'string' ||
    apiBaseUrl.startsWith('/')
  ) {
    return url
  }

  try {
    const apiUrl = new URL(apiBaseUrl)
    return apiUrl.protocol === 'https:' || apiUrl.protocol === 'http:'
      ? new URL(url, apiUrl).toString()
      : url
  } catch {
    return url
  }
}
