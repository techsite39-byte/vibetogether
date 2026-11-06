import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessAdminRoute } from '../src/admin/auth/demoAdminAuth.js'

test('admin demo route permissions restrict settings and organizer access', () => {
  assert.equal(canAccessAdminRoute('super_admin', '/admin/settings'), true)
  assert.equal(canAccessAdminRoute('admin', '/admin/users'), true)
  assert.equal(canAccessAdminRoute('admin', '/admin/settings'), false)
  assert.equal(canAccessAdminRoute('organizer', '/admin/events'), true)
  assert.equal(canAccessAdminRoute('organizer', '/admin/users'), false)
  assert.equal(canAccessAdminRoute('customer', '/admin'), false)
  assert.equal(canAccessAdminRoute('unknown', '/admin'), false)
})
