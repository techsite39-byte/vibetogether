export function monthlySeries(records, value = () => 1) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - 11 + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      key,
      label: new Intl.DateTimeFormat('en', { month: 'short' }).format(date),
      value: 0,
    }
  })
  const byMonth = new Map(months.map((month) => [month.key, month]))

  for (const record of records) {
    const date = new Date(record.createdAt)
    if (Number.isNaN(date.getTime())) {
      continue
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const month = byMonth.get(key)
    if (month) {
      month.value += value(record)
    }
  }

  return months.map(({ label, value: count }) => ({ label, value: count }))
}

export function categorySeries(events) {
  const counts = new Map()
  for (const event of events) {
    const label = event.category || 'Uncategorized'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, value]) => ({ label, value }))
}
