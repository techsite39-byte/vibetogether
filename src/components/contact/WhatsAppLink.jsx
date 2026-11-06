import { useId } from 'react'
import { MessageCircle } from 'lucide-react'
import { getWhatsAppUrl } from '../../utils/whatsapp.js'

export default function WhatsAppLink({
  className = '',
  label = 'Chat on WhatsApp',
  message = 'Hi VIBE TOGETHER, I would like to get in touch.',
}) {
  const url = getWhatsAppUrl(message)
  const noticeId = useId()

  return (
    <div className={`whatsapp-action ${className}`.trim()}>
      {url ? (
        <a
          className="whatsapp-action__button"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          <MessageCircle size={18} aria-hidden="true" />
          {label}
        </a>
      ) : (
        <>
          <button
            className="whatsapp-action__button is-unconfigured"
            type="button"
            disabled
            aria-describedby={noticeId}
          >
            <MessageCircle size={18} aria-hidden="true" />
            {label}
          </button>
          <span
            className="whatsapp-action__notice"
            id={noticeId}
            role="status"
          >
            WhatsApp contact is not configured yet.
          </span>
        </>
      )}
    </div>
  )
}
