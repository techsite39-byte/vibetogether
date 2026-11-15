import { Share2 } from 'lucide-react'
import { getResponsiveImageSrcSet } from '../../utils/responsiveImage.js'

export default function GalleryCard({ memory, category, onOpen, onShare }) {
  return (
    <figure
      className={`gallery-card gallery-card--${memory.layout}${
        memory.featured ? ' gallery-card--featured' : ''
      }`}
    >
      <button
        className="gallery-card__image-button"
        type="button"
        onClick={() => onOpen(memory.id)}
        aria-label={`Open ${memory.title}: ${memory.caption}`}
      >
        <img
          src={memory.src}
          srcSet={getResponsiveImageSrcSet(memory.src)}
          sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
          alt={memory.alt}
          loading="lazy"
          decoding="async"
        />
        <span className="gallery-card__open-indicator" aria-hidden="true">
          View memory
        </span>
      </button>
      <figcaption className="gallery-card__caption">
        <div>
          <span>{category}</span>
          <h3>{memory.title}</h3>
          <p>{memory.caption}</p>
        </div>
        <button
          className="gallery-card__share"
          type="button"
          aria-label={`Share ${memory.title}`}
          onClick={() => onShare(memory)}
        >
          <Share2 size={17} aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  )
}
