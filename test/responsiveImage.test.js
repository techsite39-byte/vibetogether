import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getResponsiveImageSrcSet } from '../src/utils/responsiveImage.js'

test('builds bounded responsive candidates for Unsplash images', () => {
  const srcSet = getResponsiveImageSrcSet(
    'https://images.unsplash.com/photo-123?auto=format&fit=crop&w=1200&q=82',
  )

  assert.deepEqual(
    srcSet.split(', ').map((candidate) => {
      const [url, descriptor] = candidate.split(' ')
      return [new URL(url).searchParams.get('w'), descriptor]
    }),
    [
      ['480', '480w'],
      ['800', '800w'],
      ['1200', '1200w'],
    ],
  )
})

test('does not upsize Unsplash images or rewrite other image sources', () => {
  const smallImage = getResponsiveImageSrcSet(
    'https://images.unsplash.com/photo-123?w=320',
  )

  assert.equal(smallImage, 'https://images.unsplash.com/photo-123?w=320 320w')
  assert.equal(
    getResponsiveImageSrcSet('/assets/photo.webp'),
    undefined,
  )
  assert.equal(
    getResponsiveImageSrcSet('https://example.com/photo.webp?w=1200'),
    undefined,
  )
})
