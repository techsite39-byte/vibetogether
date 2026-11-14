import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Loader2,
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
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AdminDataProvider } from '../context/AdminDataProvider.jsx'
import {
  getAdminConfiguration,
  getAdminSession,
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

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
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

  async function logout() {
    try {
      await signOutAdmin()
      setSession(null)
      navigate('/admin/login', { replace: true })
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Sign-out failed.')
    }
  }

  if (loading) {
    return (
      <div className="admin-access" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#c4b5fd' }}>
          <Loader2 className="admin-auth-spinner" size={32} style={{ margin: '0 auto 1rem', display: 'block' }} />
          <p>Verifying secure admin workspace session…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
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
            <img
              className="site-brand__logo"
              src="/assets/optimized/favicon-256-v1.webp"
              alt="Vibe Together"
              width="64"
              height="64"
            />
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
              {session.name ? session.name.slice(0, 2).toUpperCase() : (session.email ? session.email.slice(0, 2).toUpperCase() : 'VT')}
            </div>
            <div>
              <strong>{session.name || session.email || session.username || 'Admin'}</strong>
              <span>{roleLabels[session.role] ?? session.role}</span>
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
