export default function ContactField({
  children,
  error,
  hint,
  id,
  label,
  required = true,
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`contact-field${error ? ' contact-field--invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="contact-field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        required,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && (
        <p className="contact-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="contact-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
