export default function ContactCard({
  description,
  icon: Icon,
  label,
  value,
  href,
  children,
}) {
  return (
    <article className="contact-card">
      <span className="contact-card__icon" aria-hidden="true">
        <Icon size={21} />
      </span>
      <div className="contact-card__content">
        <h3>{label}</h3>
        {href ? (
          <a className="contact-card__value" href={href}>
            {value}
          </a>
        ) : (
          <p className="contact-card__value">
            {value || 'Not configured yet'}
          </p>
        )}
        {description && <p>{description}</p>}
        {children}
      </div>
    </article>
  )
}
