import { describe, expect, it, vi } from 'vitest'
import {
  fetchAllocations,
  normalizeAllocation,
} from '../worker/providers/allocations'
import { createApp } from '../worker/app'
import { SourceCache, type ResponseCache } from '../worker/services/cache'
import { bankCompanies, bankIdentity, now, searchResponse } from './helpers'
import type {
  AllocationHistory,
  AnnualAllocation,
  ApiResponse,
} from '../shared/api'
import {
  allocationAmount,
  allocationChartAmount,
  allocationAxis,
  allocationGrowth,
  allocationRatio,
  allocationView,
} from '../src/features/dividends/allocationModel'

// Small contract examples. No production provider imports this data.
const row = (overrides: Record<string, unknown> = {}) => ({
  SECUCODE: '601939.SH',
  SECURITY_CODE: '601939',
  REPORT_DATE: '2025-12-31 00:00:00',
  PARENTNETPROFIT: 338906000000,
  DIVIDEND_IMPLE: 101684000000,
  DIVIDEND_PLAN: 200000000000,
  DIVIDEND_PAY_IMPLE: 30.003599818239,
  ...overrides,
})
const response = (data: unknown[], pages = 1, count = data.length) =>
  Response.json({ success: true, result: { data, pages, count } })
const identity = bankIdentity()
const record = (
  overrides: Partial<AnnualAllocation> = {},
): AnnualAllocation => ({
  fiscalYear: 2025,
  netProfit: '11200000000',
  cashDividend: '6000000000',
  issues: [],
  ...overrides,
})
function history(records: AnnualAllocation[]): AllocationHistory {
  return {
    company: bankCompanies[0],
    source: 'eastmoney',
    sourceUrl: 'https://example.test',
    lastEndedYear: 2025,
    years: records,
    coverage: {
      fetchedRecords: records.length,
      returnedRecords: records.length,
      pagesRead: 1,
      completeFetch: true,
    },
  }
}
describe('annual statistics source contract', () => {
  it('uses implemented CNY amounts, not percentage fields, proposal amounts or current shares', () => {
    const result = normalizeAllocation(identity, row({ TOTAL_SHARES: 1 }))
    expect(result).toEqual({
      fiscalYear: 2025,
      netProfit: '338906000000',
      cashDividend: '101684000000',
      issues: [],
    })
    expect(allocationRatio(result)).toBe('30.0')
  })
  it('preserves losses, explicit zero and missing fields separately', () => {
    const result = normalizeAllocation(
      identity,
      row({ PARENTNETPROFIT: -921216000, DIVIDEND_IMPLE: 0 }),
    )
    expect(result.netProfit).toBe('-921216000')
    expect(result.cashDividend).toBe('0')
    expect(allocationRatio(result)).toBeNull()
    const missing = normalizeAllocation(identity, row({ DIVIDEND_IMPLE: null }))
    expect(missing.cashDividend).toBeNull()
    expect(missing.issues[0].field).toBe('DIVIDEND_IMPLE')
  })
  it.each([-1, 'not-a-number', {}, 1e20])(
    'does not turn malformed cash %j into zero or a proposal',
    (value) => {
      const result = normalizeAllocation(
        identity,
        row({ DIVIDEND_IMPLE: value }),
      )
      expect(result.cashDividend).toBeNull()
      expect(result.netProfit).toBe('338906000000')
      expect(result.issues[0].code).toBe('INVALID_FIELD')
    },
  )
  it.each([
    { SECUCODE: '601939.HK' },
    { SECURITY_CODE: '601398' },
    { REPORT_DATE: '2025-06-30' },
    { REPORT_DATE: '2025-12-32' },
  ])('rejects mismatched identity or nonannual period %j', (change) => {
    expect(() => normalizeAllocation(identity, row(change))).toThrow()
  })
  it('requests the verified report, full market identity, and follows pagination', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('reportName')).toBe(
        'RPT_F10_DIVIDEND_HISTOGRAM',
      )
      expect(url.searchParams.get('filter')).toBe('(SECUCODE="601939.SH")')
      return response(
        [
          row({
            REPORT_DATE:
              url.searchParams.get('pageNumber') === '1'
                ? '2025-12-31'
                : '2024-12-31',
          }),
        ],
        2,
        2,
      )
    })
    const result = await fetchAllocations(fetcher, identity, now)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.years.map((r) => r.fiscalYear)).toEqual([2025, 2024])
    expect(result.coverage.completeFetch).toBe(true)
  })
  it('marks changing pagination and count mismatch incomplete while retaining received records', async () => {
    const result = await fetchAllocations(
      async (input) =>
        new URL(String(input)).searchParams.get('pageNumber') === '1'
          ? response([row()], 2, 2)
          : response([row({ REPORT_DATE: '2024-12-31' })], 1, 1),
      identity,
      now,
    )
    expect(result.coverage.completeFetch).toBe(false)
    expect(result.years).toHaveLength(1)
    expect(result.issues.map((i) => i.code)).toContain('INCOMPLETE_PAGINATION')
  })
  it('does not choose between conflicting same-year values or keep another market’s row', async () => {
    const result = await fetchAllocations(
      async () =>
        response([
          row(),
          row({ DIVIDEND_IMPLE: 10 }),
          row({ SECUCODE: '601939.HK' }),
        ]),
      identity,
      now,
    )
    expect(result.years).toEqual([])
    expect(result.coverage.completeFetch).toBe(false)
    expect(result.issues.map((i) => i.code)).toEqual([
      'CONFLICTING_ANNUAL_RECORDS',
      'INVALID_ANNUAL_RECORD',
    ])
  })
  it('accepts exact duplicates without summing annual totals twice', async () => {
    const result = await fetchAllocations(
      async () => response([row(), row()]),
      identity,
      now,
    )
    expect(result.years).toHaveLength(1)
    expect(result.years[0].cashDividend).toBe('101684000000')
  })
  it('accepts explicit empty data but rejects arbitrary failure text', async () => {
    const empty = await fetchAllocations(
      async () => response([], 0, 0),
      identity,
      now,
    )
    expect(empty.coverage.completeFetch).toBe(true)
    expect(empty.years).toEqual([])
    const explicitEmpty = await fetchAllocations(
      async () => Response.json({ success: false, code: 9201, result: null }),
      identity,
      now,
    )
    expect(explicitEmpty.years).toEqual([])
    expect(explicitEmpty.coverage.completeFetch).toBe(true)
    await expect(
      fetchAllocations(
        async () =>
          Response.json({
            success: false,
            code: 123,
            message: '没有数据',
            result: null,
          }),
        identity,
        now,
      ),
    ).rejects.toThrow()
    await expect(
      fetchAllocations(async () => response([row()], 0, 1), identity, now),
    ).rejects.toThrow()
  })
})
describe('allocation presentation and calculations', () => {
  it('computes rounded percentages from same-period totals, including zero and more than 100%', () => {
    expect(allocationRatio(record())).toBe('53.6')
    expect(allocationRatio(record({ cashDividend: '0' }))).toBe('0.0')
    expect(allocationRatio(record({ cashDividend: '14000000000' }))).toBe(
      '125.0',
    )
    expect(allocationRatio(record({ netProfit: '0' }))).toBeNull()
    expect(allocationRatio(record({ netProfit: '-10' }))).toBeNull()
    expect(allocationRatio(record({ netProfit: null }))).toBeNull()
  })
  it('compares only adjacent years with a positive base, preserving negative current profit', () => {
    expect(
      allocationGrowth(
        record(),
        record({ fiscalYear: 2024, netProfit: '11000000000' }),
      ),
    ).toBe('+1.8%')
    expect(
      allocationGrowth(
        record({ netProfit: '-10' }),
        record({ fiscalYear: 2024, netProfit: '10' }),
      ),
    ).toBe('−200.0%')
    expect(allocationGrowth(record(), record({ fiscalYear: 2023 }))).toBeNull()
    expect(
      allocationGrowth(record(), record({ fiscalYear: 2024, netProfit: '0' })),
    ).toBeNull()
  })
  it('keeps calendar gaps unknown and uses the server calendar year even without records for that year', () => {
    const data = history([
      record({ fiscalYear: 2026 }),
      record(),
      record({ fiscalYear: 2023 }),
      record({ fiscalYear: 2014 }),
    ])
    expect(allocationView(data, '5').map((p) => p.year)).toEqual([
      2021, 2022, 2023, 2024, 2025,
    ])
    expect(allocationView(data, '5')[3].record).toBeUndefined()
    expect(allocationView(data, 'all')[0].year).toBe(2014)
    expect(
      allocationView({ ...data, lastEndedYear: 2026 }, '5').at(-1)!.year,
    ).toBe(2026)
  })
  it('keeps trailing years visible without borrowing old annual figures or ratios', () => {
    const data = history([record({ fiscalYear: 2022 })])
    for (const range of ['5', '10', 'all'] as const) {
      const points = allocationView(data, range)
      expect(points.at(-1)?.year).toBe(2025)
      expect(
        points
          .slice(-3)
          .every(
            (point) =>
              point.record === undefined &&
              point.ratio === null &&
              point.growth === null,
          ),
      ).toBe(true)
    }
    expect(allocationView(history([]), '5').map((point) => point.year)).toEqual(
      [2021, 2022, 2023, 2024, 2025],
    )
    expect(allocationView(history([]), 'all')).toEqual([])
  })
  it('formats signed and very small monetary values without rounding nonzero amounts to zero', () => {
    expect(allocationAmount('11200000000')).toBe('112.0')
    expect(allocationAmount('-12543952.11')).toBe('−0.13')
    expect(allocationAmount('1000')).toBe('0.000010')
    expect(allocationAmount('0.00000001')).toBe('0.0000000000000001')
    expect(allocationAmount(null)).toBe('—')
    expect(allocationAmount('0')).toBe('0.0')
    expect(allocationChartAmount('338906000000')).toBe('3389')
    expect(allocationAmount('338906000000')).toBe('3389.1')
  })
  it('plots negative profit below zero and does not cap a dividend at its profit', () => {
    const points = allocationView(
      history([
        record({
          fiscalYear: 2024,
          netProfit: '-10000000000',
          cashDividend: '2000000000',
        }),
        record({ cashDividend: '20000000000' }),
      ]),
      '5',
    )
    const axis = allocationAxis(points)
    expect(axis.minimum).toBeLessThanOrEqual(-100)
    expect(axis.maximum).toBeGreaterThanOrEqual(200)
    expect(axis.ticks.some((tick) => tick.value === 0)).toBe(true)
    expect(new Set(axis.ticks.map((tick) => tick.label)).size).toBe(
      axis.ticks.length,
    )
    expect(
      allocationAxis([]).ticks.every((tick) => Number.isFinite(tick.value)),
    ).toBe(true)
  })
})
describe('allocation API', () => {
  function setup(clock = () => now) {
    const entries = new Map<string, Response>()
    const cache: ResponseCache = {
      match: async (key) => entries.get(key.url)?.clone(),
      put: async (key, value) => {
        entries.set(key.url, value.clone())
      },
    }
    let broken = false
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('searchapi.eastmoney.com'))
        return searchResponse(bankCompanies)
      if (broken) throw new Error('private upstream details')
      return response([row()])
    })
    return {
      app: createApp({ fetcher, cache, now: clock }),
      fetcher,
      break: () => {
        broken = true
      },
      cache,
    }
  }
  it('resolves identities, returns independent annual statistics and reuses only valid source caches', async () => {
    const { app, fetcher } = setup()
    const first = await app.request('/api/companies/601939/allocations')
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    const body = (await first.json()) as ApiResponse<AllocationHistory>
    expect(body.data.company).toEqual(bankCompanies[0])
    expect(body.data.lastEndedYear).toBe(2025)
    expect(body.data.years[0].cashDividend).toBe('101684000000')
    expect(body.meta.cache).toBe('miss')
    const second = (await (
      await app.request('/api/companies/601939/allocations')
    ).json()) as ApiResponse<AllocationHistory>
    expect(second.meta.cache).toBe('hit')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('advances the server calendar year at midnight even when the source response remains cached', async () => {
    let time = new Date('2026-12-31T15:59:00Z')
    const { app, fetcher } = setup(() => time)
    const before = (await (
      await app.request('/api/companies/601939/allocations')
    ).json()) as ApiResponse<AllocationHistory>
    time = new Date('2026-12-31T16:01:00Z')
    const after = (await (
      await app.request('/api/companies/601939/allocations')
    ).json()) as ApiResponse<AllocationHistory>
    expect(before.data.lastEndedYear).toBe(2025)
    expect(after.data.lastEndedYear).toBe(2026)
    expect(after.meta.cache).toBe('hit')
    expect(after.meta.fetchedAt).toBe(before.meta.fetchedAt)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('keeps malformed identities, unknown companies and upstream failures distinct', async () => {
    const state = setup()
    expect(
      (await state.app.request('/api/companies/x/allocations')).status,
    ).toBe(400)
    expect(
      (await state.app.request('/api/companies/999999/allocations')).status,
    ).toBe(404)
    state.break()
    const failed = await state.app.request('/api/companies/601939/allocations')
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain('private upstream details')
  })
  it('does not persist malformed source values in the cache', async () => {
    const entries = new Map<string, Response>()
    const cache = new SourceCache({
      match: async (key) => entries.get(key.url)?.clone(),
      put: async (key, value) => {
        entries.set(key.url, value)
      },
    })
    const load = () =>
      fetchAllocations(
        async () => response([row({ DIVIDEND_IMPLE: 'bad' })]),
        identity,
        now,
      )
    const result = await cache.get(
      'allocation-test',
      3600,
      load,
      (value) =>
        value.coverage.completeFetch &&
        value.years.every((r) => !r.issues.length),
    )
    expect(result.value.years[0].cashDividend).toBeNull()
    expect(entries.size).toBe(0)
  })
})
