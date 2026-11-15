import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resetInteractiveTilt,
  updateInteractiveTilt,
} from '../src/utils/interactiveTilt.js'

function withMockWindow(run) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let nextFrameId = 0
  const frames = new Map()
  const cancelledFrames = []

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame(callback) {
        const id = ++nextFrameId
        frames.set(id, callback)
        return id
      },
      cancelAnimationFrame(id) {
        cancelledFrames.push(id)
        frames.delete(id)
      },
    },
  })

  try {
    run({ frames, cancelledFrames })
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      delete globalThis.window
    }
  }
}

function createElement() {
  const styles = new Map()
  let layoutReads = 0

  return {
    styles,
    get layoutReads() {
      return layoutReads
    },
    getBoundingClientRect() {
      layoutReads += 1
      return { left: 10, top: 20, width: 100, height: 200 }
    },
    style: {
      setProperty(name, value) {
        styles.set(name, value)
      },
      removeProperty(name) {
        styles.delete(name)
      },
    },
  }
}

test('coalesces pointer updates and measures layout once per animation frame', () => {
  withMockWindow(({ frames }) => {
    const element = createElement()
    const event = (clientX, clientY) => ({
      pointerType: 'mouse',
      currentTarget: element,
      clientX,
      clientY,
    })

    updateInteractiveTilt(event(20, 40))
    updateInteractiveTilt(event(60, 120))

    assert.equal(frames.size, 1)
    assert.equal(element.layoutReads, 0)
    frames.get(1)()

    assert.equal(element.layoutReads, 1)
    assert.equal(element.styles.get('--tilt-x'), '0deg')
    assert.equal(element.styles.get('--tilt-y'), '0deg')
    assert.equal(element.styles.get('--glow-x'), '50%')
    assert.equal(element.styles.get('--glow-y'), '50%')
  })
})

test('cancels a pending pointer update when the pointer leaves', () => {
  withMockWindow(({ frames, cancelledFrames }) => {
    const element = createElement()
    const event = { pointerType: 'mouse', currentTarget: element, clientX: 50, clientY: 60 }

    updateInteractiveTilt(event)
    resetInteractiveTilt(event)

    assert.deepEqual(cancelledFrames, [1])
    assert.equal(frames.size, 0)
    assert.equal(element.layoutReads, 0)
    assert.equal(element.styles.size, 0)
  })
})
