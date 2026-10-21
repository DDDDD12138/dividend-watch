import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip } from './tooltip'
import type { ChartLayer } from './model'

export interface ChartSelection {
  mode: ChartLayer
  text: string
  target: SVGElement
}
export function ChartTooltip({
  selection,
  onDismiss,
}: {
  selection: ChartSelection
  onDismiss: () => void
}) {
  const tooltip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = tooltip.current
    if (!element) return
    function position() {
      if (!selection.target.isConnected) {
        onDismiss()
        return
      }
      const target = selection.target.getBoundingClientRect()
      const { x, y } = placeTooltip(target, element!.getBoundingClientRect(), {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      })
      element!.style.transform = `translate3d(${x}px, ${y}px, 0)`
      element!.style.visibility = 'visible'
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [selection, onDismiss])
  return createPortal(
    <div className="chart-tooltip" role="tooltip" ref={tooltip}>
      {selection.text}
    </div>,
    document.body,
  )
}
