import { ChevronDown } from 'lucide-react'

export default function FAQAccordion({ items }) {
  return (
    <div className="contact-faq__list">
      {items.map(({ answer, id, question }) => (
        <details className="contact-faq__item" key={id}>
          <summary>
            <span>{question}</span>
            <ChevronDown size={19} aria-hidden="true" />
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  )
}
