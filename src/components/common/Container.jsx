export default function Container({
  as: Element = 'div',
  children,
  className = '',
  size = 'default',
  ...props
}) {
  const classes = ['container', size === 'wide' && 'container--wide', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  )
}
