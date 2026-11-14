import { useCallback, useState } from 'react'

export const CHART_BOTTOM_PADDING = 42
export const CHART_YEAR_LABEL_OFFSET = 25

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
