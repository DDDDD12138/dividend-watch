import {
  useCallback,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ChartTooltip } from './ChartTooltip'
import { useChartSelection, useChartSize } from './chartHooks'
import { layoutAmountLabels } from './amountLabels'
import {
  allocationAmount,
  allocationChartAmount,
  allocationAxis,
  type AllocationPoint,
} from './allocationModel'

export type AllocationLayer = 'profit' | 'cash'
interface Props {
  points: AllocationPoint[]
  emphasis: AllocationLayer | null
  onSelect: (point: AllocationPoint) => void
  emptyContent: ReactNode
}
export function AllocationChart(props: Props) {
  const { size, measure } = useChartSize()
  return (
    <AllocationPlot
      key={props.points.map((point) => point.year).join(',')}
      {...props}
      width={size.width}
      canvasHeight={size.height}
      measure={measure}
    />
  )
}
function AllocationPlot({
  points,
  emphasis,
  onSelect,
  emptyContent,
  width,
  canvasHeight,
  measure,
}: Props & {
  width: number
  canvasHeight: number
  measure: ReturnType<typeof useChartSize>['measure']
}) {
  const { root, active, select, hide } = useChartSelection(
    width,
    canvasHeight,
    points,
    ['profit', 'cash'],
  )
  const clipPrefix = useId()
  const axis = useMemo(() => allocationAxis(points), [points])
  const texts = useMemo(
    () =>
      points.map((point) => ({
        profit: allocationChartAmount(point.record?.netProfit),
        cash: allocationChartAmount(point.record?.cashDividend),
        ratio: point.ratio === null ? '—' : `${point.ratio}%`,
      })),
    [points],
  )
  const [labels, setLabels] = useState<{
    left: number
    widths: number[]
    cashWidths: number[]
  }>({ left: 42, widths: [], cashWidths: [] })
  const measureLabels = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return
      let disposed = false
      function update() {
        if (disposed || width <= 0) return
        const axisNodes = svg!.querySelectorAll<SVGTextElement>(
          '.allocation-axis-measure',
        )
        const left = Math.max(
          42,
          ...axis.ticks.map(
            (_, index) => Math.ceil(axisNodes[index].getBBox().width) + 16,
          ),
        )
        const profitNodes = svg!.querySelectorAll<SVGTextElement>(
          '.allocation-profit-measure',
        )
        const ratioNodes = svg!.querySelectorAll<SVGTextElement>(
          '.allocation-ratio-measure',
        )
        const cashNodes = svg!.querySelectorAll<SVGTextElement>(
          '.allocation-cash-measure',
        )
        const widths = texts.map((_, index) =>
          Math.max(
            profitNodes[index].getBBox().width,
            ratioNodes[index].getBBox().width,
            30,
          ),
        )
        const cashWidths = texts.map(
          (_, index) => cashNodes[index].getBBox().width,
        )
        setLabels((previous) =>
          previous.left === left &&
          previous.widths.length === widths.length &&
          widths.every(
            (value, index) =>
              value === previous.widths[index] &&
              cashWidths[index] === previous.cashWidths[index],
          )
            ? previous
            : { left, widths, cashWidths },
        )
      }
      update()
      void document.fonts.ready.then(update)
      document.fonts.addEventListener('loadingdone', update)
      return () => {
        disposed = true
        document.fonts.removeEventListener('loadingdone', update)
      }
    },
    [texts, axis, width],
  )
  const { left } = labels,
    right = width - 12,
    top = 30,
    bottom = canvasHeight - 42
  const step = Math.max(1, right - left) / Math.max(1, points.length)
  const barWidth = Math.min(84, step * 0.68)
  const x = (index: number) => left + step * (index + 0.5)
  const y = (value: number) =>
    bottom -
    ((value - axis.minimum) / (axis.maximum - axis.minimum)) * (bottom - top)
  const baseline = y(0)
  const layout = layoutAmountLabels(
    labels.widths,
    left,
    right,
    points.length <= 5 ? 4 : 8,
  )
  function text(point: AllocationPoint, index: number) {
    return `${point.year} 财年\n归母净利润：${allocationAmount(point.record?.netProfit)}${point.record?.netProfit == null ? '' : ' 亿元'}\n利润同比：${point.growth ?? '—'}\n已实施现金分红总额：${allocationAmount(point.record?.cashDividend)}${point.record?.cashDividend == null ? '' : ' 亿元'}\n现金分红比例：${texts[index].ratio}`
  }
  function target(
    point: AllocationPoint,
    index: number,
    layer: AllocationLayer,
  ) {
    return {
      role: point.record ? 'button' : undefined,
      tabIndex: point.record ? 0 : undefined,
      'aria-label': text(point, index).replaceAll('\n', '，'),
      'data-chart-target': layer,
      'data-tooltip': text(point, index),
      onClick: point.record ? () => onSelect(point) : undefined,
      onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
        if (point.record && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          hide()
          onSelect(point)
        }
      },
    }
  }
  return (
    <div
      className="chart-interaction allocation-interaction"
      ref={root}
      data-mode={active?.mode ?? emphasis ?? undefined}
      onPointerOver={(event) => {
        if (event.pointerType !== 'touch') select(event.target)
      }}
      onPointerOut={(event) => select(event.relatedTarget)}
      onPointerLeave={hide}
      onFocus={(event) => select(event.target)}
      onBlur={hide}
      onClick={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide()
      }}
    >
      <div className="annual-chart" ref={measure}>
        {points.length === 0 ? (
          <div className="chart-empty">{emptyContent}</div>
        ) : (
          width > 0 &&
          canvasHeight > 0 && (
            <svg
              ref={measureLabels}
              viewBox={`0 0 ${width} ${canvasHeight}`}
              role="group"
              aria-label="归母净利润与已实施现金分红总额，共用亿元刻度"
            >
              <g visibility="hidden" aria-hidden="true" pointerEvents="none">
                {axis.ticks.map((tick) => (
                  <text
                    className="chart-axis-label allocation-axis-measure"
                    key={tick.label}
                  >
                    {tick.label}
                  </text>
                ))}
                {texts.map((row, index) => (
                  <g key={index}>
                    <text className="chart-amount allocation-profit-measure">
                      {row.profit}
                    </text>
                    <text className="allocation-ratio-value allocation-ratio-measure">
                      {row.ratio}
                    </text>
                    <text className="allocation-cash-label allocation-cash-measure">
                      {row.cash}
                    </text>
                  </g>
                ))}
              </g>
              <text className="chart-axis-label" x={left} y={13}>
                亿元
              </text>
              {axis.ticks.map((tick) => (
                <g className="chart-axis" key={tick.label}>
                  <line
                    className={
                      tick.value === 0 ? 'allocation-baseline' : undefined
                    }
                    x1={left}
                    x2={right}
                    y1={y(tick.value)}
                    y2={y(tick.value)}
                  />
                  <text x={left - 8} y={y(tick.value) + 4} textAnchor="end">
                    {tick.label}
                  </text>
                </g>
              ))}
              {points.map((point, index) => {
                const profit =
                  point.record?.netProfit == null
                    ? null
                    : Number(point.record.netProfit) / 100_000_000
                const cash =
                  point.record?.cashDividend == null
                    ? null
                    : Number(point.record.cashDividend) / 100_000_000
                const separate =
                  profit !== null &&
                  cash !== null &&
                  (profit <= 0 || cash > profit)
                const w = separate ? barWidth * 0.42 : barWidth
                const px = x(index) - (separate ? barWidth * 0.28 : 0),
                  cx = x(index) + (separate ? barWidth * 0.28 : 0)
                const columnTop = y(Math.max(0, profit ?? 0, cash ?? 0)),
                  columnBottom = y(Math.min(0, profit ?? 0))
                const clipId = `${clipPrefix}-${point.year}`
                return (
                  <g key={point.year}>
                    <defs>
                      <clipPath id={clipId}>
                        <rect
                          x={x(index) - barWidth / 2}
                          y={columnTop}
                          width={barWidth}
                          height={Math.max(2, columnBottom - columnTop)}
                          rx={3}
                        />
                      </clipPath>
                    </defs>
                    {profit !== null && (
                      <g
                        className="allocation-target"
                        {...target(point, index, 'profit')}
                      >
                        <rect
                          className="allocation-profit-bar"
                          x={px - w / 2}
                          y={Math.min(baseline, y(profit))}
                          width={w}
                          height={Math.abs(baseline - y(profit))}
                          clipPath={separate ? undefined : `url(#${clipId})`}
                        />
                        <rect
                          className="chart-hit"
                          x={px - w / 2}
                          y={Math.min(baseline - 3, y(profit))}
                          width={w}
                          height={Math.max(6, Math.abs(baseline - y(profit)))}
                        />
                      </g>
                    )}
                    {cash !== null && (
                      <g
                        className="allocation-target"
                        {...target(point, index, 'cash')}
                      >
                        <rect
                          className="allocation-cash-bar"
                          x={cx - w / 2}
                          y={y(cash)}
                          width={w}
                          height={baseline - y(cash)}
                          clipPath={separate ? undefined : `url(#${clipId})`}
                        />
                        <rect
                          className="chart-hit"
                          x={cx - w / 2}
                          y={y(cash) - 3}
                          width={w}
                          height={Math.max(6, baseline - y(cash) + 3)}
                        />
                        {layout[index]?.visible &&
                          baseline - y(cash) > 24 &&
                          labels.cashWidths[index] <= w - 6 && (
                            <text
                              className="allocation-cash-label"
                              x={cx}
                              y={(y(cash) + baseline) / 2 + 4}
                              textAnchor="middle"
                              pointerEvents="none"
                            >
                              {texts[index].cash}
                            </text>
                          )}
                      </g>
                    )}
                    {cash === null &&
                      profit !== null &&
                      layout[index]?.visible && (
                        <text
                          className="chart-axis-label"
                          x={x(index)}
                          y={baseline - 10}
                          textAnchor="middle"
                        >
                          —
                        </text>
                      )}
                  </g>
                )
              })}
              {/* Values paint after all columns so dense neighboring bars cannot cover text or its hit box. */}
              {points.map((point, index) => {
                if (!layout[index]?.visible) return null
                const profit =
                  point.record?.netProfit == null
                    ? null
                    : Number(point.record.netProfit) / 100_000_000
                const separate =
                  point.record?.cashDividend != null &&
                  point.record.netProfit !== null &&
                  profit !== null &&
                  (profit <= 0 ||
                    Number(point.record.cashDividend) / 100_000_000 > profit)
                const labelValue =
                  profit ??
                  Math.max(
                    0,
                    Number(point.record?.cashDividend ?? 0) / 100_000_000,
                  )
                const labelY =
                  labelValue < 0
                    ? Math.min(bottom - 4, y(labelValue) + 18)
                    : y(labelValue) - 10
                const labelX = separate
                  ? x(index) - barWidth * 0.28
                  : layout[index].x
                return (
                  <g
                    className="allocation-target"
                    key={point.year}
                    {...target(point, index, 'profit')}
                  >
                    <rect
                      className="chart-hit"
                      x={labelX - labels.widths[index] / 2}
                      y={labelY - 16}
                      width={labels.widths[index]}
                      height={21}
                    />
                    <text
                      className="chart-amount allocation-profit-label"
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {texts[index].profit}
                    </text>
                    <rect
                      className="chart-hit"
                      x={x(index) - step / 2 + 2}
                      y={bottom + 4}
                      width={step - 4}
                      height={30}
                    />
                    <text
                      className="chart-year-label"
                      x={x(index)}
                      y={bottom + 26}
                      textAnchor="middle"
                    >
                      {point.year}
                    </text>
                  </g>
                )
              })}
            </svg>
          )
        )}
      </div>
      <div className="allocation-ratios" aria-hidden={points.length === 0}>
        <h3 className="allocation-ratio-heading">现金分红比例</h3>
        <svg
          viewBox={width > 0 ? `0 0 ${width} 64` : undefined}
          height={64}
          role="group"
          aria-label="各年度现金分红比例"
        >
          {width > 0 &&
            points.map(
              (point, index) =>
                layout[index]?.visible && (
                  <g
                    className="allocation-target"
                    key={point.year}
                    {...target(point, index, 'profit')}
                  >
                    <rect
                      className="chart-hit"
                      x={layout[index].x - labels.widths[index] / 2}
                      y={6}
                      width={labels.widths[index]}
                      height={52}
                    />
                    <text
                      className="allocation-ratio-value"
                      x={layout[index].x}
                      y={26}
                      textAnchor="middle"
                    >
                      {texts[index].ratio}
                    </text>
                    <text
                      className="allocation-ratio-year"
                      x={layout[index].x}
                      y={50}
                      textAnchor="middle"
                    >
                      {point.year}
                    </text>
                  </g>
                ),
            )}
        </svg>
      </div>
      {active && <ChartTooltip selection={active} onDismiss={hide} />}
    </div>
  )
}
