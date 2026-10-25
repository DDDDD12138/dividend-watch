import { useCallback, useMemo, useState } from 'react'
import type { AnnualDividend, EastmoneyDividend } from '../../../shared/api'
import {
  cash,
  chartRecords,
  dividendAmount,
  yearChange,
  type YearGroup,
  type ChartLayer,
} from './model'
import { ChartTooltip } from './ChartTooltip'
import { useChartSize, useChartSelection } from './chartHooks'
import { layoutAmountLabels } from './amountLabels'
import { dividendAxis } from './axis'

interface ChartProps {
  emphasis: ChartLayer | null
  groups: YearGroup[]
  summaries: AnnualDividend[]
  onYear: (year: number) => void
  onRecord: (record: EastmoneyDividend) => void
}
export function AnnualChart(props: ChartProps) {
  const { size, measure } = useChartSize()
  const scope = props.groups.map((group) => group.year).join(',')
  return (
    <div className="annual-chart" ref={measure}>
      {size.width > 0 && size.height > 0 && (
        <ChartPlot
          key={scope}
          {...props}
          width={size.width}
          canvasHeight={size.height}
        />
      )}
    </div>
  )
}
function ChartPlot({
  emphasis,
  groups,
  summaries,
  onYear,
  onRecord,
  width,
  canvasHeight,
}: ChartProps & { width: number; canvasHeight: number }) {
  const { root, active, select, hide } = useChartSelection(
    width,
    canvasHeight,
    groups,
    ['year', 'record'],
  )
  const [left, setLeft] = useState(0)
  const bottom = canvasHeight - 52,
    plotTop = 24,
    plotHeight = bottom - plotTop
  const step = Math.max(1, width - left - 12) / Math.max(groups.length, 1)
  const barWidth = Math.min(84, step * 0.68)
  const maximum = Math.max(
    0,
    ...groups.map((group) => Number(group.summary?.implementedTotal ?? 0)),
  )
  const axis = useMemo(() => dividendAxis(maximum), [maximum])
  const ceiling = axis.ceiling
  const height = (amount: string) => (Number(amount) / ceiling) * plotHeight
  const yearStride = Math.max(1, Math.ceil(48 / step))
  const visible = (index: number, stride: number) =>
    index === groups.length - 1 ||
    (index % stride === 0 && groups.length - 1 - index >= stride)
  const amountTexts = useMemo(
    () =>
      groups.map((group) => dividendAmount(group.summary?.implementedTotal)),
    [groups],
  )
  const [amountLabels, setAmountLabels] = useState<
    {
      x: number
      visible: boolean
      width: number
      top: number
      height: number
    }[]
  >([])
  const measureLabels = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return
      let disposed = false
      function measure() {
        if (disposed) return
        const axisNodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-axis-measure',
        )
        const nextLeft = Math.max(
          40,
          ...axis.ticks.map(
            (_, index) => Math.ceil(axisNodes[index].getBBox().width) + 16,
          ),
        )
        setLeft(nextLeft)
        const nodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-amount-measure',
        )
        const boxes = amountTexts.map((_, index) => nodes[index].getBBox())
        const layout = layoutAmountLabels(
          boxes.map((box) => box.width + 4),
          nextLeft,
          width - 12,
        )
        const next = layout.map((label, index) => ({
          ...label,
          width: boxes[index].width + 4,
          top: boxes[index].y - 2,
          height: boxes[index].height + 4,
        }))
        setAmountLabels((previous) =>
          previous.length === next.length &&
          previous.every((label, index) => {
            const other = next[index]
            return (
              label.x === other.x &&
              label.visible === other.visible &&
              label.width === other.width &&
              label.top === other.top &&
              label.height === other.height
            )
          })
            ? previous
            : next,
        )
      }
      measure()
      void document.fonts.ready.then(measure)
      document.fonts.addEventListener('loadingdone', measure)
      return () => {
        disposed = true
        document.fonts.removeEventListener('loadingdone', measure)
      }
    },
    [amountTexts, axis, width],
  )
  return (
    <div
      className="chart-interaction"
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
      <svg
        ref={measureLabels}
        viewBox={`0 0 ${width} ${canvasHeight}`}
        height={canvasHeight}
        role="group"
        aria-label="年度已实施合计与各次现金分红，共用金额刻度，单位为元每股，税前"
      >
        <g visibility="hidden" aria-hidden="true" pointerEvents="none">
          {axis.ticks.map((tick) => (
            <text key={tick.label} className="chart-axis-measure">
              {tick.label}
            </text>
          ))}
          {amountTexts.map((text, index) => (
            <text
              key={index}
              className="chart-amount-measure"
              x={0}
              y={0}
              textAnchor="middle"
            >
              {text}
            </text>
          ))}
        </g>
        <text className="chart-axis-label" x={left} y={13}>
          元 / 股
        </text>
        {axis.ticks.map((tick) => {
          const y = bottom - (plotHeight * tick.value) / ceiling
          return (
            <g key={tick.label} className="chart-axis">
              <line x1={left} x2={width - 12} y1={y} y2={y} />
              <text x={left - 8} y={y + 4} textAnchor="end">
                {tick.label}
              </text>
            </g>
          )
        })}
        {groups.map((group, index) => {
          const x = left + step * (index + 0.5),
            amount = group.summary?.implementedTotal
          const label = amountLabels[index]
          const labelY =
            (amount == null ? bottom : bottom - height(amount)) - 10
          const children = chartRecords(group)
          const change = yearChange(group, summaries)
          const text = `${group.year} 财年\n已实施合计：${cash(amount)} / 股${amount != null ? `\n实施记录：${group.summary!.implementedRecordCount} 条` : ''}${change ? `\n同比：${change}` : ''}`
          return (
            <g key={group.year}>
              <g
                className="chart-year-target"
                role={group.records.length ? 'button' : 'img'}
                tabIndex={group.records.length ? 0 : undefined}
                aria-label={text.replaceAll('\n', '，')}
                data-chart-target="year"
                data-tooltip={text}
                onClick={
                  group.records.length ? () => onYear(group.year) : undefined
                }
                onKeyDown={(event) => {
                  if (
                    group.records.length &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault()
                    hide()
                    onYear(group.year)
                  }
                }}
              >
                {amount != null && (
                  <rect
                    className="chart-hit"
                    x={x - barWidth / 2}
                    y={bottom - Math.max(height(amount), 2)}
                    width={barWidth}
                    height={Math.max(height(amount), 2)}
                  />
                )}
                {label?.visible && (
                  <rect
                    className="chart-hit"
                    x={label.x - label.width / 2}
                    y={labelY + label.top}
                    width={label.width}
                    height={label.height}
                  />
                )}
                {visible(index, yearStride) && (
                  <rect
                    className="chart-hit"
                    x={x - barWidth / 2}
                    y={bottom + 4}
                    width={barWidth}
                    height={32}
                  />
                )}
                <g className="chart-year-visual">
                  {amount != null && (
                    <rect
                      className="chart-total"
                      x={x - barWidth / 2}
                      y={bottom - height(amount)}
                      width={barWidth}
                      height={height(amount)}
                      rx={3}
                    />
                  )}
                  {label?.visible && (
                    <text
                      className="chart-amount"
                      x={label.x}
                      y={labelY}
                      textAnchor="middle"
                    >
                      {amountTexts[index]}
                    </text>
                  )}
                </g>
                {visible(index, yearStride) && (
                  <text
                    className="chart-year-label"
                    x={x}
                    y={bottom + 25}
                    textAnchor="middle"
                  >
                    {group.year}
                  </text>
                )}
              </g>
              {children.map((record, childIndex) => {
                const gap = Math.min(
                  4,
                  barWidth * 0.05,
                  barWidth / (children.length * 2),
                )
                const childWidth = Math.min(
                  24,
                  (barWidth * 0.9 - (children.length - 1) * gap) /
                    children.length,
                )
                const clusterWidth =
                  children.length * childWidth + (children.length - 1) * gap
                const childX =
                  x - clusterWidth / 2 + childIndex * (childWidth + gap)
                const childHeight = height(record.cashPerShare!)
                const tip = `${group.year} 财年 · 报告期 ${record.reportDate ?? '未知'}\n税前每股：${cash(record.cashPerShare)}\n除权除息日：${record.exDate ?? '未提供'}\n来源进度：${record.progress}`
                return (
                  <g
                    key={record.recordId}
                    className="chart-record-target"
                    role="button"
                    tabIndex={0}
                    aria-label={tip.replaceAll('\n', '，')}
                    data-chart-target="record"
                    data-tooltip={tip}
                    onClick={() => onRecord(record)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        hide()
                        onRecord(record)
                      }
                    }}
                  >
                    <rect
                      className="chart-record"
                      x={childX}
                      y={bottom - childHeight}
                      width={childWidth}
                      height={childHeight}
                      rx={2}
                    />
                    <rect
                      className="chart-hit"
                      x={childX}
                      y={bottom - Math.max(childHeight, 6)}
                      width={childWidth}
                      height={Math.max(childHeight, 6)}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {active && <ChartTooltip selection={active} onDismiss={hide} />}
    </div>
  )
}
