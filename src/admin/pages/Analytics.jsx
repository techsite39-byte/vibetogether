import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Users,
} from 'lucide-react'
import { AdminBarChart, AdminTrendChart } from '../components/AdminCharts.jsx'
import { AdminPageHeader, AdminPanel, AdminStatCard, AdminTable } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'
import { categorySeries, monthlySeries } from '../data/adminAnalytics.js'

export default function Analytics() {
  const { actor, bookings, events, organizers, users } = useAdminData()
  const organizerId = actor.role === 'organizer' ? 'org-201' : null
  const scopedEvents = organizerId ? events.filter((event) => event.organizerId === organizerId) : events
  const scopedBookings = organizerId ? bookings.filter((booking) => booking.organizerId === organizerId) : bookings
  const revenue = scopedBookings
    .filter((booking) => booking.paymentStatus === 'verified')
    .reduce((total, booking) => total + booking.amount, 0)
  const categoryItems = useMemo(() => categorySeries(scopedEvents), [scopedEvents])
  const userGrowth = monthlySeries(users)
  const eventCreation = monthlySeries(scopedEvents)
  const bookingTrends = monthlySeries(scopedBookings)
  const revenueTrends = monthlySeries(
    scopedBookings.filter((booking) => booking.paymentStatus === 'verified'),
    (booking) => booking.amount ?? booking.total ?? 0,
  )
  const topEvents = [...scopedEvents]
    .map((event) => ({
      ...event,
      bookings: scopedBookings.filter((booking) => booking.eventId === event.id).length,
    }))
    .sort((first, second) => second.bookings - first.bookings)
    .slice(0, 5)
  const topOrganizers = organizers.map((organizer) => ({
    ...organizer,
    bookings: scopedBookings.filter((booking) => booking.organizerId === organizer.id).length,
  })).sort((first, second) => second.bookings - first.bookings)
  const [range, setRange] = useState('12')

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Explore activity trends computed from records stored by the platform."
        eyebrow="Insights"
        title="Platform analytics"
        actions={<label className="admin-select"><span>View period</span><select onChange={(event) => setRange(event.target.value)} value={range}><option value="12">Last 12 months</option><option value="6">Last 6 months</option></select></label>}
      />
      <section className="admin-stats-grid" aria-label="Analytics overview">
        <AdminStatCard detail="Database profiles" icon={Users} label="Users" value={users.length} />
        <AdminStatCard detail="Stored listings" icon={CalendarDays} label="Events" tone="cyan" value={scopedEvents.length} />
        <AdminStatCard detail="Saved records" icon={ClipboardList} label="Bookings" tone="pink" value={scopedBookings.length} />
        <AdminStatCard detail="Verified payments only" icon={CircleDollarSign} label="Verified revenue" value={`₹${revenue.toLocaleString('en-IN')}`} />
      </section>
      <section className="admin-dashboard-grid">
        <AdminPanel title="User growth">
          <AdminTrendChart label="User growth" series={userGrowth.slice(-Number(range))} />
        </AdminPanel>
        <AdminPanel title="Event creation">
          <AdminTrendChart label="Event creation" series={eventCreation.slice(-Number(range))} />
        </AdminPanel>
        <AdminPanel title="Booking trends">
          <AdminTrendChart label="Booking trends" series={bookingTrends.slice(-Number(range))} />
        </AdminPanel>
        <AdminPanel title="Revenue trend (demo estimate)">
          <AdminTrendChart label="Verified revenue" series={revenueTrends.slice(-Number(range))} />
        </AdminPanel>
      </section>
      <section className="admin-dashboard-grid">
        <AdminPanel title="Category popularity">
          <AdminBarChart items={categoryItems} label="Events by category" valueLabel="Events" />
        </AdminPanel>
        <AdminPanel title="Free vs paid listings">
          <AdminBarChart
            items={[
              { label: 'Free events', value: scopedEvents.filter((event) => event.isFree).length },
              { label: 'Paid events', value: scopedEvents.filter((event) => !event.isFree).length },
            ]}
            label="Free versus paid events"
            valueLabel="Events"
          />
        </AdminPanel>
      </section>
      <section className="admin-dashboard-grid">
        <AdminPanel title="Top-performing events">
          <AdminTable label="Top events">
            <thead><tr><th scope="col">Event</th><th scope="col">Category</th><th scope="col">Bookings</th></tr></thead>
            <tbody>{topEvents.map((event) => <tr key={event.id}><td>{event.title}</td><td>{event.category}</td><td>{event.bookings}</td></tr>)}</tbody>
          </AdminTable>
        </AdminPanel>
        <AdminPanel title="Top organizers">
          <AdminTable label="Top demo organizers">
            <thead><tr><th scope="col">Organizer</th><th scope="col">Status</th><th scope="col">Bookings</th></tr></thead>
            <tbody>{topOrganizers.map((organizer) => <tr key={organizer.id}><td>{organizer.name}</td><td>{organizer.status}</td><td>{organizer.bookings}</td></tr>)}</tbody>
          </AdminTable>
        </AdminPanel>
      </section>
    </div>
  )
}
