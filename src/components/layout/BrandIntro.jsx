import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import './BrandIntro.css'

const MOBILE_VIDEO_QUERY = '(max-width: 600px), (max-aspect-ratio: 4/5)'

function isExcludedRoute(pathname) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/booking/confirmation')
  )
}

export default function BrandIntro() {
  const location = useLocation()
  const videoRef = useRef(null)
  const fadeTimerRef = useRef(null)
  const hideTimerRef = useRef(null)
  const hasCompletedRef = useRef(false)
  const [videoSource, setVideoSource] = useState(() =>
    window.matchMedia(MOBILE_VIDEO_QUERY).matches
      ? '/assets/folder/logo-mobile.mp4'
      : '/assets/folder/logo.mp4',
  )
  const [phase, setPhase] = useState(() =>
    isExcludedRoute(location.pathname) ? 'hidden' : 'playing',
  )
  const isIntroActive = phase !== 'hidden'

  const clearTimers = () => {
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    fadeTimerRef.current = null
    hideTimerRef.current = null
  }

  const handleVideoEnd = () => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true
    setPhase('waiting')

    fadeTimerRef.current = window.setTimeout(() => {
      setPhase('fading')
      hideTimerRef.current = window.setTimeout(() => {
        setPhase('hidden')
      }, 500)
    }, 3000)
  }

  const handleSkip = () => {
    hasCompletedRef.current = true
    clearTimers()
    setPhase('hidden')
  }

  useEffect(() => {
    const mobileViewport = window.matchMedia(MOBILE_VIDEO_QUERY)
    const updateVideoSource = () => {
      setVideoSource(
        mobileViewport.matches
          ? '/assets/folder/logo-mobile.mp4'
          : '/assets/folder/logo.mp4',
      )
    }

    mobileViewport.addEventListener('change', updateVideoSource)
    return () => mobileViewport.removeEventListener('change', updateVideoSource)
  }, [])

  useEffect(() => {
    if (!isIntroActive) return undefined

    const bodyOverflow = document.body.style.overflow
    const documentOverflow = document.documentElement.style.overflow
    const appRoot = document.getElementById('root')
    const wasRootInert = appRoot?.inert ?? false

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    if (appRoot) appRoot.inert = true

    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = documentOverflow
      if (appRoot) appRoot.inert = wasRootInert
    }
  }, [isIntroActive])

  useEffect(() => {
    if (phase !== 'playing') return undefined

    const video = videoRef.current
    if (!video) return undefined

    video.muted = true
    video.defaultMuted = true

    const tryAutoplay = () => {
      if (!video.paused || hasCompletedRef.current) return

      video.play().catch((error) => {
        console.warn('Vibe Together intro autoplay was prevented:', error)
      })
    }

    tryAutoplay()
    video.addEventListener('canplay', tryAutoplay)

    return () => {
      video.removeEventListener('canplay', tryAutoplay)
    }
  }, [phase, videoSource])

  useEffect(() => () => clearTimers(), [])

  if (phase === 'hidden') return null

  return createPortal(
    <div
      className={`brand-intro${phase === 'fading' ? ' is-fading' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Vibe Together intro"
    >
      <video
        ref={videoRef}
        className="brand-intro__video"
        src={videoSource}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={handleVideoEnd}
        onError={() => console.error('Vibe Together intro video could not be loaded.')}
        aria-hidden="true"
      />
      <button
        className="brand-intro__skip"
        type="button"
        onClick={handleSkip}
      >
        Skip Intro
      </button>
    </div>,
    document.body,
  )
}
