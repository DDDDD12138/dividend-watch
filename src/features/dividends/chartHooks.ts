import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChartSelection } from './ChartTooltip'
import type { ChartLayer } from './model'

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
export function useChartSelection(
  width: number,
  height: number,
  data: object,
  layers: readonly ChartLayer[],
) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<
    (ChartSelection & { width: number; height: number; data: object }) | null
  >(null)
  // Clear transient selection before changed geometry/data paints. Legend choice remains with the page.
  if (
    active &&
    (active.width !== width || active.height !== height || active.data !== data)
  )
    setActive(null)
  const hide = useCallback(() => setActive(null), [])
  function select(node: EventTarget | null) {
    const target =
      node instanceof Element
        ? node.closest<SVGElement>('[data-chart-target]')
        : null
    const mode = layers.find(
      (layer) => layer === target?.getAttribute('data-chart-target'),
    )
    const next =
      target && root.current?.contains(target) && mode
        ? {
            target,
            mode,
            text: target.getAttribute('data-tooltip') ?? '',
            width,
            height,
            data,
          }
        : null
    setActive((previous) =>
      previous?.target === next?.target ? previous : next,
    )
  }
  useEffect(() => {
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [hide])
  return { root, active, select, hide }
}
