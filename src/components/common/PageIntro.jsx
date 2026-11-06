export default function PageIntro({ title, description, eyebrow = 'Vibe Together' }) {
  return (
    <section className="page-intro container" aria-labelledby="page-title">
      <p className="section-heading__eyebrow">{eyebrow}</p>
      <h1 id="page-title" className="page-intro__title">
        {title}
      </h1>
      <p className="page-intro__description">{description}</p>
    </section>
  )
}
