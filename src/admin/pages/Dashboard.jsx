import {
  Activity,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Users,
  UserRoundCog,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminBarChart, AdminTrendChart } from '../components/AdminCharts.jsx'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminTable,
  StatusBadge,
} from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import { categorySeries, monthlySeries } from '../data/adminAnalytics.js'

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

export default function Dashboard() {
  const { activity, actor, bookings, categories, events, organizers, storageError, users } =
    useAdminData()
  const isOrganizer = actor.role === 'organizer'
  const scopedEvents = isOrganizer
    ? events.filter((event) => event.organizerId === 'org-201')
    : events
  const scopedBookings = isOrganizer
    ? bookings.filter((booking) => booking.organizerId === 'org-201')
    : bookings
  const paidBookings = scopedBookings.filter(
    (booking) => booking.paymentStatus === 'verified',
  )
  const verifiedRevenue = paidBookings.reduce(
    (total, booking) => total + booking.amount,
    0,
  )
  const latestActivity = activity.slice(0, 5)
  const userGrowth = monthlySeries(users)
  const eventCounts = new Map(categorySeries(events).map((item) => [item.label, item.value]))
  const eventCategories = categories.map((category) => ({
    label: category.title,
    value: eventCounts.get(category.title) ?? 0,
  }))

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="A live snapshot of records stored in the platform database."
        eyebrow="Control room"
        title="Good to see you."
        actions={<span className="admin-demo-chip">LIVE DATA</span>}
      />
      {storageError && <AdminNotice tone="error">{storageError}</AdminNotice>}

      <section className="admin-stats-grid" aria-label="Platform overview">
        <AdminStatCard
          detail="Database profiles"
          icon={Users}
          label="Registered users"
          value={users.length.toLocaleString('en-IN')}
        />
        <AdminStatCard
          detail="All recorded organizers"
          icon={UserRoundCog}
          label="Organizers"
          tone="pink"
          value={organizers.length.toLocaleString('en-IN')}
        />
        <AdminStatCard
          detail={`${scopedEvents.filter((event) => event.status === 'published').length} published`}
          icon={CalendarDays}
          label={isOrganizer ? 'Your events' : 'Total events'}
          tone="cyan"
          value={scopedEvents.length.toLocaleString('en-IN')}
        />
        <AdminStatCard
          detail={`${scopedEvents.filter((event) => event.status === 'pending').length} pending approval`}
          icon={Clock3}
          label="Pending events"
          tone="pink"
          value={scopedEvents.filter((event) => event.status === 'pending').length}
        />
        <AdminStatCard
          detail="Saved booking records"
          icon={ClipboardList}
          label="Total bookings"
          tone="cyan"
          value={scopedBookings.length.toLocaleString('en-IN')}
        />
        <AdminStatCard
          detail={
            paidBookings.length
              ? `${paidBookings.length} verified payment records`
              : 'No verified payment data'
          }
          icon={CircleDollarSign}
          label="Verified revenue"
          tone="pink"
          value={`₹${verifiedRevenue.toLocaleString('en-IN')}`}
        />
      </section>

      <section className="admin-dashboard-grid">
        <AdminPanel title="Community growth">
          <AdminTrendChart label="Registered users" series={userGrowth} />
        </AdminPanel>
        <AdminPanel title="Events by category">
          <AdminBarChart
            items={eventCategories}
            label="Events by category"
            valueLabel="Sample event interest"
          />
        </AdminPanel>
      </section>

      <section className="admin-dashboard-grid">
        <AdminPanel
          title="Recent platform activity"
          action={
            <Link className="admin-text-link" to="/admin/activity">
              View log
            </Link>
          }
        >
          {latestActivity.length ? (
            <ul className="admin-activity-list">
              {latestActivity.map((item) => (
                <li key={item.id}>
                  <span className="admin-activity-list__icon" aria-hidden="true">
                    <Activity size={17} />
                  </span>
                  <div>
                    <strong>{item.action}</strong>
                    <p>
                      {item.affectedUser} · {item.description}
                    </p>
                    <time dateTime={item.createdAt}>
                      {formatDateTime(item.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">No activity recorded yet.</p>
          )}
        </AdminPanel>

        <AdminPanel
          title="Events needing attention"
          action={
            <Link className="admin-text-link" to="/admin/events">
              Manage events
            </Link>
          }
        >
          <AdminTable label="Events awaiting review">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {scopedEvents
                .filter((event) => event.status === 'pending')
                .slice(0, 4)
                .map((event) => (
                  <tr key={event.id}>
                    <td>{event.title}</td>
                    <td>{event.category}</td>
                    <td>
                      <StatusBadge status={event.status}>Pending</StatusBadge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      </section>
    </div>
  )
}
