import { useLayoutEffect, useRef, useState } from 'react'
import type { HistoryRange } from './model'

function revealButton(button: HTMLButtonElement) {
  const scroller = button.parentElement!
  const viewport = scroller.getBoundingClientRect()
  const bounds = button.getBoundingClientRect()
  const padding = parseFloat(getComputedStyle(scroller).paddingInlineStart)
  const left = bounds.left - viewport.left - padding
  const right = bounds.right - viewport.right + padding
  if (left < 0 || right > 0)
    scroller.scrollBy({ left: left < 0 ? left : right, behavior: 'instant' })
}

export function HistoryRanges({
  value,
  onChange,
}: {
  value: HistoryRange
  onChange: (value: HistoryRange) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useLayoutEffect(() => {
    const scroller = root.current!
    function updateEdges() {
      const start = scroller.scrollLeft > 1
      const end =
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1
      setEdges((previous) =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      )
    }
    function revealSelected() {
      const selected = scroller.querySelector<HTMLButtonElement>(
        '[aria-pressed="true"]',
      )!
      revealButton(selected)
      updateEdges()
    }
    revealSelected()
    const observer = new ResizeObserver(revealSelected)
    observer.observe(scroller)
    for (const button of scroller.children) observer.observe(button)
    scroller.addEventListener('scroll', updateEdges, { passive: true })
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', updateEdges)
    }
  }, [value])

  return (
    <div
      className="history-range-tools"
      data-overflow-start={edges.start}
      data-overflow-end={edges.end}
    >
      <div
        ref={root}
        className="history-ranges"
        role="group"
        aria-label="分红时间范围"
      >
        {(['5', '10', 'all'] as const).map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={value === range}
            onFocus={(event) => revealButton(event.currentTarget)}
            onClick={() => onChange(range)}
          >
            {range === 'all' ? '全部' : `近 ${range} 年`}
          </button>
        ))}
      </div>
    </div>
  )
}
