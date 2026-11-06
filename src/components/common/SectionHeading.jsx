export default function SectionHeading({
  align = 'left',
  as: Heading = 'h2',
  className = '',
  description,
  highlight,
  label,
  title,
  titleId,
}) {
  const highlightIndex =
    typeof title === 'string' &&
    typeof highlight === 'string' &&
    highlight.length > 0
      ? title.indexOf(highlight)
      : -1
  const classes = [
    'section-heading',
    `section-heading--${align}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={classes}>
      {label && <p className="section-heading__eyebrow">{label}</p>}
      {title && (
        <Heading className="section-heading__title" id={titleId}>
          {highlightIndex < 0 ? (
            title
          ) : (
            <>
              {title.slice(0, highlightIndex)}
              <span className="gradient-text">
                {title.slice(highlightIndex, highlightIndex + highlight.length)}
              </span>
              {title.slice(highlightIndex + highlight.length)}
            </>
          )}
        </Heading>
      )}
      {description && (
        <p className="section-heading__description">{description}</p>
      )}
    </header>
  )
}
