const STORAGE_KEY = 'vibe-together.demo-reviews.v1'

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local review storage is unavailable in this browser.')
  }

  return window.localStorage
}

function isDemoReview(review) {
  return (
    review &&
    typeof review.id === 'string' &&
    typeof review.name === 'string' &&
    typeof review.event === 'string' &&
    typeof review.categoryId === 'string' &&
    Number.isInteger(review.rating) &&
    review.rating >= 1 &&
    review.rating <= 5 &&
    typeof review.title === 'string' &&
    typeof review.quote === 'string' &&
    typeof review.eventDate === 'string' &&
    typeof review.createdAt === 'string'
  )
}

export function getDemoReviews() {
  let serializedReviews

  try {
    serializedReviews = getStorage().getItem(STORAGE_KEY)
  } catch {
    throw new Error(
      'Demo reviews could not be read from this browser. Check storage permissions and try again.',
    )
  }

  if (!serializedReviews) {
    return []
  }

  try {
    const reviews = JSON.parse(serializedReviews)

    if (!Array.isArray(reviews) || reviews.some((review) => !isDemoReview(review))) {
      throw new Error('Stored review data has an unexpected format.')
    }

    return reviews
  } catch {
    throw new Error(
      'Stored demo reviews could not be read. Clear the demo review data and try again.',
    )
  }
}

export function saveDemoReview(review) {
  if (!isDemoReview(review)) {
    throw new Error('This review is incomplete or has invalid data.')
  }

  const reviews = getDemoReviews()

  if (reviews.some((existingReview) => existingReview.id === review.id)) {
    throw new Error('This demo review could not be saved due to an ID conflict.')
  }

  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify([...reviews, review]))
  } catch {
    throw new Error(
      'Your demo review could not be saved in this browser. Check available storage and try again.',
    )
  }
}
