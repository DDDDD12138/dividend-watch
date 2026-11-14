import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnnualDividend, Quote, QuoteItem } from '../shared/api'
import { calculateReferenceYield } from '../shared/money'
import { percent } from '../src/lib/format'
import {
  annualReferenceYield,
  requestDividendQuote,
} from '../src/features/dividends/referenceYield'

const quote: Quote = {
  code: '601939',
  name: '建设银行',
  market: 'SH',
  currency: 'CNY',
  price: '10.00',
  quoteTime: '2026-11-13T15:00:00+08:00',
  issues: [],
}
const summary: AnnualDividend = {
  fiscalYear: 2025,
  implementedTotal: '0.3887',
  implementedRecordCount: 2,
  calculationIssues: [],
  notices: [],
}

describe('annual reference yields', () => {
  it('uses the same calculation as the overview with two decimal places', () => {
    expect(annualReferenceYield(summary, quote)).toEqual({
      label: '3.89%',
      reason: null,
    })
    expect(annualReferenceYield(summary, quote).label).toBe(
      percent(calculateReferenceYield(summary.implementedTotal, quote.price)!),
    )
    expect(
      annualReferenceYield({ ...summary, implementedTotal: '0' }, quote).label,
    ).toBe('0.00%')
  })
  it('recalculates every year against a single updated price without mutating amounts', () => {
    const rows = [
      summary,
      { ...summary, fiscalYear: 2024, implementedTotal: '0.5' },
    ]
    expect(rows.map((row) => annualReferenceYield(row, quote).label)).toEqual([
      '3.89%',
      '5.00%',
    ])
    expect(
      rows.map(
        (row) => annualReferenceYield(row, { ...quote, price: '20.00' }).label,
      ),
    ).toEqual(['1.94%', '2.50%'])
    expect(rows[0].implementedTotal).toBe('0.3887')
  })
  it('keeps missing data distinct from an explicit zero', () => {
    expect(annualReferenceYield(undefined, quote)).toEqual({
      label: '—',
      reason: '年度分红金额暂不可用',
    })
    expect(
      annualReferenceYield({ ...summary, implementedTotal: null }, quote).label,
    ).toBe('—')
    expect(annualReferenceYield(summary, null)).toEqual({
      label: '—',
      reason: '行情暂不可用',
    })
    expect(
      annualReferenceYield(summary, { ...quote, quoteTime: null }).label,
    ).toBe('—')
  })
  it.each([
    'NO_IMPLEMENTED_YEAR_END_REPORT',
    'INCOMPLETE_FETCH',
    'MISSING_CASH_AMOUNT',
    'FISCAL_YEAR_NOT_ENDED',
    'AMBIGUOUS_RECORDS',
  ])(
    'does not present a complete annual yield when %s exists, even with a usable subtotal',
    (code) => {
      const value = annualReferenceYield(
        { ...summary, calculationIssues: [{ code }] },
        quote,
      )
      expect(value.label).toBe('—')
      expect(value.reason).toBeTruthy()
      if (code === 'NO_IMPLEMENTED_YEAR_END_REPORT')
        expect(value.reason).toBe('未取得该财年年报分红实施记录')
    },
  )
  it('does not block raw cash calculations for informational share notices', () => {
    expect(
      annualReferenceYield(
        {
          ...summary,
          notices: [
            { code: 'SHARE_BASIS_CHANGED' },
            { code: 'INVALID_SHARE_RATIO' },
          ],
        },
        quote,
      ).label,
    ).toBe('3.89%')
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('detail quote requests', () => {
  const meta = {
    source: 'tencent',
    fetchedAt: '2026-11-14T01:00:00Z',
    cache: 'miss',
    issues: [],
  }
  const signal = () => new AbortController().signal
  function respond(data: QuoteItem[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data, meta })),
    )
  }
  it('selects only the requested company and preserves the original quote time', async () => {
    respond([
      {
        code: '601398',
        quote: { ...quote, code: '601398', price: '20.00' },
        error: null,
      },
      { code: quote.code, quote, error: null },
    ])
    const result = await requestDividendQuote(
      '/api/quotes?codes=601939',
      signal(),
    )
    expect(result).toEqual({ data: quote, meta })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each(
    [
      [],
      [{ code: '601398', quote, error: null }],
      [{ code: '601939', quote: { ...quote, code: '601398' }, error: null }],
      [
        {
          code: '601939',
          quote: null,
          error: { code: 'QUOTE_UNAVAILABLE' as const },
        },
      ],
      [{ code: '601939', quote, error: { code: 'INVALID_QUOTE' as const } }],
      ...[null, '0', '0.001', 'invalid'].map((price) => [
        { code: '601939', quote: { ...quote, price }, error: null },
      ]),
      ...[null, 'invalid'].map((quoteTime) => [
        { code: '601939', quote: { ...quote, quoteTime }, error: null },
      ]),
    ].map((items) => ({ items })),
  )(
    'rejects unusable responses so the resource can retain its last success: %j',
    async ({ items }) => {
      respond(items)
      await expect(
        requestDividendQuote('/api/quotes?codes=601939', signal()),
      ).rejects.toThrow('行情暂不可用')
    },
  )
  it('propagates HTTP failures instead of returning an empty success', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE' } },
        { status: 502 },
      ),
    )
    await expect(
      requestDividendQuote('/api/quotes?codes=601939', signal()),
    ).rejects.toThrow('数据暂不可用')
  })
})
