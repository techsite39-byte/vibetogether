import { useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

export default function VideoCard({ video }) {
  const iframeRef = useRef(null)
  const [playerMounted, setPlayerMounted] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  function startPlayback() {
    setPlayerReady(false)
    setPlayerMounted(true)
    setIsPlaying(true)
  }

  function togglePlayback() {
    if (!playerReady) {
      return
    }

    const command = isPlaying ? 'pauseVideo' : 'playVideo'
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: command, args: [] }),
      'https://www.youtube-nocookie.com',
    )
    setIsPlaying((playing) => !playing)
  }

  function stopPlayback() {
    setPlayerReady(false)
    setIsPlaying(false)
    setPlayerMounted(false)
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    video.videoId,
  )}?autoplay=1&controls=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(
    window.location.origin,
  )}`

  return (
    <article className="video-card">
      <div className="video-card__media">
        {playerMounted ? (
          <iframe
            ref={iframeRef}
            className="video-card__player"
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setPlayerReady(true)}
            allowFullScreen
          />
        ) : (
          <>
            <img
              src={video.thumbnail}
              alt={video.thumbnailAlt}
              loading="lazy"
              decoding="async"
            />
            <button
              className="video-card__launch"
              type="button"
              aria-label={`Play ${video.title}`}
              onClick={startPlayback}
            >
              <span>
                <Play size={23} fill="currentColor" aria-hidden="true" />
              </span>
            </button>
          </>
        )}
      </div>
      <div className="video-card__content">
        <p className="video-card__category">{video.category}</p>
        <h3>{video.title}</h3>
        <p className="video-card__description">{video.description}</p>
        {playerMounted && (
          <div className="video-card__controls">
            {!playerReady && (
              <span className="video-card__loading" role="status">
                Loading video player...
              </span>
            )}
            <button
              type="button"
              disabled={!playerReady}
              onClick={togglePlayback}
              aria-label={isPlaying ? `Pause ${video.title}` : `Play ${video.title}`}
            >
              {isPlaying ? (
                <Pause size={17} aria-hidden="true" />
              ) : (
                <Play size={17} aria-hidden="true" />
              )}
              {isPlaying ? 'Pause video' : 'Play video'}
            </button>
            <button
              type="button"
              onClick={stopPlayback}
              aria-label={`Close ${video.title}`}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Close player
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
