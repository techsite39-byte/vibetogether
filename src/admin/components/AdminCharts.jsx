function buildPath(values, width, height, padding) {
  const maximum = Math.max(...values, 1)
  const step = (width - padding * 2) / Math.max(values.length - 1, 1)

  return values
    .map((value, index) => {
      const x = padding + step * index
      const y = height - padding - (value / maximum) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

export function AdminTrendChart({ label, series }) {
  const width = 720
  const height = 220
  const padding = 18
  const points = series.map((item, index) => ({
    label:
      typeof item === 'object' && item !== null && typeof item.label === 'string'
        ? item.label
        : `Period ${index + 1}`,
    value:
      typeof item === 'number'
        ? item
        : typeof item?.value === 'number' && Number.isFinite(item.value)
          ? item.value
          : 0,
  }))
  const path = buildPath(points.map((point) => point.value), width, height, padding)

  return (
    <figure className="admin-chart">
      <svg
        aria-label={`${label} trend, simulated demonstration data`}
        className="admin-chart__svg"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="admin-trend-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#a82bff" stopOpacity=".4" />
            <stop offset="100%" stopColor="#773bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding}
            x2={width - padding}
            y1={height * fraction}
            y2={height * fraction}
            stroke="rgba(255,255,255,.09)"
            strokeDasharray="4 7"
          />
        ))}
        <path
          d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
          fill="url(#admin-trend-gradient)"
        />
        <path
          d={path}
          fill="none"
          stroke="#a82bff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
      <figcaption className="admin-chart__caption">
        <span>Last 12 demo periods</span>
        <span>SIMULATED DATA</span>
      </figcaption>
      <details className="admin-chart__data">
        <summary>View chart data</summary>
        <ol>
          {points.map(({ label: period, value }, index) => (
            <li key={`${label}-${index}`}>
              {period}: {value.toLocaleString('en-IN')}
            </li>
          ))}
        </ol>
      </details>
    </figure>
  )
}

export function AdminBarChart({ label, items, valueLabel = 'Items' }) {
  const maximum = Math.max(...items.map((item) => item.value), 1)

  return (
    <figure className="admin-bar-chart">
      <ul className="admin-bar-chart__list" aria-label={label}>
        {items.map((item) => (
          <li className="admin-bar-chart__item" key={item.label}>
            <span className="admin-bar-chart__label">{item.label}</span>
            <span className="admin-bar-chart__track">
              <span
                className="admin-bar-chart__fill"
                style={{ width: `${(item.value / maximum) * 100}%` }}
              />
            </span>
            <strong>{item.value.toLocaleString('en-IN')}</strong>
          </li>
        ))}
      </ul>
      <figcaption className="admin-chart__caption">
        <span>{valueLabel}</span>
        <span>SIMULATED DATA</span>
      </figcaption>
    </figure>
  )
}
