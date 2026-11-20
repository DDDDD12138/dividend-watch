import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
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
import {
  CHART_BOTTOM_PADDING,
  CHART_YEAR_LABEL_OFFSET,
  useChartHeight,
  observeChartTypography,
} from './chartHooks'
import { useChartInteraction } from './useChartInteraction'
import { layoutAmountLabels, layoutEventLabels } from './amountLabels'
import { dividendAxis } from './axis'
import { PreListingBand } from './PreListingBand'
import { isPreListing } from './listing'
import { ChartMetricRegion, type ChartMetricInfo } from './ChartMetricRegion'
import { type AnnualYieldValue } from './referenceYield'
import { annualShareDistribution } from './shareDistribution'
import { ChartViewport, PinnedChartAxis } from './ChartViewport'
import { usePlotViewport } from './chartViewportContext'

interface ChartProps {
  yieldValues: ReadonlyMap<number, AnnualYieldValue>
  yieldBasis: 'current' | 'yearEnd'
  metric: ChartMetricInfo
  emptyContent: ReactNode
  listingDate?: string | null
  emphasis: ChartLayer | null
  groups: YearGroup[]
  summaries: AnnualDividend[]
  onYear: (year: number) => void
  onRecord: (record: EastmoneyDividend) => void
}
export function AnnualChart(props: ChartProps) {
  const years = props.groups.map((group) => group.year)
  return (
    <ChartViewport key={years.join(',')} kind="dividend" years={years}>
      <AnnualPlot {...props} />
    </ChartViewport>
  )
}
function AnnualPlot(props: ChartProps) {
  const { height, measure } = useChartHeight()
  const { width } = usePlotViewport()
  const scope = props.groups.map((group) => group.year).join(',')
  return (
    <ChartPlot
      key={scope}
      {...props}
      width={width}
      canvasHeight={height}
      measure={measure}
    />
  )
}
function ChartPlot({
  yieldValues,
  yieldBasis,
  metric,
  emptyContent,
  measure,
  listingDate,
  emphasis,
  groups,
  summaries,
  onYear,
  onRecord,
  width,
  canvasHeight,
}: ChartProps & {
  width: number
  canvasHeight: number
  measure: ReturnType<typeof useChartHeight>['measure']
}) {
  const { report, scrolling } = usePlotViewport()
  const { root, active, dismiss, interactionProps, getTargetProps } =
    useChartInteraction(width, canvasHeight, groups, ['year', 'record'])
  const transferPatternId = useId()
  const transfers = useMemo(() => groups.map(annualShareDistribution), [groups])
  const hasTransfers = transfers.some(Boolean)
  const [measuredLabels, setMeasuredLabels] = useState<{
    left: number
    amounts: {
      width: number
      metricWidth: number
      top: number
      height: number
    }[]
    transfers: { width: number; top: number; height: number }[]
  }>({ left: 40, amounts: [], transfers: [] })
  const { left } = measuredLabels
  const bottom = canvasHeight - CHART_BOTTOM_PADDING,
    plotTop = 24,
    plotHeight = bottom - plotTop
  const step = Math.max(1, width - left - 12) / Math.max(groups.length, 1)
  const barWidth = Math.min(84, step * 0.68)
  const maximum = Math.max(
    0,
    ...groups.map(
      (group, index) =>
        Number(group.summary?.implementedTotal ?? 0) *
        (1 + (transfers[index]?.increase ?? 0)),
    ),
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
  const yields = useMemo(
    () =>
      groups.map(
        (group) =>
          yieldValues.get(group.year) ?? {
            label: '—',
            reason: '年度分红金额暂不可用',
            price: null,
          },
      ),
    [groups, yieldValues],
  )
  // Text dimensions change with fonts/data. Positions change with the controlled width
  // and must be derived in the same render as the bars and SVG viewBox.
  const amountLabels = layoutAmountLabels(
    measuredLabels.amounts.map((box) => Math.max(box.width, box.metricWidth)),
    left,
    width - 12,
  ).map((label, index) => ({ ...label, ...measuredLabels.amounts[index] }))
  const transferLabels = layoutEventLabels(
    measuredLabels.transfers.map((box, index) =>
      transfers[index] ? box.width : null,
    ),
    left,
    width - 12,
  ).map((label, index) => ({ ...label, ...measuredLabels.transfers[index] }))
  const measureLabels = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return
      function measure() {
        const axisNodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-axis-measure',
        )
        const nextLeft = Math.max(
          40,
          ...axis.ticks.map(
            (_, index) => Math.ceil(axisNodes[index].getBBox().width) + 16,
          ),
        )
        const nodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-amount-measure',
        )
        const boxes = amountTexts.map((_, index) => nodes[index].getBBox())
        const metricNodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-yield-measure',
        )
        const metricWidths = yields.map((_, index) =>
          Math.max(32, metricNodes[index].getBBox().width + 4),
        )
        const amounts = boxes.map((box, index) => ({
          width: box.width + 4,
          metricWidth: metricWidths[index],
          top: box.y - 2,
          height: box.height + 4,
        }))
        const transferNodes = svg!.querySelectorAll<SVGTextElement>(
          '.chart-transfer-measure',
        )
        const transferBoxes = transfers.map((_, index) =>
          transferNodes[index].getBBox(),
        )
        report({
          left: nextLeft,
          widths: boxes.map((box, index) =>
            Math.max(box.width + 4, metricWidths[index]),
          ),
          gap: 12,
          yearSpacing: 48,
          events: transferBoxes.map((box, index) =>
            transfers[index] ? box.width + 4 : null,
          ),
        })
        const captions = transferBoxes.map((box) => ({
          width: box.width + 4,
          top: box.y - 2,
          height: box.height + 4,
        }))
        setMeasuredLabels((previous) =>
          previous.left === nextLeft &&
          previous.amounts.length === amounts.length &&
          previous.transfers.length === captions.length &&
          previous.amounts.every((box, index) => {
            const other = amounts[index]
            return (
              box.width === other.width &&
              box.metricWidth === other.metricWidth &&
              box.top === other.top &&
              box.height === other.height
            )
          }) &&
          previous.transfers.every((box, index) => {
            const other = captions[index]
            return (
              box.width === other.width &&
              box.top === other.top &&
              box.height === other.height
            )
          })
            ? previous
            : { left: nextLeft, amounts, transfers: captions },
        )
      }
      return observeChartTypography(measure)
    },
    [amountTexts, yields, transfers, axis, report],
  )
  function yearText(group: YearGroup, index: number) {
    const amount = group.summary?.implementedTotal
    const change = yearChange(group, summaries)
    const value = yields[index]
    return `${group.year} 财年\n已实施合计：${cash(amount)} / 股${amount != null ? `\n实施记录：${group.summary!.implementedRecordCount} 条` : ''}${change ? `\n同比：${change}` : ''}\n折算股价：${value.price ? `¥${Number(value.price).toFixed(2)}` : '—'}${value.tradeDate ? `\n交易日期：${value.tradeDate}` : ''}\n参考股息率：${value.label}${value.reason ? `\n${value.reason}` : ''}\n未作送转调整`
  }
  return (
    <div
      className="chart-interaction"
      ref={root}
      data-mode={active?.mode ?? emphasis ?? undefined}
      {...interactionProps}
    >
      <div className="annual-chart" ref={measure}>
        {!groups.length ? (
          <div className="chart-empty">{emptyContent}</div>
        ) : (
          width > 0 &&
          canvasHeight > 0 && (
            <svg
              ref={measureLabels}
              viewBox={`0 0 ${width} ${canvasHeight}`}
              style={{ width, height: canvasHeight }}
              role="group"
              aria-label={
                hasTransfers
                  ? '年度已实施现金分红与单次记录，单位为元每股，税前；金色送转阴影仅示意股份增加比例，不代表现金金额'
                  : '年度已实施合计与各次现金分红，共用金额刻度，单位为元每股，税前'
              }
            >
              <defs>
                <pattern
                  id={transferPatternId}
                  width={10}
                  height={10}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    className="chart-transfer-background"
                    width={10}
                    height={10}
                    fillOpacity={0.05}
                  />
                  <path
                    className="chart-transfer-hatch"
                    d="M-2 2 2 -2 M0 10 10 0 M8 12 12 8"
                    strokeOpacity={0.6}
                  />
                </pattern>
              </defs>
              <g visibility="hidden" aria-hidden="true" pointerEvents="none">
                {axis.ticks.map((tick) => (
                  <text key={tick.label} className="chart-axis-measure">
                    {tick.label}
                  </text>
                ))}
                {transfers.map((transfer, index) => (
                  <text
                    key={`transfer-${index}`}
                    className="chart-transfer-measure"
                    x={0}
                    y={0}
                    textAnchor="middle"
                  >
                    {transfer?.label ?? ''}
                  </text>
                ))}
                {yields.map((value, index) => (
                  <text
                    key={`yield-${index}`}
                    className="allocation-ratio-value chart-yield-measure"
                  >
                    {value.label}
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
              <text
                className="chart-axis-label"
                x={left}
                y={13}
                visibility={scrolling ? 'hidden' : undefined}
              >
                {hasTransfers ? '现金：元 / 股' : '元 / 股'}
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
              <PreListingBand
                x={left}
                y={plotTop}
                listingDate={listingDate}
                years={groups.map((group) => group.year)}
                step={step}
                height={plotHeight}
              />
              {groups.map((group, index) => {
                const x = left + step * (index + 0.5),
                  amount = group.summary?.implementedTotal
                const showData = !(
                  isPreListing(group.year, listingDate) &&
                  amount == null &&
                  !group.records.length
                )
                const label = amountLabels[index]
                const labelY =
                  (amount == null ? bottom : bottom - height(amount)) - 10
                const children = chartRecords(group)
                const text = yearText(group, index)
                const transfer = transfers[index]
                const transferLabel = transferLabels[index]
                const barTop = amount == null ? bottom : bottom - height(amount)
                const shadowHeight =
                  amount == null
                    ? 0
                    : height(amount) * (transfer?.increase ?? 0)
                const shadowTop = barTop - shadowHeight
                // Keep captions separate even for tiny ratios or cash-free schemes.
                const captionY = Math.max(
                  14,
                  Math.min(shadowTop - 8, labelY + (label?.top ?? -16) - 8),
                )
                return (
                  <g key={group.year}>
                    {transfer && (
                      <g
                        className="chart-transfer-target"
                        data-transfer-year={group.year}
                        {...getTargetProps({
                          mode: 'year',
                          text: transfer.text,
                          onActivate:
                            transfer.records.length === 1
                              ? () => onRecord(transfer.records[0])
                              : () => onYear(group.year),
                        })}
                      >
                        <g className="chart-year-visual chart-transfer-visual">
                          {shadowHeight > 0 && (
                            <rect
                              className="chart-transfer"
                              fill={`url(#${transferPatternId})`}
                              x={x - barWidth / 2}
                              y={shadowTop}
                              width={barWidth}
                              height={shadowHeight}
                            />
                          )}
                          {transferLabel?.visible && (
                            <text
                              className="chart-transfer-label"
                              x={transferLabel.x}
                              y={captionY}
                              textAnchor="middle"
                            >
                              {transfer.label}
                            </text>
                          )}
                        </g>
                        {shadowHeight > 0 && (
                          <rect
                            className="chart-hit"
                            x={x - barWidth / 2}
                            y={shadowTop}
                            width={barWidth}
                            height={shadowHeight}
                          />
                        )}
                        {transferLabel?.visible && (
                          <rect
                            className="chart-hit"
                            x={transferLabel.x - transferLabel.width / 2}
                            y={captionY + transferLabel.top}
                            width={transferLabel.width}
                            height={transferLabel.height}
                          />
                        )}
                      </g>
                    )}
                    <g
                      className={showData ? 'chart-year-target' : undefined}
                      {...(showData
                        ? getTargetProps({
                            mode: 'year',
                            text,
                            onActivate: group.records.length
                              ? () => onYear(group.year)
                              : undefined,
                          })
                        : {})}
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
                      {showData && label?.visible && (
                        <rect
                          className="chart-hit"
                          x={label.x - label.width / 2}
                          y={labelY + label.top}
                          width={label.width}
                          height={label.height}
                        />
                      )}
                      {showData && visible(index, yearStride) && (
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
                        {showData && label?.visible && (
                          <text
                            className={`chart-amount${transfer ? ' chart-amount-on-transfer' : ''}`}
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
                          y={bottom + CHART_YEAR_LABEL_OFFSET}
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
                        children.length * childWidth +
                        (children.length - 1) * gap
                      const childX =
                        x - clusterWidth / 2 + childIndex * (childWidth + gap)
                      const childHeight = height(record.cashPerShare!)
                      const tip = `${group.year} 财年 · 报告期 ${record.reportDate ?? '未知'}\n税前每股：${cash(record.cashPerShare)}\n除权除息日：${record.exDate ?? '未提供'}\n来源进度：${record.progress}`
                      return (
                        <g
                          key={record.recordId}
                          className="chart-record-target"
                          {...getTargetProps({
                            mode: 'record',
                            text: tip,
                            onActivate: () => onRecord(record),
                          })}
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
          )
        )}
      </div>
      <ChartMetricRegion {...metric}>
        <svg
          viewBox={width > 0 ? `0 0 ${width} 64` : undefined}
          style={{ width }}
          height={64}
          role="group"
          aria-label={`各财年按${yieldBasis === 'current' ? '当前价' : '年末价'}折算的参考股息率`}
        >
          {width > 0 &&
            groups.map((group, index) => {
              const label = amountLabels[index]
              if (!label?.visible) return null
              const showData = !(
                isPreListing(group.year, listingDate) &&
                group.summary?.implementedTotal == null &&
                !group.records.length
              )
              return (
                <g
                  key={group.year}
                  className={showData ? 'chart-year-target' : undefined}
                  {...(showData
                    ? getTargetProps({
                        mode: 'year',
                        text: yearText(group, index),
                        onActivate: group.records.length
                          ? () => onYear(group.year)
                          : undefined,
                      })
                    : {})}
                >
                  {showData && (
                    <>
                      <rect
                        className="chart-hit"
                        x={label.x - label.metricWidth / 2}
                        y={6}
                        width={label.metricWidth}
                        height={52}
                      />
                      <text
                        className="allocation-ratio-value"
                        x={label.x}
                        y={26}
                        textAnchor="middle"
                      >
                        {yields[index].label}
                      </text>
                    </>
                  )}
                  <text
                    className="allocation-ratio-year"
                    x={label.x}
                    y={50}
                    textAnchor="middle"
                  >
                    {group.year}
                  </text>
                </g>
              )
            })}
        </svg>
      </ChartMetricRegion>
      <PinnedChartAxis
        left={left}
        height={canvasHeight}
        unit={hasTransfers ? '现金：元 / 股' : '元 / 股'}
        ticks={axis.ticks.map((tick) => ({
          label: tick.label,
          y: bottom - (plotHeight * tick.value) / ceiling,
        }))}
      />
      {active && <ChartTooltip selection={active} onDismiss={dismiss} />}
    </div>
  )
}
