import { useMemo, useState } from 'react'
import { Search, Shield, UserRound } from 'lucide-react'
import { AdminDialog, AdminNotice, AdminPageHeader, AdminPanel, AdminTable, StatusBadge } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

const roleLabels = {
  organizer: 'Organizer',
  customer: 'Customer',
}

function UserDialog({ bookings, onClose, onDelete, onSave, user }) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'super_admin' ? 'admin' : user.role,
  })
  const [error, setError] = useState('')
  const history = bookings.filter((booking) => booking.customer === user.name)

  async function save(event) {
    event.preventDefault()
    if (
      form.name.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      setError('Enter a valid name and email address.')
      return
    }

    try {
      const saved = await onSave(user.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.phone.trim(),
        role: form.role,
      })
      if (saved) {
        onClose()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'User could not be updated.')
    }
  }

  return (
    <AdminDialog onClose={onClose} title={user.name}>
      <form className="admin-form" onSubmit={save}>
        <p className="admin-muted">
          Joined {user.joinedAt} · {history.length} booking records
        </p>
        <label>
          Full name
          <input
            maxLength={80}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            value={form.name}
          />
        </label>
        <label>
          Email
          <input
            maxLength={254}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            type="email"
            value={form.email}
          />
        </label>
        <label>
          Phone
          <input
            maxLength={24}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            value={form.phone}
          />
        </label>
        <label>
          Role
          {user.role === 'super_admin' ? (
            <span className="admin-form__locked">
              <Shield size={16} aria-hidden="true" /> Super Admin role is protected
            </span>
          ) : (
            <select
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              value={form.role}
            >
              <option value="customer">Customer</option>
              <option value="organizer">Organizer</option>
            </select>
          )}
        </label>
        {history.length > 0 && (
          <div className="admin-form__history">
            <strong>Booking history</strong>
            {history.map((booking) => (
              <span key={booking.reference}>
                {booking.reference} · {booking.ticketCount} ticket(s) · {booking.status}
              </span>
            ))}
          </div>
        )}
        <p className="admin-muted">
          Admin privileges are managed separately and cannot be assigned to a user profile.
        </p>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        <div className="admin-form__actions">
          <button className="admin-button admin-button--secondary" onClick={onClose} type="button">
            Close
          </button>
          {user.role !== 'super_admin' && (
            <>
              <button
                className="admin-button admin-button--danger"
                onClick={() => onDelete(user)}
                type="button"
              >
                Delete user
              </button>
              <button className="admin-button admin-button--primary" type="submit">
                Save changes
              </button>
            </>
          )}
        </div>
      </form>
    </AdminDialog>
  )
}

export default function ManageUsers() {
  const { bookings, deleteUser, storageError, updateUser, users } = useAdminData()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [error, setError] = useState('')
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return users
      .filter((user) => role === 'all' || user.role === role)
      .filter((user) =>
        [user.name, user.email, user.phone].join(' ').toLocaleLowerCase().includes(term),
      )
  }, [role, search, users])

  function toggleStatus(user) {
    try {
      updateUser(user.id, {
        status: user.status === 'active' ? 'inactive' : 'active',
      })
      setError('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'User status could not be changed.')
    }
  }

  function removeUser(user) {
    if (!window.confirm(`Delete the user "${user.name}"? This cannot be undone.`)) {
      return
    }

    try {
      deleteUser(user.id)
      setSelectedUser(null)
      setError('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'User could not be deleted.')
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="Search registered profiles, review booking history, and manage account status and customer or organizer roles."
        eyebrow="People"
        title="User management"
      />
      {(error || storageError) && <AdminNotice tone="error">{error || storageError}</AdminNotice>}
      <AdminPanel title={`${filteredUsers.length} users`}>
        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search users</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" value={search} />
          </label>
          <label className="admin-select">
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="all">All roles</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <AdminTable label="User management">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Joined</th>
              <th scope="col">Status</th>
              <th scope="col">Booking history</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <span className="admin-table__secondary">{user.email || user.phone || 'No contact details'}</span>
                </td>
                <td>{roleLabels[user.role] ?? user.role}</td>
                <td>{user.joinedAt}</td>
                <td><StatusBadge status={user.status}>{user.status}</StatusBadge></td>
                <td>{bookings.filter((booking) => booking.customer === user.name).length}</td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-button admin-button--small" onClick={() => setSelectedUser(user)} type="button">
                      <UserRound size={15} aria-hidden="true" /> View / edit
                    </button>
                    {user.role !== 'super_admin' && (
                      <button className="admin-button admin-button--small admin-button--secondary" onClick={() => toggleStatus(user)} type="button">
                        {user.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        {filteredUsers.length === 0 && <p className="admin-empty">No users match these filters.</p>}
      </AdminPanel>
      {selectedUser && (
        <UserDialog
          bookings={bookings}
          onClose={() => setSelectedUser(null)}
          onDelete={removeUser}
          onSave={updateUser}
          user={selectedUser}
        />
      )}
    </div>
  )
}
