import { layoutAmountLabels, layoutEventLabels } from './amountLabels'

export interface ChartMeasurements {
  left: number
  widths: number[]
  gap: number
  yearSpacing?: number
  events?: (number | null)[]
}

/** Evaluate the compact layout using the same measured text as the chart. */
export function chartViewportLayout(
  viewport: number,
  measurements: ChartMeasurements,
) {
  const { left, widths, gap, yearSpacing = 0, events = [] } = measurements
  const crowded =
    viewport > 0 &&
    widths.length > 0 &&
    (layoutAmountLabels(widths, left, viewport - 12, gap).some(
      (label) => !label.visible,
    ) ||
      (widths.length > 1 &&
        (viewport - left - 12) / widths.length < yearSpacing) ||
      layoutEventLabels(events, left, viewport - 12).some(
        (label, index) => events[index] !== null && !label.visible,
      ))
  const step = Math.ceil(
    Math.max(
      yearSpacing,
      ...widths.map((width) => width + gap + 2),
      ...events.map((width) => (width === null ? 0 : width + 10)),
    ),
  )
  return {
    crowded,
    expandedWidth: Math.max(viewport, left + 12 + widths.length * step),
  }
}

export interface YearViewportGeometry {
  firstYear: number
  step: number
  maximum: number
}

/** A fractional fiscal year, independent of axis gutters and column widths. */
export function yearAtViewportStart(
  offset: number,
  geometry: YearViewportGeometry,
) {
  return geometry.firstYear + offset / geometry.step
}

export function scrollToYear(
  year: number | null,
  geometry: YearViewportGeometry,
) {
  if (year === null) return geometry.maximum
  return Math.max(
    0,
    Math.min(geometry.maximum, (year - geometry.firstYear) * geometry.step),
  )
}

export function sameChartMeasurements(
  a: ChartMeasurements | null,
  b: ChartMeasurements,
) {
  const same = (x: readonly (number | null)[], y: readonly (number | null)[]) =>
    x.length === y.length && x.every((value, index) => value === y[index])
  return (
    a !== null &&
    a.left === b.left &&
    a.gap === b.gap &&
    a.yearSpacing === b.yearSpacing &&
    same(a.widths, b.widths) &&
    same(a.events ?? [], b.events ?? [])
  )
}
