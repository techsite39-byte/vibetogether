import { useId } from 'react'
import { getWhatsAppUrl } from '../../utils/whatsapp.js'
import './WhatsAppLink.css'

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path d="M16 2.7A13 13 0 0 0 4.8 22.3L3 29l6.9-1.8A13 13 0 1 0 16 2.7Zm0 23.6c-2 0-4-.5-5.7-1.6l-.4-.2-4.1 1.1 1.1-4-.3-.4a10.5 10.5 0 1 1 9.4 5.1Zm5.8-7.8c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.7-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.5-.6.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.4 3.3c.2.2 2.3 3.4 5.5 4.8.8.4 1.4.6 1.9.7.8.3 1.5.2 2.1.1.7-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4Z" />
    </svg>
  )
}

export default function WhatsAppLink({
  className = '',
  iconOnly = false,
  label = 'Chat on WhatsApp',
  message = 'Hi VIBE TOGETHER, I would like to get in touch.',
}) {
  const url = getWhatsAppUrl(message)
  const noticeId = useId()

  return (
    <div className={`whatsapp-action ${className}`.trim()}>
      {url ? (
        <a
          aria-label={iconOnly ? label : undefined}
          className="whatsapp-action__button"
          href={url}
          rel="noreferrer"
          target="_blank"
          title={iconOnly ? label : undefined}
        >
          <WhatsAppIcon />
          <span className="whatsapp-action__label">{label}</span>
        </a>
      ) : (
        <>
          <button
            aria-label={
              iconOnly ? 'WhatsApp contact is not configured yet' : undefined
            }
            className="whatsapp-action__button is-unconfigured"
            type="button"
            disabled
            aria-describedby={noticeId}
            title={iconOnly ? 'WhatsApp contact is not configured yet' : undefined}
          >
            <WhatsAppIcon />
            <span className="whatsapp-action__label">{label}</span>
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
