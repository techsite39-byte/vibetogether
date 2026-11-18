export function updateDemoEvent(events, eventId, updates) {
  return events.map((event) =>
    event.id === eventId ? { ...event, ...updates } : event,
  )
}

export function deleteDemoEvent(events, eventId) {
  return events.filter((event) => event.id !== eventId)
}

export function buildEventImageUpdate(existingImage, nextImage) {
  const existing = (existingImage ?? '').trim()
  const next = (nextImage ?? '').trim()
  return next === existing ? {} : { image: next }
}
