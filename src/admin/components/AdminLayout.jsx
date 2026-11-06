import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ImagePlus,
  Inbox,
  Mail,
  MessageSquare,
  Settings,
  Shield,
  Users,
  UserRoundCog,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AdminDataProvider } from '../context/AdminDataProvider.jsx'
import {
  getAdminConfiguration,
  getAdminSession,
  signInAdmin,
  signOutAdmin,
} from '../services/adminApi.js'
import { AdminNotice } from './AdminUI.jsx'
import useScrollReveal from '../../hooks/useScrollReveal.js'
import './Admin.css'

const adminRevealSelector = '.admin-stats-grid > *, .admin-dashboard-grid > *'

const navigation = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/organizers', label: 'Organizers', icon: UserRoundCog },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
  { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { to: '/admin/testimonials', label: 'Testimonials', icon: MessageSquare },
  { to: '/admin/subscribers', label: 'Subscribers', icon: Mail },
  { to: '/admin/enquiries', label: 'Enquiries', icon: Inbox },
  { to: '/admin/gallery', label: 'Gallery', icon: ImagePlus },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/activity', label: 'Activity log', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

const roleLabels = {
  super_admin: 'Super Admin',
  admin: 'Admin',
}

function AdminSignIn({ configuration, loading, onAuthenticate, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      if (await onAuthenticate(username, password)) {
        setPassword('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-access">
      <section className="admin-access__card">
        <Link className="site-brand" to="/">
          <span className="site-brand__name">VIBE TOGETHER</span>
          <span className="site-brand__tagline">Secure admin workspace</span>
        </Link>
        <span className="admin-access__shield" aria-hidden="true">
          <Shield size={25} />
        </span>
        <p className="admin-eyebrow">Administrator sign-in</p>
        <h1>Welcome back.</h1>
        {loading ? (
          <p className="admin-access__description">Checking admin service configuration…</p>
        ) : !configuration?.configured ? (
          <AdminNotice tone="warning">
            Admin sign-in is not configured. Set ADMIN_USERNAME,
            ADMIN_PASSWORD_HASH, and ADMIN_SESSION_SECRET in the backend
            environment or secret manager, then restart the backend.
          </AdminNotice>
        ) : (
          <form className="admin-access__form" onSubmit={handleSubmit}>
            <label htmlFor="admin-username">Admin email</label>
            <input
              autoComplete="username"
              id="admin-username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
            <label htmlFor="admin-password">Password</label>
            <input
              autoComplete="current-password"
              id="admin-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <button className="button button--primary" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </form>
        )}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        <Link className="admin-access__back" to="/">
          Return to the public site
        </Link>
      </section>
    </div>
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [configuration, setConfiguration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')
  const adminMainRef = useRef(null)

  useEffect(() => {
    let active = true
    async function restoreSession() {
      try {
        const configured = await getAdminConfiguration()
        if (!active) {
          return
        }
        setConfiguration(configured)
        if (configured.configured) {
          try {
            setSession(await getAdminSession())
          } catch (error) {
            if (error.status !== 401) {
              setAccessError(error.message)
            }
          }
        }
      } catch (error) {
        if (active) {
          setAccessError(error instanceof Error ? error.message : 'Admin service is unavailable.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    restoreSession()
    return () => {
      active = false
    }
  }, [])

  useScrollReveal(
    adminMainRef,
    `${location.pathname}:${session?.role ?? 'signed-out'}`,
    adminRevealSelector,
  )

  async function authenticate(username, password) {
    try {
      setSession(await signInAdmin(username, password))
      setAccessError('')
      return true
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Admin sign-in failed.')
      return false
    }
  }

  async function logout() {
    try {
      await signOutAdmin()
      setSession(null)
      setAccessError('')
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Sign-out failed.')
    }
  }

  if (!session) {
    return (
      <AdminSignIn
        configuration={configuration}
        error={accessError}
        loading={loading}
        onAuthenticate={authenticate}
      />
    )
  }

  if (session.role === 'admin' && location.pathname === '/admin/settings') {
    return (
      <div className="admin-access">
        <section className="admin-access__card">
          <span className="admin-access__shield" aria-hidden="true">
            <Shield size={25} />
          </span>
          <p className="admin-eyebrow">Access restricted</p>
          <h1>Super Admin access required.</h1>
          <p className="admin-access__description">
            Signed in as {roleLabels[session.role] ?? session.role}. Platform
            settings require Super Admin access.
          </p>
          <Link className="button button--primary" to="/admin">
            Return to dashboard
          </Link>
        </section>
      </div>
    )
  }

  const visibleNavigation = navigation.filter(
    ({ to }) => session.role === 'super_admin' || to !== '/admin/settings',
  )

  return (
    <AdminDataProvider actor={session}>
      <div className="admin-layout admin-workspace">
        <aside className="admin-sidebar">
          <Link className="site-brand" to="/admin">
            <span className="site-brand__name">VIBE TOGETHER</span>
            <span className="site-brand__tagline">Control room</span>
          </Link>
          <div className="admin-sidebar__demo">
            <span aria-hidden="true" />
            LIVE DATABASE
          </div>
          <nav className="admin-nav" aria-label="Admin navigation">
            {visibleNavigation.map(({ end, icon: Icon, label, to }) => (
              <NavLink
                className={({ isActive }) =>
                  `admin-nav__link${isActive ? ' is-active' : ''}`
                }
                end={end}
                key={to}
                to={to}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <Link className="admin-back-link" to="/">
            Back to public site
          </Link>
          <div className="admin-sidebar__account">
            <div className="admin-sidebar__avatar" aria-hidden="true">
              VT
            </div>
            <div>
              <strong>{session.username}</strong>
              <span>{roleLabels[session.role]}</span>
            </div>
            <button
              aria-label="Sign out of admin"
              className="admin-icon-button"
              onClick={() => void logout()}
              type="button"
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </aside>
        <main className="admin-main" ref={adminMainRef}>
          <div className="admin-main__topbar">
            <span>Admin workspace <ChevronRight size={15} aria-hidden="true" /> {roleLabels[session.role]}</span>
            <span>CONNECTED TO MONGODB</span>
          </div>
          {accessError && <AdminNotice tone="error">{accessError}</AdminNotice>}
          <Outlet />
        </main>
      </div>
    </AdminDataProvider>
  )
}
