import test from 'node:test'
import assert from 'node:assert/strict'
import { heroBackgroundSlides } from '../src/data/homepage.js'

test('homepage uses the requested first hero asset without a srcSet', () => {
  assert.equal(heroBackgroundSlides.length, 4)
  assert.equal(heroBackgroundSlides[0].src, '/h0.png')
  assert.equal(heroBackgroundSlides[0].srcSet, undefined)
})

test('homepage preserves the later hero assets and responsive srcSets', () => {
  assert.deepEqual(heroBackgroundSlides.slice(1).map(({ src }) => src), [
    '/assets/optimized/hero/h2-1672-v1.webp',
    '/assets/optimized/hero/h3-1672-v1.webp',
    '/assets/optimized/hero/h4-1672-v1.webp',
  ])
  assert.ok(heroBackgroundSlides.slice(1).every(({ srcSet }) => typeof srcSet === 'string'))
  assert.match(heroBackgroundSlides[1].srcSet, /h2-480-v1\.webp 480w/)
  assert.match(heroBackgroundSlides[2].srcSet, /h3-960-v1\.webp 960w/)
  assert.match(heroBackgroundSlides[3].srcSet, /h4-1672-v1\.webp 1672w/)
})
