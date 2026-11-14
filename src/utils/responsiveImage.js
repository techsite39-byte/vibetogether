export function getResponsiveImageSrcSet(source) {
  if (!source?.startsWith('https://images.unsplash.com/')) {
    return undefined
  }

  const image = new URL(source)
  const sourceWidth = Number(image.searchParams.get('w'))
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0) {
    return undefined
  }

  const widths = [...new Set([480, 800, sourceWidth])]
    .filter((width) => width <= sourceWidth)
    .sort((a, b) => a - b)

  return widths
    .map((width) => {
      const candidate = new URL(image)
      candidate.searchParams.set('w', String(width))
      return `${candidate.href} ${width}w`
    })
    .join(', ')
}
