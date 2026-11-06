import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function AdminPageHeader({ actions, description, eyebrow, title }) {
  return (
    <header className="admin-page-header">
      <div>
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="admin-page-header__description">{description}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  )
}

export function AdminStatCard({ detail, icon: Icon, label, tone = 'purple', value }) {
  return (
    <article className={`admin-stat-card admin-stat-card--${tone}`}>
      <span className="admin-stat-card__icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="admin-stat-card__label">{label}</span>
      <strong>{value}</strong>
      {detail && <span className="admin-stat-card__detail">{detail}</span>}
    </article>
  )
}

export function AdminPanel({ children, className = '', title, action }) {
  return (
    <section className={`admin-panel ${className}`.trim()}>
      {(title || action) && (
        <header className="admin-panel__header">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function AdminNotice({ children, tone = 'info' }) {
  return (
    <p className={`admin-notice admin-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function AdminDialog({ children, onClose, title }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <div
      className="admin-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="admin-dialog-title"
        aria-modal="true"
        className="admin-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="admin-dialog__header">
          <h2 id="admin-dialog-title">{title}</h2>
          <button
            aria-label="Close dialog"
            className="admin-icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function AdminTable({ children, label }) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  )
}

export function StatusBadge({ children, status = 'pending' }) {
  return (
    <span className={`admin-status-badge admin-status-badge--${status.replaceAll(' ', '-')}`}>
      {children}
    </span>
  )
}
