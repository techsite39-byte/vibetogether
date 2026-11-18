import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homeSource = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8')

test('homepage renders its public events feed and all-events navigation', () => {
  assert.match(homeSource, /const \{ events, loading: eventsLoading, error: eventsError \} = usePublicEvents\(\)/)
  assert.match(homeSource, /const homepageEvents = events\.slice\(0, 4\)/)
  assert.match(homeSource, /className="home-section home-events"/)
  assert.match(homeSource, /className="home-events__grid"/)
  assert.match(homeSource, /homepageEvents\.map\(\(event\)/)
  assert.match(homeSource, /<EventCard\b/)
  assert.match(homeSource, /to="\/events"/)
})
