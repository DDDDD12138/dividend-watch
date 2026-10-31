import { expect, it, vi } from 'vitest'
import { recentYears } from '../src/features/watchlist/model'
import { allocationView } from '../src/features/dividends/allocationModel'
import {
  historyView,
  chartRecords,
  yearChange,
  sortRecords,
} from '../src/features/dividends/model'
import { fetchDividends } from '../worker/providers/eastmoney'
import { buildHistory } from '../worker/services/history'
import { bankCompanies, fixtureFetcher, now } from './helpers'
import type {
  AllocationHistory,
  AnnualDividend,
  DividendHistory,
  EastmoneyDividend,
} from '../shared/api'
async function history() {
  return buildHistory(
    bankCompanies[0],
    await fetchDividends(fixtureFetcher, bankCompanies[0], now),
    now,
  )
}
it.each(['2001-01-01T00:00:00Z', '2040-01-01T00:00:00Z'])(
  'uses server calendar years across both charts and the homepage despite device time %s',
  async (deviceTime) => {
    const input = await fetchDividends(fixtureFetcher, bankCompanies[0], now)
    const data = buildHistory(
      bankCompanies[0],
      input,
      new Date('2026-12-31T16:01:00Z'),
    )
    const annual = {
      lastEndedYear: 2026,
      years: [],
    } as unknown as AllocationHistory
    vi.useFakeTimers()
    vi.setSystemTime(deviceTime)
    try {
      expect(data.referenceDividend.fiscalYear).toBe(2026)
      expect(recentYears(data).map((point) => point.year)).toEqual([
        2022, 2023, 2024, 2025, 2026,
      ])
      const view = historyView(data, '5')
      expect(view.chart.map((group) => group.year)).toEqual([
        2022, 2023, 2024, 2025, 2026,
      ])
      expect(view.currentYear).toBe(2027)
      expect(view.recent.some((group) => group.year === 2026)).toBe(false)
      expect(allocationView(annual, '5').map((point) => point.year)).toEqual([
        2022, 2023, 2024, 2025, 2026,
      ])
    } finally {
      vi.useRealTimers()
    }
  },
)
it('keeps annual comparison available when a non-implemented record is excluded from the sum', async () => {
  const input = await fetchDividends(fixtureFetcher, bankCompanies[0], now)
  input.records.find((record) => record.reportDate === '2025-06-30')!.progress =
    '停止实施'
  const data = buildHistory(bankCompanies[0], input, now)
  expect(
    yearChange(historyView(data, '5').chart.at(-1)!, data.annualSummaries),
  ).toBe('−49.65%')
})
it('keeps missing trailing years in every historical window and never substitutes an older year for comparison', async () => {
  const data = await history()
  data.records = data.records.filter((record) => record.fiscalYear! <= 2022)
  data.annualSummaries = data.annualSummaries.filter(
    (year) => year.fiscalYear <= 2022,
  )
  for (const range of ['5', '10', 'all'] as const) {
    const view = historyView(data, range)
    expect(view.chart.at(-1)?.year).toBe(2025)
    expect(
      view.chart
        .slice(-3)
        .every((group) => !group.summary && !group.records.length),
    ).toBe(true)
    expect(view.historical.every((group) => group.year <= 2022)).toBe(true)
  }
  expect(historyView(data, '5').chart.map((group) => group.year)).toEqual([
    2021, 2022, 2023, 2024, 2025,
  ])
})
it('returns company identity even when there are no dividend records', async () => {
  const input = await fetchDividends(
    async () => Response.json({ success: false, code: 9201, result: null }),
    bankCompanies[0],
    now,
  )
  const result = buildHistory(bankCompanies[0], input, now)
  expect(result.company).toEqual(bankCompanies[0])
  expect(result.records).toEqual([])
})
it('keeps current-year and unassigned records outside historical ranges', async () => {
  const data = await history()
  data.records.push({
    ...data.records[0],
    fiscalYear: null,
    recordId: 'unknown',
  })
  const view = historyView(data, '5')
  expect(view.chart.map((group) => group.year)).toEqual([
    2021, 2022, 2023, 2024, 2025,
  ])
  expect(view.recent.map((group) => group.year)).toEqual([2026])
  expect(view.unassigned).toHaveLength(1)
  expect(view.historical[0].year).toBe(2025)
  expect(historyView(data, '10').chart).toHaveLength(10)
  expect(historyView(data, 'all').chart[0].year).toBe(2007)
})
it('preserves gaps as unknown, does not use reference eligibility to erase known amounts', async () => {
  const data = await history()
  data.records = data.records.filter((record) => record.fiscalYear !== 2023)
  data.annualSummaries = data.annualSummaries.filter(
    (item) => item.fiscalYear !== 2023,
  )
  data.annualSummaries.find(
    (item) => item.fiscalYear === 2025,
  )!.calculationIssues = [{ code: 'NO_IMPLEMENTED_YEAR_END_REPORT' }]
  const view = historyView(data, '5')
  expect(
    view.chart.find((group) => group.year === 2023)?.summary,
  ).toBeUndefined()
  expect(chartRecords(view.chart.at(-1)!)).toHaveLength(2)
  expect(yearChange(view.chart.at(-1)!, data.annualSummaries)).toBeNull()
})
it('never draws constituent bars for an ambiguous or incomplete total', async () => {
  const data = await history()
  const group = historyView(data, '5').chart.at(-1)!
  group.summary!.implementedTotal = null
  expect(chartRecords(group)).toEqual([])
})
it('includes only exact implementation status, keeping explicit zero', async () => {
  const data = await history()
  const group = historyView(data, '5').chart.at(-1)!
  group.records.push({
    ...group.records[0],
    recordId: 'proposal',
    progress: '董事会决议通过',
  })
  group.records[0].cashPerShare = '0'
  expect(chartRecords(group)).toHaveLength(2)
  expect(chartRecords(group)[0].cashPerShare).toBe('0')
})
it('sorts by ex-date, puts unknown dates last, and never substitutes other dates', () => {
  const rows = [
    {
      recordId: 'unknown',
      exDate: null,
      reportDate: '2025-06-30',
      recordDate: '2026-01-01',
    },
    { recordId: 'late', exDate: '2026-07-01', reportDate: '2025-12-31' },
    { recordId: 'early', exDate: '2026-02-01', reportDate: '2025-06-30' },
  ] as EastmoneyDividend[]
  expect(sortRecords(rows).map((row) => row.recordId)).toEqual([
    'early',
    'late',
    'unknown',
  ])
  expect(rows[0].exDate).toBeNull()
})
it('only computes signed year-on-year changes against a usable consecutive year', () => {
  const current: AnnualDividend = {
    fiscalYear: 2025,
    implementedTotal: '0.3887',
    implementedRecordCount: 2,
    calculationIssues: [],
    notices: [],
  }
  const previous = { ...current, fiscalYear: 2024, implementedTotal: '0.403' }
  const group = { year: 2025, summary: current, records: [] }
  expect(yearChange(group, [previous])).toBe('−3.55%')
  expect(yearChange(group, [{ ...previous, implementedTotal: '0' }])).toBeNull()
  expect(yearChange(group, [{ ...previous, fiscalYear: 2023 }])).toBeNull()
  expect(
    yearChange(group, [
      { ...previous, calculationIssues: [{ code: 'INCOMPLETE_FETCH' }] },
    ]),
  ).toBeNull()
})
it('supports empty and exclusively current-year histories', async () => {
  const data = await history()
  expect(
    historyView({ ...data, records: [], annualSummaries: [] }, 'all').chart,
  ).toEqual([])
  const current = {
    ...data,
    records: data.records.filter((record) => record.fiscalYear === 2026),
  } as DividendHistory
  expect(historyView(current, '5').chart.map((group) => group.year)).toEqual([
    2021, 2022, 2023, 2024, 2025,
  ])
  expect(historyView(current, '5').recent).toHaveLength(1)
})
