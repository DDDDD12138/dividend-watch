import { useLayoutEffect } from 'react'

// Only keep the last watchlist position for this page's lifetime.
let scrollY = 0

export function useWatchlistPosition() {
  useLayoutEffect(() => {
    window.scrollTo({ top: scrollY, behavior: 'instant' })
    const remember = () => {
      scrollY = window.scrollY
    }
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [])
}
