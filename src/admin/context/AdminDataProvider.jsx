import { useCallback, useEffect, useState } from 'react'
import { adminRequest } from '../services/adminApi.js'
import { AdminDataContext } from './AdminDataContext.js'
import { AdminNotice } from '../components/AdminUI.jsx'

const defaultPlatformSettings = {
  platformName: 'VIBE TOGETHER',
  tagline: 'Different People. One Vibe.',
  contactEmail: '',
  contactPhone: '',
  whatsappNumber: '',
  socialInstagram: '',
  socialYoutube: '',
  bookingPolicy: '',
  categories: [],
  notifications: {
    newBooking: true,
    eventSubmission: true,
    organizerApplication: true,
  },
}

const emptyWorkspace = {
  users: [],
  organizers: [],
  events: [],
  bookings: [],
  categories: [],
  testimonials: [],
  subscribers: [],
  enquiries: [],
  gallery: [],
  admins: [],
  activity: [],
  settings: defaultPlatformSettings,
}

function displayDate(value) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

function mapUser(user) {
  return {
    ...user,
    phone: user.mobile ?? user.phone ?? '',
    joinedAt: displayDate(user.createdAt ?? user.joinedAt),
  }
}

function mapOrganizer(organizer) {
  return {
    ...organizer,
    categoryIds: Array.isArray(organizer.categoryIds) ? organizer.categoryIds : [],
    joinedAt: displayDate(organizer.createdAt ?? organizer.joinedAt),
  }
}

function mapBooking(booking) {
  const attendee = booking.attendee ?? {}
  const event = booking.event ?? {}
  return {
    ...booking,
    customer: booking.customer ?? attendee.fullName ?? 'Unknown customer',
    customerEmail: booking.customerEmail ?? attendee.email ?? '',
    eventId: booking.eventId ?? event.id ?? '',
    organizerId: booking.organizerId ?? event.organizerId ?? '',
    ticketCount: booking.ticketCount ?? 1,
    amount: booking.amount ?? booking.total ?? 0,
    currency: booking.currency ?? 'INR',
    paymentStatus: booking.paymentStatus ?? 'not_required',
    createdAt: booking.createdAt ?? new Date().toISOString(),
    source: booking.source ?? 'booking',
  }
}

function mapActivity(item) {
  return {
    ...item,
    affectedUser: item.affectedUser ?? item.entityId ?? item.entity ?? 'Platform',
  }
}

function mapResourceRecord(resource, record) {
  if (resource === 'users') {
    return mapUser(record)
  }
  if (resource === 'organizers') {
    return mapOrganizer(record)
  }
  if (resource === 'bookings') {
    return mapBooking(record)
  }
  return record
}

function mapWorkspace(workspace) {
  const categories = workspace.categories ?? []
  return {
    ...emptyWorkspace,
    ...workspace,
    users: (workspace.users ?? []).map(mapUser),
    organizers: (workspace.organizers ?? []).map(mapOrganizer),
    bookings: (workspace.bookings ?? []).map(mapBooking),
    activity: (workspace.activity ?? []).map(mapActivity),
    settings: {
      ...defaultPlatformSettings,
      ...(workspace.settings ?? {}),
      categories: categories.map((category) => ({
        id: category.id,
        title: category.title,
        enabled: category.enabled,
      })),
    },
  }
}

export function AdminDataProvider({ children, actor }) {
  const [data, setData] = useState(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState('')

  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const workspace = await adminRequest('/admin/workspace')
      setData(mapWorkspace(workspace))
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Admin data could not be loaded.')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const mutate = useCallback(async (path, method, body, onSuccess) => {
    setStorageError('')
    try {
      const result = await adminRequest(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (onSuccess) {
        onSuccess(result)
      }
      await reload(false)
      return true
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'The admin update failed.')
      return false
    }
  }, [reload])

  const updateUser = useCallback((userId, updates) => {
    const body = { ...updates }
    if ('phone' in body) {
      body.mobile = body.phone
      delete body.phone
    }
    return mutate(`/admin/users/${encodeURIComponent(userId)}`, 'PATCH', body, ({ item }) => {
      setData((current) => ({
        ...current,
        users: current.users.map((user) => user.id === userId ? mapUser(item) : user),
      }))
    })
  }, [mutate])

  const deleteUser = useCallback((userId) => mutate(
    `/admin/users/${encodeURIComponent(userId)}`,
    'DELETE',
    undefined,
    () => setData((current) => ({
      ...current,
      users: current.users.filter((user) => user.id !== userId),
    })),
  ), [mutate])

  const createRecord = useCallback(async (resource, record) => {
    const created = await mutate(`/admin/${resource}`, 'POST', record, ({ item }) => {
      setData((current) => ({
        ...current,
        [resource]: [mapResourceRecord(resource, item), ...(current[resource] ?? [])],
      }))
    })
    return created
  }, [mutate])

  const updateRecord = useCallback((resource, id, updates) => mutate(
    `/admin/${resource}/${encodeURIComponent(id)}`,
    'PATCH',
    updates,
    ({ item }) => setData((current) => ({
      ...current,
      [resource]: (current[resource] ?? []).map((record) =>
        record.id === id ? mapResourceRecord(resource, item) : record,
      ),
    })),
  ), [mutate])

  const deleteRecord = useCallback((resource, id) => mutate(
    `/admin/${resource}/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    () => setData((current) => ({
      ...current,
      [resource]: (current[resource] ?? []).filter((record) => record.id !== id),
    })),
  ), [mutate])

  const updateEvent = useCallback((eventId, updates) => mutate(
    `/admin/events/${encodeURIComponent(eventId)}`,
    'PATCH',
    updates,
    ({ item }) => setData((current) => ({
      ...current,
      events: current.events.map((event) => event.id === eventId ? item : event),
    })),
  ), [mutate])

  const deleteEvent = useCallback((eventId) => mutate(
    `/admin/events/${encodeURIComponent(eventId)}`,
    'DELETE',
    undefined,
    () => setData((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId),
    })),
  ), [mutate])

  const updateOrganizer = useCallback((organizerId, updates) => mutate(
    `/admin/organizers/${encodeURIComponent(organizerId)}`,
    'PATCH',
    updates,
    ({ item }) => setData((current) => ({
      ...current,
      organizers: current.organizers.map((organizer) =>
        organizer.id === organizerId ? mapOrganizer(item) : organizer,
      ),
    })),
  ), [mutate])

  const updateBooking = useCallback((reference, updates) => mutate(
    `/admin/bookings/${encodeURIComponent(reference)}`,
    'PATCH',
    updates,
    ({ item }) => setData((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.reference === reference ? mapBooking(item) : booking,
      ),
    })),
  ), [mutate])

  const updateSettings = useCallback(async (settings) => {
    const { categories = [], ...platformSettings } = settings
    const saved = await mutate(
      '/admin/settings/platform',
      'PUT',
      platformSettings,
      ({ settings: savedSettings }) => setData((current) => ({
        ...current,
        settings: { ...current.settings, ...savedSettings },
      })),
    )
    if (!saved) {
      return false
    }

    for (const category of categories) {
      const updated = await mutate(
        `/admin/categories/${encodeURIComponent(category.id)}`,
        'PATCH',
        category,
        ({ item }) => setData((current) => ({
          ...current,
          categories: current.categories.map((record) =>
            record.id === category.id ? item : record,
          ),
          settings: {
            ...current.settings,
            categories: current.settings.categories.map((record) =>
              record.id === category.id ? item : record,
            ),
          },
        })),
      )
      if (!updated) {
        return false
      }
    }
    return true
  }, [mutate])

  return (
    <AdminDataContext.Provider
      value={{
        ...data,
        actor,
        loading,
        storageError,
        reload,
        createRecord,
        updateRecord,
        deleteRecord,
        updateUser,
        deleteUser,
        updateEvent,
        deleteEvent,
        updateOrganizer,
        updateBooking,
        updateSettings,
      }}
    >
      {loading && (
        <p className="admin-empty" role="status">
          Loading live workspace records…
        </p>
      )}
      {storageError && (
        <AdminNotice tone="error">
          {storageError}{' '}
          <button className="admin-text-link" onClick={() => void reload()} type="button">
            Retry
          </button>
        </AdminNotice>
      )}
      {children}
    </AdminDataContext.Provider>
  )
}
