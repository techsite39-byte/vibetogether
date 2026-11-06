export default function Loader({
  className = '',
  label = 'Loading',
  size = 'medium',
}) {
  const classes = ['ui-loader', `ui-loader--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} role="status" aria-live="polite">
      <span className="ui-loader__spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
