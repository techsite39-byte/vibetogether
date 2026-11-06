import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { AdminNotice, AdminPageHeader, AdminPanel, AdminTable } from '../components/AdminUI.jsx'
import { useAdminData } from '../context/useAdminData.js'

function formatActivityDate(value) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ActivityLog() {
  const { activity, storageError } = useAdminData()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return activity.filter((entry) =>
      [entry.action, entry.affectedUser, entry.description, entry.actorRole]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term),
    )
  }, [activity, query])

  return (
    <div className="admin-page">
      <AdminPageHeader
        description="A record of administrative changes stored by the backend."
        eyebrow="Audit trail"
        title="Platform activity"
      />
      {storageError && <AdminNotice tone="error">{storageError}</AdminNotice>}
      <AdminPanel title={`${filtered.length} activity entries`}>
        <div className="admin-toolbar">
          <label className="admin-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search activities</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search action, user or description" value={query} /></label>
        </div>
        <AdminTable label="Admin activity log">
          <thead><tr><th scope="col">Action</th><th scope="col">Affected user / entity</th><th scope="col">Description</th><th scope="col">Actor</th><th scope="col">Date</th></tr></thead>
          <tbody>{filtered.map((entry) => (
            <tr key={entry.id}>
              <td><strong>{entry.action}</strong></td>
              <td>{entry.affectedUser}</td>
              <td>{entry.description}</td>
              <td>{entry.actorRole}</td>
              <td><time dateTime={entry.createdAt}>{formatActivityDate(entry.createdAt)}</time></td>
            </tr>
          ))}</tbody>
        </AdminTable>
        {!filtered.length && <p className="admin-empty">No activity matches your search.</p>}
      </AdminPanel>
    </div>
  )
}
