export default function FloatingParticles({ className = '', count = 7 }) {
  return (
    <div
      aria-hidden="true"
      className={`ambient-particles ${className}`.trim()}
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  )
}
