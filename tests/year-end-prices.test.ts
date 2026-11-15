import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { YearEndPrice } from '../shared/api'
import { createApp } from '../worker/app'
import { fetchYearEndPrices } from '../worker/providers/year-end-prices'
import { SourceCache, type ResponseCache } from '../worker/services/cache'
import { yearEndPriceService } from '../worker/services/year-end-prices'
import { priceYears } from '../worker/validation'
import { annualYieldValues } from '../src/features/dividends/referenceYield'
import {
  yearEndPriceStatus,
  requestYearEndPrices,
} from '../src/features/dividends/yearEndPrices'
import { annualDividend } from './support/domain'
import { bankCompanies, now } from './support/context'
import { apiFetcher } from './support/providers'

const company = bankCompanies[0]
const candle = (day = '2025-12-31', close: unknown = '10.000') => ({
  day,
  close,
  open: '9.000',
  high: '11.000',
  low: '8.000',
  volume: '100000',
})
function memoryCache(clock = () => now) {
  const entries = new Map<string, Response>()
  const storage: ResponseCache = {
    async match(key) {
      return entries.get(key.url)?.clone()
    },
    async put(key, value) {
      entries.set(key.url, value.clone())
    },
  }
  return new SourceCache(storage, clock)
}
function service(
  fetcher: Parameters<typeof yearEndPriceService>[0]['fetcher'],
  cache = new SourceCache(),
  clock = () => now,
) {
  return yearEndPriceService({
    companies: {
      resolve: async () => company,
      search: async () => {
        throw new Error('unused')
      },
    },
    cache,
    fetcher,
    now: clock,
  })
}
const price = (fiscalYear = 2025, amount = '10'): YearEndPrice => ({
  fiscalYear,
  price: amount,
  tradeDate: `${fiscalYear}-12-31`,
  fetchedAt: now.toISOString(),
  issues: [],
})
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('unadjusted annual candles', () => {
  it.each([
    ['600741', 'SH', 'sh600741'],
    ['000001', 'SZ', 'sz000001'],
    ['920002', 'BJ', 'bj920002'],
  ] as const)(
    'uses one annual request for five completed years of %s',
    async (code, market, symbol) => {
      const fetcher = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input))
          expect(url.origin + url.pathname).toBe(
            'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
          )
          expect(Object.fromEntries(url.searchParams)).toEqual({
            symbol,
            scale: '86400',
            ma: 'no',
            datalen: '6',
          })
          expect(init?.redirect).toBe('manual')
          return Response.json(
            [2021, 2022, 2023, 2024, 2025]
              .map((y) => candle(`${y}-12-31`))
              .concat(candle('2026-10-19', '99')),
          )
        },
      )
      const result = await fetchYearEndPrices(
        fetcher,
        { code, market },
        2021,
        now,
      )
      expect(result.years).toEqual(
        [2021, 2022, 2023, 2024, 2025].map((y) => price(y)),
      )
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )
  it('requests eleven annual rows for ten years instead of batching daily histories', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      expect(new URL(String(input)).searchParams.get('datalen')).toBe('11')
      return Response.json([candle()])
    })
    const result = await service(fetcher).get(
      company.code,
      Array.from({ length: 10 }, (_, i) => 2016 + i),
    )
    expect(result.data.years).toHaveLength(10)
    expect(result.data.years.at(-1)).toEqual(price())
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('uses candle dates, not array position, and retains the actual last trade during suspension', async () => {
    const result = await fetchYearEndPrices(
      async () =>
        Response.json([
          candle('2025-05-09', '12.000'),
          candle('2023-12-29', '8.000'),
        ]),
      company,
      2023,
      now,
    )
    expect(result.years).toEqual([
      { ...price(2023, '8'), tradeDate: '2023-12-29' },
      {
        ...price(2024),
        price: null,
        tradeDate: null,
        issues: [{ code: 'NO_YEAR_END_PRICE' }],
      },
      { ...price(2025, '12'), tradeDate: '2025-05-09' },
    ])
  })
  it('ignores extra older candles when no current-year candle exists', async () => {
    const result = await fetchYearEndPrices(
      async () => Response.json([candle('2024-12-31'), candle()]),
      company,
      2025,
      now,
    )
    expect(result.years).toEqual([price()])
  })
  it('isolates malformed closing prices without losing other years', async () => {
    for (const invalid of ['0', '10.001', 'invalid', 10, null]) {
      const result = await fetchYearEndPrices(
        async () => Response.json([candle('2024-12-31', invalid), candle()]),
        company,
        2024,
        now,
      )
      expect(result.years[0].issues).toEqual([
        { code: 'INVALID_YEAR_END_PRICE' },
      ])
      expect(result.years[0].price).toBeNull()
      expect(result.years[0].tradeDate).toBeNull()
      expect(result.years[1]).toEqual(price())
    }
  })
  it.each([
    null,
    { __ERROR: 2, __ERRORMSG: 'Input error' },
    {},
    [candle('2025-02-30')],
    [candle('2026-12-31')],
    [candle('1989-12-31')],
    [candle('2025-06-30'), candle()],
    [candle(), candle()],
    ['2025-12-31,10'],
    [{ close: '10' }],
    [candle('2023-12-31'), candle('2024-12-31'), candle()],
  ])(
    'rejects invalid envelopes, dates, duplicate years or excess rows: %j',
    async (body) => {
      await expect(
        fetchYearEndPrices(async () => Response.json(body), company, 2025, now),
      ).rejects.toThrow()
    },
  )
  it('returns missing prices for a successful empty array', async () => {
    const result = await fetchYearEndPrices(
      async () => Response.json([]),
      company,
      2025,
      now,
    )
    expect(result.years[0]).toMatchObject({
      price: null,
      tradeDate: null,
      issues: [{ code: 'NO_YEAR_END_PRICE' }],
    })
  })
  it('accepts the full completed year range and respects the Shanghai year boundary', () => {
    expect(priceYears(['2025,2024,2025'], now)).toEqual([2024, 2025])
    expect(priceYears(['2020,2021,2022,2023,2024,2025'], now)).toHaveLength(6)
    expect(priceYears(['2025'], new Date('2025-12-31T16:00:00Z'))).toEqual([
      2025,
    ])
    for (const input of [
      [],
      [''],
      ['2026'],
      ['1989'],
      ['2025,'],
      ['2025', '2024'],
    ])
      expect(() => priceYears(input, now)).toThrow('INVALID_QUERY')
  })
  it('returns INVALID_QUERY before contacting the source', async () => {
    const fetcher = vi.fn(apiFetcher)
    const response = await createApp({ fetcher, now: () => now }).request(
      '/api/companies/601939/year-end-prices?years=2026',
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_QUERY' } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns sorted requested years with Sina metadata and one upstream call', async () => {
    const source = vi.fn(async () =>
      Response.json([
        candle('2023-12-29'),
        candle('2024-12-31', 'bad'),
        candle(),
      ]),
    )
    const app = createApp({
      now: () => now,
      fetcher: async (input, init) => {
        if (new URL(String(input)).hostname === 'money.finance.sina.com.cn')
          return source()
        return apiFetcher(input, init)
      },
    })
    const response = await app.request(
      '/api/companies/601939/year-end-prices?years=2025,2023,2024',
    )
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(
      result.data.years.map((row: YearEndPrice) => row.fiscalYear),
    ).toEqual([2023, 2024, 2025])
    expect(result.data.years[2]).toEqual(price())
    expect(result.meta.source).toBe('sina')
    expect(result.meta.issues).toEqual([
      { code: 'INVALID_YEAR_END_PRICE', field: '2024' },
    ])
    expect(source).toHaveBeenCalledOnce()
  })
  it('isolates former providers and expires annual caches after 24 hours and at the new year', async () => {
    let clock = now
    const cache = memoryCache(() => clock)
    for (const key of [
      'year-end-prices/SH601939/2025',
      'year-end-prices/eastmoney-v1/SH601939/2025',
    ])
      await cache.get(
        key,
        86400,
        async () => price(2025, '99'),
        () => true,
      )
    const fetcher = vi.fn(async (_input: string | URL | Request) =>
      Response.json([candle()]),
    )
    const prices = service(fetcher, cache, () => clock)
    expect((await prices.get(company.code, [2025])).data.years).toEqual([
      price(),
    ])
    expect((await prices.get(company.code, [2025])).meta).toMatchObject({
      source: 'sina',
      cache: 'hit',
      fetchedAt: now.toISOString(),
    })
    expect(fetcher).toHaveBeenCalledOnce()
    clock = new Date(now.getTime() + 86400_000)
    await prices.get(company.code, [2025])
    expect(fetcher).toHaveBeenCalledTimes(2)
    clock = new Date('2026-12-31T15:59:00Z')
    await prices.get(company.code, [2025])
    clock = new Date('2026-12-31T16:01:00Z')
    await prices.get(company.code, [2025])
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(
      new URL(String(fetcher.mock.calls.at(-1)?.[0])).searchParams.get(
        'datalen',
      ),
    ).toBe('11')
  })
  it('shares one cached fetch between the 5- and 10-year ranges of a recent listing', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) =>
      Response.json([2023, 2024, 2025].map((y) => candle(`${y}-12-31`))),
    )
    const prices = service(fetcher, memoryCache())
    const five = await prices.get(company.code, [2021, 2022, 2023, 2024, 2025])
    expect(five.data.years.map((row) => row.price)).toEqual([
      null,
      null,
      '10',
      '10',
      '10',
    ])
    const ten = await prices.get(
      company.code,
      Array.from({ length: 10 }, (_, i) => 2016 + i),
    )
    expect(ten.meta.cache).toBe('hit')
    expect(ten.data.years).toHaveLength(10)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('does not cache a gap after the first available year', async () => {
    const fetcher = vi.fn(async () =>
      Response.json([candle('2023-12-29'), candle()]),
    )
    const prices = service(fetcher, memoryCache())
    await prices.get(company.code, [2025])
    await prices.get(company.code, [2025])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('does not cache missing or malformed annual prices', async () => {
    for (const rows of [[], [candle('2025-12-31', 'bad')]]) {
      const fetcher = vi.fn(async () => Response.json(rows))
      const prices = service(fetcher, memoryCache())
      await prices.get(company.code, [2025])
      await prices.get(company.code, [2025])
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })
})

describe('historical yield calculation and client contract', () => {
  it('uses each fiscal year price without adjusting share changes', () => {
    const summaries = [
      annualDividend({
        fiscalYear: 2024,
        implementedTotal: '0.4',
        notices: [{ code: 'SHARE_BASIS_CHANGED' }],
      }),
      annualDividend({ fiscalYear: 2025, implementedTotal: '0.3' }),
    ]
    const values = annualYieldValues(summaries, 'yearEnd', null, {
      prices: new Map([
        [2024, price(2024, '20')],
        [2025, price()],
      ]),
    })
    expect([...values.values()].map((row) => row.label)).toEqual([
      '2.00%',
      '3.00%',
    ])
    expect(values.get(2024)?.tradeDate).toBe('2024-12-31')
    expect(summaries[0].implementedTotal).toBe('0.4')
  })
  it('preserves annual eligibility and distinguishes zero from missing prices', () => {
    const calculate = (
      summary: ReturnType<typeof annualDividend>,
      prices = new Map([[2025, price()]]),
    ) =>
      annualYieldValues([summary], 'yearEnd', null, { prices }).get(2025)!.label
    expect(calculate(annualDividend({ implementedTotal: '0' }))).toBe('0.00%')
    expect(
      calculate(annualDividend({ implementedTotal: '0' }), new Map()),
    ).toBe('—')
    expect(
      calculate(
        annualDividend({
          calculationIssues: [{ code: 'NO_IMPLEMENTED_YEAR_END_REPORT' }],
        }),
      ),
    ).toBe('—')
  })
  it('rejects a wrong company, missing year, invalid date, or invalid close', async () => {
    for (const data of [
      { company: { ...company, code: '601398' }, years: [price()] },
      { company, years: [] },
      { company, years: [price(2024)] },
      { company, years: [{ ...price(), tradeDate: '2025-02-30' }] },
      { company, years: [{ ...price(), price: '0' }] },
    ]) {
      vi.stubGlobal('fetch', async () => Response.json({ data }))
      await expect(
        requestYearEndPrices(
          company.code,
          [2025],
          new AbortController().signal,
        ),
      ).rejects.toThrow()
    }
  })
})

describe('historical price failure diagnostics', () => {
  it('reports loading and failed requests instead of missing data, and keeps the price for years without a summary', () => {
    const reason = (state: Parameters<typeof annualYieldValues>[3]) =>
      annualYieldValues([annualDividend()], 'yearEnd', null, state).get(2025)!
        .reason
    expect(reason({ prices: new Map(), loading: true })).toBe('历史行情加载中…')
    expect(reason({ prices: new Map(), failures: new Set([2025]) })).toBe(
      '历史行情请求失败，请刷新重试',
    )
    expect(reason({ prices: new Map() })).toBe('该年年末价格暂不可用')
    const gap = annualYieldValues(
      [],
      'yearEnd',
      null,
      { prices: new Map([[2025, price()]]) },
      [2025],
    ).get(2025)
    expect(gap).toMatchObject({
      label: '—',
      price: '10',
      tradeDate: '2025-12-31',
    })
  })
  it.each([
    [501, '<html>blocked</html>', 'YEAR_END_PRICE_UNAVAILABLE'],
    [200, JSON.stringify({ __ERROR: 2 }), 'INVALID_YEAR_END_PRICE'],
    [200, '[]', 'NO_YEAR_END_PRICE'],
  ])(
    'distinguishes HTTP failure, malformed responses, and empty history (%s)',
    async (status, body, issue) => {
      const prices = service(async () => new Response(body, { status }))
      const result = await prices.get(company.code, [2024, 2025])
      expect(result.data.years.map((row) => row.issues[0].code)).toEqual([
        issue,
        issue,
      ])
      if (status === 501)
        expect(console.warn).toHaveBeenCalledWith(
          'Year-end price request failed',
          expect.objectContaining({
            code: company.code,
            years: [2024, 2025],
            source: 'sina',
            message: 'Upstream HTTP 501',
          }),
        )
    },
  )
  it('does not label a total failure as partial or mistake empty data for a request failure', () => {
    const years = [2024, 2025]
    expect(yearEndPriceStatus(years, new Map(), new Set(years))).toBe(
      '历史行情加载失败',
    )
    expect(yearEndPriceStatus(years, new Map(), new Set([2024]))).toBe(
      '部分行情加载失败',
    )
    expect(
      yearEndPriceStatus(
        years,
        new Map([[2024, price(2024)]]),
        new Set([2024]),
      ),
    ).toBe('更新失败')
    const missing = new Map(
      years.map((year) => [
        year,
        {
          ...price(year),
          price: null,
          tradeDate: null,
          issues: [{ code: 'NO_YEAR_END_PRICE' }],
        },
      ]),
    )
    expect(yearEndPriceStatus(years, missing, new Set(years))).toBe(
      '暂无历史行情',
    )
    expect(yearEndPriceStatus(years, missing, new Set([2024]))).toBe(
      '部分年份无行情',
    )
    expect(yearEndPriceStatus(years, new Map(), new Set())).toBeUndefined()
  })
  it('explains missing data separately from source failure in the yearly tooltip', () => {
    for (const [code, reason] of [
      ['YEAR_END_PRICE_UNAVAILABLE', '历史行情请求失败，请刷新重试'],
      ['INVALID_YEAR_END_PRICE', '历史行情数据格式异常'],
      ['NO_YEAR_END_PRICE', '来源未返回该年的交易记录'],
    ]) {
      const result = annualYieldValues([annualDividend()], 'yearEnd', null, {
        prices: new Map([
          [
            2025,
            {
              ...price(),
              price: null,
              tradeDate: null,
              issues: [{ code }],
            },
          ],
        ]),
      })
      expect(result.get(2025)).toMatchObject({ label: '—', reason })
    }
  })
})
