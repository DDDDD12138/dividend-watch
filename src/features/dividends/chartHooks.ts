import { useCallback, useState } from 'react'

export const CHART_BOTTOM_PADDING = 42
export const CHART_YEAR_LABEL_OFFSET = 25

/** Keep in sync with the responsive chart typography in dividends.css. */
export function observeChartTypography(update: () => void) {
  const compact = window.matchMedia('(max-width: 650px)')
  let disposed = false
  const measure = () => {
    if (!disposed) update()
  }
  measure()
  void document.fonts.ready.then(measure)
  document.fonts.addEventListener('loadingdone', measure)
  compact.addEventListener('change', measure)
  return () => {
    disposed = true
    document.fonts.removeEventListener('loadingdone', measure)
    compact.removeEventListener('change', measure)
  }
}

/** Plot width is controlled by ChartViewport; only its CSS height needs observing. */
export function useChartHeight() {
  const [height, setHeight] = useState(0)
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    setHeight(node.getBoundingClientRect().height)
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { height, measure }
}

export function useChartSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const update = ({ width, height }: { width: number; height: number }) => {
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      )
    }
    update(node.getBoundingClientRect())
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { size, measure }
}
