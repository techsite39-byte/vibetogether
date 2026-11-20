import test from 'node:test'
import assert from 'node:assert/strict'

// Test the scoping logic matching AdminDataProvider's error isolation contract
function extractScopeFromPath(path) {
  if (typeof path !== 'string') return 'general'
  const clean = path.replace(/^\/?admin\/?/, '').split('/')[0]
  return clean || 'general'
}

class TestErrorScopeManager {
  constructor() {
    this.storageError = ''
    this.scopedErrors = {}
  }

  onNavigation() {
    this.storageError = ''
    this.scopedErrors = {}
  }

  onReloadFailure(message) {
    this.storageError = message
  }

  onReloadSuccess() {
    this.storageError = ''
  }

  startMutation(path, customScope) {
    const scope = customScope || extractScopeFromPath(path)
    delete this.scopedErrors[scope]
  }

  mutationSuccess(path, customScope) {
    const scope = customScope || extractScopeFromPath(path)
    delete this.scopedErrors[scope]
  }

  mutationFailure(path, message, customScope) {
    const scope = customScope || extractScopeFromPath(path)
    this.scopedErrors[scope] = message
  }

  get eventError() {
    return this.scopedErrors.events || ''
  }

  get bookingError() {
    return this.scopedErrors.bookings || ''
  }

  get userError() {
    return this.scopedErrors.users || ''
  }
}

test('extractScopeFromPath correctly categorizes admin resource routes', () => {
  assert.equal(extractScopeFromPath('/admin/bookings/6afcb6145b9ed61284336bc4'), 'bookings')
  assert.equal(extractScopeFromPath('/admin/events/sing-along'), 'events')
  assert.equal(extractScopeFromPath('/admin/users/user-1'), 'users')
  assert.equal(extractScopeFromPath('/admin/settings/platform'), 'settings')
  assert.equal(extractScopeFromPath('/admin/'), 'general')
})

test('booking failure does not leak into event management or global storage error', () => {
  const manager = new TestErrorScopeManager()

  manager.startMutation('/admin/bookings/6afcb6145b9ed61284336bc4')
  manager.mutationFailure('/admin/bookings/6afcb6145b9ed61284336bc4', 'Booking record was not found.')

  assert.equal(manager.bookingError, 'Booking record was not found.')
  assert.equal(manager.eventError, '', 'Event management must not see booking errors')
  assert.equal(manager.storageError, '', 'Global workspace load error must not be set on mutation failure')
})

test('event failure remains visible in event management without affecting bookings', () => {
  const manager = new TestErrorScopeManager()

  manager.startMutation('/admin/events/event-1')
  manager.mutationFailure('/admin/events/event-1', 'Events with booking records cannot be deleted. Cancel the event instead.')

  assert.equal(manager.eventError, 'Events with booking records cannot be deleted. Cancel the event instead.')
  assert.equal(manager.bookingError, '')
})

test('independent mutations do not overwrite each other’s scoped errors', () => {
  const manager = new TestErrorScopeManager()

  manager.mutationFailure('/admin/bookings/VT-100', 'Booking record was not found.')
  manager.mutationFailure('/admin/events/evt-200', 'Event status could not be changed.')

  assert.equal(manager.bookingError, 'Booking record was not found.')
  assert.equal(manager.eventError, 'Event status could not be changed.')

  // Retrying events and succeeding only clears events
  manager.startMutation('/admin/events/evt-200')
  manager.mutationSuccess('/admin/events/evt-200')

  assert.equal(manager.eventError, '')
  assert.equal(manager.bookingError, 'Booking record was not found.', 'Booking error remains until cleared or retried')
})

test('successful retry clears the relevant stale error', () => {
  const manager = new TestErrorScopeManager()

  manager.mutationFailure('/admin/bookings/6afcb6145b9ed61284336bc4', 'Booking record was not found.')
  assert.equal(manager.bookingError, 'Booking record was not found.')

  manager.startMutation('/admin/bookings/6afcb6145b9ed61284336bc4')
  manager.mutationSuccess('/admin/bookings/6afcb6145b9ed61284336bc4')

  assert.equal(manager.bookingError, '')
})

test('navigation clears stale scoped errors and storage error', () => {
  const manager = new TestErrorScopeManager()

  manager.mutationFailure('/admin/bookings/6afcb6145b9ed61284336bc4', 'Booking record was not found.')
  manager.mutationFailure('/admin/events/sing-along', 'Event could not be deleted.')
  manager.onReloadFailure('Network timeout')

  assert.ok(manager.bookingError)
  assert.ok(manager.eventError)
  assert.ok(manager.storageError)

  manager.onNavigation()

  assert.equal(manager.bookingError, '')
  assert.equal(manager.eventError, '')
  assert.equal(manager.storageError, '')
})
