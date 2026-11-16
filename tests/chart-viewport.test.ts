import { describe, expect, it } from 'vitest'
import {
  layoutAmountLabels,
  layoutEventLabels,
} from '../src/features/dividends/amountLabels'
import {
  chartViewportLayout,
  scrollToYear,
  yearAtViewportStart,
  type ChartMeasurements,
} from '../src/features/dividends/chartViewport'

describe('chart viewport sizing', () => {
  const measurements: ChartMeasurements = {
    left: 52,
    widths: [42, 42, 42, 42, 42],
    gap: 12,
    yearSpacing: 48,
  }

  it('only offers expansion when the compact chart omits a label', () => {
    expect(chartViewportLayout(260, measurements).crowded).toBe(true)
    expect(chartViewportLayout(260, measurements).expandedWidth).toBe(344)
    expect(chartViewportLayout(800, measurements).crowded).toBe(false)
    expect(chartViewportLayout(0, measurements).crowded).toBe(false)
    expect(
      chartViewportLayout(260, { left: 40, widths: [], gap: 12 }).crowded,
    ).toBe(false)
  })

  it('checks the compact layout after resizing, even if detail mode would still be wider', () => {
    const intermediate = chartViewportLayout(340, measurements)
    expect(intermediate.expandedWidth).toBeGreaterThan(340)
    expect(intermediate.crowded).toBe(false)
    expect(chartViewportLayout(260, measurements).crowded).toBe(true)
  })

  it('accounts for years and event captions independently of numeric labels', () => {
    const short = { left: 40, widths: [12, 12, 12, 12, 12], gap: 12 }
    expect(chartViewportLayout(230, short).crowded).toBe(false)
    expect(
      chartViewportLayout(230, { ...short, yearSpacing: 48 }).crowded,
    ).toBe(true)
    expect(
      chartViewportLayout(400, {
        ...short,
        events: [null, 280, null, null, 280],
      }).crowded,
    ).toBe(true)
    expect(
      chartViewportLayout(400, { ...short, events: [null, 30, null, null, 30] })
        .crowded,
    ).toBe(false)
  })

  it('gives all amounts, metrics and event captions enough room when expanded', () => {
    for (const count of [1, 5, 10, 20, 40]) {
      for (const gap of [4, 8, 12]) {
        const widths = Array.from({ length: count }, (_, i) =>
          i % 3 === 0 ? 132 : 46,
        )
        const events = widths.map((_, i) => (i % 4 === 0 ? 160 : null))
        const { expandedWidth } = chartViewportLayout(260, {
          left: 52,
          widths,
          events,
          gap,
          yearSpacing: 48,
        })
        expect(
          layoutAmountLabels(widths, 52, expandedWidth - 12, gap).every(
            (label) => label.visible,
          ),
        ).toBe(true)
        expect(
          layoutEventLabels(events, 52, expandedWidth - 12).every(
            (label, i) => events[i] === null || label.visible,
          ),
        ).toBe(true)
      }
    }
  })
})

describe('shared fiscal-year position', () => {
  const dividend = { firstYear: 2006, step: 72, maximum: 1200 }
  const allocation = { firstYear: 2006, step: 84, maximum: 1420 }

  it('aligns the same year in both directions despite different column widths', () => {
    let currentYear = yearAtViewportStart(882, dividend)
    expect(currentYear).toBe(2018.25)
    expect(scrollToYear(currentYear, allocation)).toBe(1029)
    currentYear = yearAtViewportStart(1197, allocation)
    expect(currentYear).toBe(2020.25)
    expect(scrollToYear(currentYear, dividend)).toBe(1026)
  })

  it('aligns all-history views with different starting years and clamps at available boundaries', () => {
    expect(
      scrollToYear(2018.25, { firstYear: 2010, step: 72, maximum: 900 }),
    ).toBe(594)
    expect(scrollToYear(2000, allocation)).toBe(0)
    expect(scrollToYear(2040, allocation)).toBe(allocation.maximum)
    expect(scrollToYear(null, allocation)).toBe(allocation.maximum)
  })
})
