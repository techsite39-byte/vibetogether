const SESSION_KEY = 'vibe-together.admin-demo-session.v1'
const allowedDemoRoles = ['super_admin', 'admin', 'organizer', 'customer']
const permittedAdminRoles = ['super_admin', 'admin', 'organizer']

export function getDemoAdminSession() {
  if (!import.meta.env.DEV) {
    return null
  }

  const configuredRole = import.meta.env.VITE_ADMIN_DEMO_ROLE

  if (configuredRole) {
    if (!permittedAdminRoles.includes(configuredRole)) {
      return null
    }

    return { role: configuredRole, userId: 'demo-admin' }
  }

  try {
    const stored = window.localStorage.getItem(SESSION_KEY)

    if (!stored) {
      return null
    }

    const session = JSON.parse(stored)
    if (!allowedDemoRoles.includes(session?.role)) {
      return null
    }

    return { role: session.role, userId: 'demo-admin' }
  } catch {
    return null
  }
}

export function createDemoAdminSession(role) {
  if (!import.meta.env.DEV) {
    throw new Error('Demo admin access is available only in development.')
  }

  if (!permittedAdminRoles.includes(role)) {
    throw new Error('This role cannot access the admin demo workspace.')
  }

  if (import.meta.env.VITE_ADMIN_DEMO_ROLE) {
    throw new Error(
      'The demo role is fixed by VITE_ADMIN_DEMO_ROLE for this environment.',
    )
  }

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ role }))
  } catch {
    throw new Error('The demo session could not be saved in this browser.')
  }
}

export function clearDemoAdminSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    throw new Error('The demo session could not be cleared from this browser.')
  }
}

export function canAccessAdminRoute(role, route) {
  if (!permittedAdminRoles.includes(role)) {
    return false
  }

  if (role === 'super_admin') {
    return true
  }

  const superAdminOnlyRoutes = ['/admin/settings']
  const adminOnlyRoutes = [
    '/admin/users',
    '/admin/organizers',
    '/admin/activity',
  ]

  if (role === 'organizer') {
    return !adminOnlyRoutes.includes(route) && !superAdminOnlyRoutes.includes(route)
  }

  return !superAdminOnlyRoutes.includes(route)
}
