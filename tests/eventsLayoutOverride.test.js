import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const globalCssPath = path.resolve(process.cwd(), 'src/styles/global.css')
const eventsCssPath = path.resolve(process.cwd(), 'src/pages/Events.css')

test('global.css defines .site-main with default clamp padding for standard pages', () => {
  const content = fs.readFileSync(globalCssPath, 'utf8')
  assert.match(content, /\.site-main\s*\{[^}]*padding-block:\s*clamp\(4rem,\s*10vw,\s*8rem\)/)
})

test('global.css overrides .site-main--events to padding-block: 0 to eliminate excessive gap', () => {
  const content = fs.readFileSync(globalCssPath, 'utf8')
  assert.match(content, /\.site-main--events\s*\{[^}]*padding-block:\s*0/)
})

test('global.css mobile media query includes .site-main--events override', () => {
  const content = fs.readFileSync(globalCssPath, 'utf8')
  const mobileMediaMatch = content.match(/@media\s*\(max-width:\s*47\.99rem\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(mobileMediaMatch, 'Mobile media query should exist')
  assert.match(mobileMediaMatch[1], /\.site-main--events\s*\{[^}]*padding-block:\s*0/)
})

test('Events.css reinforces .site-main--events padding-block: 0', () => {
  const content = fs.readFileSync(eventsCssPath, 'utf8')
  assert.match(content, /\.site-main--events[\s\S]*?padding-block:\s*0/)
})

test('Events.css configures comfortable hero padding below navbar', () => {
  const content = fs.readFileSync(eventsCssPath, 'utf8')
  assert.match(content, /\.events-hero\s*\{[^}]*padding-block:\s*clamp\(1rem,\s*2\.5vw,\s*1\.75rem\)/)
})
