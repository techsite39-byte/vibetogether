const pendingFrames = new WeakMap()

export function updateInteractiveTilt(event) {
  if (
    event.pointerType !== 'mouse' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }

  const element = event.currentTarget
  const pendingFrame = pendingFrames.get(element)

  if (pendingFrame) {
    pendingFrame.x = event.clientX
    pendingFrame.y = event.clientY
    return
  }

  const frame = { x: event.clientX, y: event.clientY, id: 0 }
  pendingFrames.set(element, frame)
  frame.id = window.requestAnimationFrame(() => {
    pendingFrames.delete(element)
    const bounds = element.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const x = (frame.x - bounds.left) / bounds.width
    const y = (frame.y - bounds.top) / bounds.height

    element.style.setProperty('--tilt-x', `${(0.5 - y) * 5}deg`)
    element.style.setProperty('--tilt-y', `${(x - 0.5) * 6}deg`)
    element.style.setProperty('--glow-x', `${x * 100}%`)
    element.style.setProperty('--glow-y', `${y * 100}%`)
  })
}

export function resetInteractiveTilt(event) {
  const element = event.currentTarget
  const pendingFrame = pendingFrames.get(element)
  if (pendingFrame) {
    window.cancelAnimationFrame(pendingFrame.id)
    pendingFrames.delete(element)
  }

  element.style.removeProperty('--tilt-x')
  element.style.removeProperty('--tilt-y')
  element.style.removeProperty('--glow-x')
  element.style.removeProperty('--glow-y')
}
