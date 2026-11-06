function getTimestamp(value) {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}

export function sortEvents(items, sortBy) {
  const sortedEvents = [...items]

  switch (sortBy) {
    case 'newest':
      return sortedEvents.sort(
        (a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt),
      )
    case 'price-low':
      return sortedEvents.sort(
        (a, b) => (a.priceAmount ?? 0) - (b.priceAmount ?? 0),
      )
    case 'price-high':
      return sortedEvents.sort(
        (a, b) => (b.priceAmount ?? 0) - (a.priceAmount ?? 0),
      )
    case 'name':
      return sortedEvents.sort((a, b) => a.title.localeCompare(b.title))
    case 'upcoming':
    default:
      return sortedEvents.sort(
        (a, b) => getTimestamp(a.startsAt) - getTimestamp(b.startsAt),
      )
  }
}

export function filterEvents(
  items,
  {
    query = '',
    category = 'all',
    pricing = [],
    upcomingOnly = false,
    sortBy = 'upcoming',
    now = Date.now(),
  } = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = items.filter((event) => {
    const matchesCategory = category === 'all' || event.category === category
    const matchesPrice =
      pricing.length === 0 ||
      pricing.some((type) =>
        type === 'free' ? event.isFree : !event.isFree,
      )
    const matchesUpcoming =
      !upcomingOnly || getTimestamp(event.startsAt) >= now
    const searchableText = [event.title, event.location, event.category]
      .join(' ')
      .toLocaleLowerCase()

    return (
      matchesCategory &&
      matchesPrice &&
      matchesUpcoming &&
      (!normalizedQuery || searchableText.includes(normalizedQuery))
    )
  })

  return sortEvents(filtered, sortBy)
}
