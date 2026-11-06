import { useEffect } from 'react'

export default function useScrollReveal(rootRef, routeKey, selector) {
  useEffect(() => {
    const root = rootRef.current

    if (
      !root ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    const observed = new Set()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return
          }

          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -7% 0px', threshold: 0.08 },
    )

    function observeElement(element) {
      if (observed.has(element)) {
        return
      }

      observed.add(element)
      element.style.setProperty(
        '--reveal-order',
        String((observed.size - 1) % 6),
      )
      element.classList.add('scroll-reveal')
      observer.observe(element)
    }

    function observeMatches(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return
      }

      if (node.matches(selector)) {
        observeElement(node)
      }

      node.querySelectorAll(selector).forEach(observeElement)
    }

    root.querySelectorAll(selector).forEach(observeElement)
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(observeMatches)
      })
    })
    mutationObserver.observe(root, { childList: true, subtree: true })

    return () => {
      mutationObserver.disconnect()
      observer.disconnect()
      observed.forEach((element) => {
        element.classList.remove('scroll-reveal', 'is-revealed')
        element.style.removeProperty('--reveal-order')
      })
    }
  }, [rootRef, routeKey, selector])
}
