import { Link } from 'react-router-dom'

const variantClasses = {
  primary: 'button--primary',
  secondary: 'button--secondary',
  outline: 'button--outline',
}

export default function Button({
  as: Element,
  children,
  className = '',
  disabled = false,
  loading = false,
  loadingText = 'Loading...',
  to,
  type = 'button',
  variant = 'primary',
  ...props
}) {
  const classes = [
    'button',
    'ui-button',
    variantClasses[variant] ?? variantClasses.primary,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const isDisabled = disabled || loading

  if (to && isDisabled) {
    return (
      <span className={`${classes} is-disabled`} aria-disabled="true" {...props}>
        {loading && <span className="ui-button__spinner" aria-hidden="true" />}
        {loading ? loadingText : children}
      </span>
    )
  }

  if (to) {
    return (
      <Link className={classes} to={to} {...props}>
        {children}
      </Link>
    )
  }

  if (Element) {
    return (
      <Element
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <span className="ui-button__spinner" aria-hidden="true" />}
        {loading ? loadingText : children}
      </Element>
    )
  }

  return (
    <button
      className={classes}
      disabled={isDisabled}
      type={type}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  )
}
