import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Share2, X } from 'lucide-react'
import { getResponsiveImageSrcSet } from '../../utils/responsiveImage.js'

export default function GalleryLightbox({
  images,
  onClose,
  onNavigate,
  onShare,
  selectedIndex,
}) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const memory = images[selectedIndex]

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow

      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft') {
        onNavigate((selectedIndex - 1 + images.length) % images.length)
      } else if (event.key === 'ArrowRight') {
        onNavigate((selectedIndex + 1) % images.length)
      } else if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not(:disabled):not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [images.length, onClose, onNavigate, selectedIndex])

  return (
    <div
      className="gallery-lightbox"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-lightbox-title"
      tabIndex={-1}
    >
      <button
        className="gallery-lightbox__backdrop"
        type="button"
        tabIndex={-1}
        aria-label="Close memory viewer"
        onClick={onClose}
      />
      <div className="gallery-lightbox__panel">
        <button
          className="gallery-lightbox__close"
          type="button"
          aria-label="Close memory viewer"
          onClick={onClose}
          ref={closeButtonRef}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <button
          className="gallery-lightbox__previous"
          type="button"
          aria-label="View previous memory"
          onClick={() =>
            onNavigate((selectedIndex - 1 + images.length) % images.length)
          }
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <figure className="gallery-lightbox__figure">
          <img
            src={memory.src}
            srcSet={getResponsiveImageSrcSet(memory.src)}
            sizes="80vw"
            alt={memory.alt}
            fetchPriority="high"
            decoding="async"
          />
          <figcaption className="gallery-lightbox__caption">
            <div>
              <span>{memory.category}</span>
              <h2 id="gallery-lightbox-title">{memory.title}</h2>
              <p>{memory.caption}</p>
            </div>
            <button
              className="gallery-lightbox__share"
              type="button"
              aria-label={`Share ${memory.title}`}
              onClick={() => onShare(memory)}
            >
              <Share2 size={18} aria-hidden="true" />
              Share
            </button>
            <span className="gallery-lightbox__count">
              {selectedIndex + 1} / {images.length}
            </span>
          </figcaption>
        </figure>
        <button
          className="gallery-lightbox__next"
          type="button"
          aria-label="View next memory"
          onClick={() => onNavigate((selectedIndex + 1) % images.length)}
        >
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
