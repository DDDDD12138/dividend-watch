import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react'
import { useChartSize } from './chartHooks'
import {
  chartViewportLayout,
  sameChartMeasurements,
  scrollToYear,
  yearAtViewportStart,
  type ChartMeasurements,
} from './chartViewport'
import './chart-viewport.css'
import {
  SharedViewContext,
  PlotViewportContext,
  useChartViewState,
  usePlotViewport,
} from './chartViewportContext'

/** One active year window for both charts, scoped to the current company page. */
export function ChartViewProvider({ children }: { children: ReactNode }) {
  const value = useChartViewState()
  return (
    <SharedViewContext.Provider value={value}>
      {children}
    </SharedViewContext.Provider>
  )
}

export function ChartViewport({
  kind,
  years,
  children,
}: {
  kind: 'dividend' | 'allocation'
  years: number[]
  children: ReactNode
}) {
  const shared = useContext(SharedViewContext)
  const local = useChartViewState()
  const {
    expanded: requested,
    setExpanded,
    getYear,
    setYear,
    measurements: knownMeasurements,
    report: reportShared,
  } = shared ?? local
  const scroller = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLDivElement>(null)
  const restoredOffset = useRef<number | null>(null)
  const [axisTarget, setAxisTarget] = useState<HTMLDivElement | null>(null)
  const [measurements, setMeasurements] = useState<ChartMeasurements | null>(
    null,
  )
  const { size, measure } = useChartSize()
  const viewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node
      return measure(node)
    },
    [measure],
  )
  const scope = years.join(',')
  const measurementKey = `${kind}:${scope}`
  const peerKey = `${kind === 'dividend' ? 'allocation' : 'dividend'}:${scope}`
  const report = useCallback(
    (next: ChartMeasurements) => {
      reportShared(measurementKey, next)
      setMeasurements((previous) =>
        sameChartMeasurements(previous, next) ? previous : next,
      )
    },
    [reportShared, measurementKey],
  )
  const ready =
    size.width > 0 &&
    years.length > 0 &&
    measurements?.widths.length === years.length
  const ownLayout = ready
    ? chartViewportLayout(size.width, measurements!)
    : null
  const peerMeasurements = requested
    ? knownMeasurements.get(peerKey)
    : undefined
  const peerLayout =
    ready && peerMeasurements
      ? chartViewportLayout(size.width, peerMeasurements)
      : null
  // Keep comparison mode if either visited chart needs expansion at this width.
  // Both use the same column spacing while their independently measured axes stay fixed.
  const layout = ownLayout && {
    crowded: ownLayout.crowded || !!peerLayout?.crowded,
    expandedWidth: Math.max(
      ownLayout.expandedWidth,
      peerLayout
        ? peerLayout.expandedWidth - peerMeasurements!.left + measurements!.left
        : 0,
    ),
  }
  const expanded = requested && (layout === null || layout.crowded)
  const crowded = layout?.crowded
  const width = expanded && layout ? layout.expandedWidth : size.width
  const scrolling = expanded && width > size.width + 1
  const left = measurements?.left ?? 0
  const step = years.length ? (width - left - 12) / years.length : 0
  const firstYear = years[0]

  useLayoutEffect(() => {
    const node = scroller.current
    if (
      requested &&
      crowded === false &&
      node &&
      Math.abs(node.getBoundingClientRect().width - size.width) < 0.5
    )
      setExpanded(false)
  }, [requested, crowded, size.width, setExpanded])

  useLayoutEffect(() => {
    const node = scroller.current,
      sample = probe.current
    const wrapper = node?.parentElement
    if (!node || !sample || !wrapper) return
    function reserveSpace() {
      // Native scrollbars consume this space only when needed. Overlay bars consume zero.
      const nativeHeight = sample!.offsetHeight - sample!.clientHeight
      const occupiedHeight = node!.offsetHeight - node!.clientHeight
      const value = `${Math.max(0, nativeHeight - occupiedHeight)}px`
      if (wrapper!.style.getPropertyValue('--chart-scrollbar-space') !== value)
        wrapper!.style.setProperty('--chart-scrollbar-space', value)
    }
    reserveSpace()
    const observer = new ResizeObserver(reserveSpace)
    observer.observe(node, { box: 'border-box' })
    observer.observe(sample)
    return () => observer.disconnect()
  }, [])

  function synchronizeYear() {
    const node = scroller.current
    if (
      !expanded ||
      !ready ||
      !node ||
      step <= 0 ||
      node.scrollWidth <= node.clientWidth + 1
    )
      return
    // Programmatic restoration must not replace the common year with a transient or
    // boundary-clamped value when the other chart is still measuring its labels.
    if (
      restoredOffset.current !== null &&
      Math.abs(node.scrollLeft - restoredOffset.current) < 1
    )
      return
    restoredOffset.current = null
    setYear(
      yearAtViewportStart(node.scrollLeft, {
        firstYear,
        step,
        maximum: node.scrollWidth - node.clientWidth,
      }),
    )
  }
  useLayoutEffect(() => {
    const node = scroller.current
    if (!node || !ready || step <= 0) return
    if (!expanded) {
      restoredOffset.current = 0
      node.scrollLeft = 0
      return
    }
    const maximum = Math.max(0, node.scrollWidth - node.clientWidth)
    if (maximum > 0) {
      node.scrollLeft = scrollToYear(getYear(), { firstYear, step, maximum })
      restoredOffset.current = node.scrollLeft
    }
  }, [expanded, ready, width, size.width, firstYear, step, getYear])

  const plotContext = useMemo(
    () => ({ report, axisTarget, scrolling }),
    [report, axisTarget, scrolling],
  )
  return (
    <PlotViewportContext.Provider value={plotContext}>
      <div
        className="chart-viewport"
        style={{ '--chart-viewport-width': `${size.width}px` } as CSSProperties}
      >
        <div className="chart-scrollbar-probe" ref={probe} aria-hidden="true" />
        <div
          className="chart-scroll"
          ref={viewportRef}
          onScroll={synchronizeYear}
        >
          <div
            className="chart-viewport-canvas"
            style={{ width: width || '100%' }}
          >
            {children}
          </div>
        </div>
        <div
          className="chart-fixed-axis"
          ref={setAxisTarget}
          aria-hidden="true"
        />
        {layout?.crowded && (
          <button
            className="chart-display-toggle"
            type="button"
            aria-label="完整标签（横向滚动）"
            aria-pressed={expanded}
            onClick={() => {
              synchronizeYear()
              setExpanded(!expanded)
            }}
          >
            {expanded ? (
              <ChevronsRightLeft strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ChevronsLeftRight strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
        <span className="chart-viewport-status" role="status">
          {scrolling ? '已展开全部标签，可横向滚动查看各年' : '一屏总览'}
        </span>
      </div>
    </PlotViewportContext.Provider>
  )
}

/** Render from chart data rather than cloning an SVG or duplicating interactive targets. */
export function PinnedChartAxis({
  left,
  height,
  unit,
  ticks,
}: {
  left: number
  height: number
  unit: string
  ticks: { label: string; y: number }[]
}) {
  const { axisTarget, scrolling } = usePlotViewport()
  if (!axisTarget || !scrolling) return null
  return createPortal(
    <svg width={left} height={height}>
      <text className="chart-axis-label" x={0} y={13}>
        {unit}
      </text>
      {ticks.map((tick) => (
        <g className="chart-axis" key={tick.label}>
          <text x={left - 8} y={tick.y + 4} textAnchor="end">
            {tick.label}
          </text>
        </g>
      ))}
    </svg>,
    axisTarget,
  )
}
