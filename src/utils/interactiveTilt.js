export function updateInteractiveTilt(event) {
  if (
    event.pointerType !== 'mouse' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }

  const element = event.currentTarget
  const bounds = element.getBoundingClientRect()
  const x = (event.clientX - bounds.left) / bounds.width
  const y = (event.clientY - bounds.top) / bounds.height

  element.style.setProperty('--tilt-x', `${(0.5 - y) * 5}deg`)
  element.style.setProperty('--tilt-y', `${(x - 0.5) * 6}deg`)
  element.style.setProperty('--glow-x', `${x * 100}%`)
  element.style.setProperty('--glow-y', `${y * 100}%`)
}

export function resetInteractiveTilt(event) {
  const element = event.currentTarget
  element.style.removeProperty('--tilt-x')
  element.style.removeProperty('--tilt-y')
  element.style.removeProperty('--glow-x')
  element.style.removeProperty('--glow-y')
}
