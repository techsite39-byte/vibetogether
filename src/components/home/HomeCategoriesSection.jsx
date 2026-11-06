import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categories } from '../../data/categories.js'
import './HomeCategoriesSection.css'

const AUTOPLAY_DELAY = 3800
const SWIPE_THRESHOLD = 48

function getCategoryAtPosition(activeIndex, position) {
  const categoryIndex = (activeIndex + position - 2 + categories.length) % categories.length
  return categories[categoryIndex]
}

export default function HomeCategoriesSection() {
  const stageRef = useRef(null)
  const touchStartX = useRef(null)
  const [activeIndex, setActiveIndex] = useState(2)
  const [isPaused, setIsPaused] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const updateMotionPreference = (event) => {
      setPrefersReducedMotion(event.matches)
    }

    motionPreference.addEventListener('change', updateMotionPreference)
    return () =>
      motionPreference.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    if (isPaused || prefersReducedMotion || document.hidden) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % categories.length)
    }, AUTOPLAY_DELAY)

    return () => window.clearInterval(intervalId)
  }, [activeIndex, isPaused, prefersReducedMotion])

  useEffect(() => {
    function handleVisibilityChange() {
      setIsPaused(document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  function showPrevious() {
    setActiveIndex((index) => (index - 1 + categories.length) % categories.length)
  }

  function showNext() {
    setActiveIndex((index) => (index + 1) % categories.length)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      showPrevious()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      showNext()
    }
  }

  function handleTouchStart(event) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(event) {
    if (touchStartX.current === null) {
      return
    }

    const touchEndX = event.changedTouches[0]?.clientX
    const distance = touchEndX - touchStartX.current
    touchStartX.current = null

    if (Math.abs(distance) < SWIPE_THRESHOLD) {
      return
    }

    if (distance > 0) {
      showPrevious()
    } else {
      showNext()
    }
  }

  function handleBlur(event) {
    if (!stageRef.current?.contains(event.relatedTarget)) {
      setIsPaused(false)
    }
  }

  const visibleCategories = categories.map((_, position) =>
    getCategoryAtPosition(activeIndex, position),
  )

  return null
}
