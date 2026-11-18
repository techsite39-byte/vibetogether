import test from 'node:test'
import assert from 'node:assert/strict'
import { heroBackgroundSlides } from '../src/data/homepage.js'

test('homepage uses all five requested hero WebP assets in order', () => {
  assert.deepEqual(
    heroBackgroundSlides.map(({ src }) => src),
    ['/h0.webp', '/h1.webp', '/h2.webp', '/h3.webp', '/h4.webp'],
  )
  assert.ok(heroBackgroundSlides.every(({ srcSet }) => srcSet === undefined))
})
