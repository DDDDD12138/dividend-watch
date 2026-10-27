import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DividendHistory, Quote } from '../shared/api'
import { useResource, type Resource } from '../src/data/api'
import { CompanyOverview } from '../src/features/company/CompanyOverview'

vi.mock('../src/data/api', () => ({ useResource: vi.fn() }))
// Rendering tests cover content and calculation; browser checks cover the native dialog.
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children }: { children: ReactNode }) => children,
}))
const company = { code: '600941', name: '中国移动', market: 'SH' } as const
const quote: Quote = {
  ...company,
  price: '105',
  quoteTime: '2026-10-28T07:00:00Z',
  currency: 'CNY',
  issues: [],
}
const history: Resource<DividendHistory> = {
  loading: false,
  response: {
    data: {
      company,
      code: company.code,
      source: 'eastmoney',
      sourceUrl: 'https://example.test/dividends',
      records: [],
      annualSummaries: [],
      referenceDividend: {
        fiscalYear: 2025,
        cashPerShare: '4.8',
        basis: 'eastmoney_implemented_sum',
        issues: [],
      },
      coverage: {
        completeFetch: true,
        fetchedRecords: 0,
        returnedRecords: 0,
        pagesRead: 1,
      },
    },
    meta: {
      source: 'eastmoney',
      fetchedAt: '2026-10-28T07:00:00Z',
      cache: 'miss',
      issues: [],
    },
  },
}
function render(
  overrides: Partial<Parameters<typeof CompanyOverview>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(CompanyOverview, {
        code: company.code,
        name: company.name,
        quote,
        history,
        expectedYield: '6',
        quoteLoading: false,
        quoteStatus: null,
        dividendStatus: null,
        onClose: vi.fn(),
        ...overrides,
      }),
    ),
  ).replace(/<span class="overview-unit">([¥%])<\/span>/g, '$1')
}
beforeEach(() => {
  vi.mocked(useResource)
    .mockReset()
    .mockReturnValue({ loading: false, error: '网络连接失败' })
})
describe('company overview data boundaries', () => {
  it('shows a business field issue without hiding the listing date or valuation', () => {
    vi.mocked(useResource).mockReturnValue({
      loading: false,
      response: {
        data: { company, listingDate: '2022-01-05', mainBusiness: null },
        meta: {
          ...history.response!.meta,
          issues: [{ code: 'INVALID_MAIN_BUSINESS', field: 'MAIN_BUSINESS' }],
        },
      },
    })
    const html = render()
    expect(html).toContain('A 股上市 2022-01-05')
    expect(html).toContain('主营业务暂不可用')
    expect(html).toContain('¥80.00')
    expect(html).not.toContain('公司资料加载失败')
  })
  it('keeps valuation and trial available when profile fails and links to existing records', () => {
    const html = render()
    expect(html).toContain('公司资料加载失败')
    expect(html).toContain('4.57%')
    expect(html).toContain('¥80.00')
    expect(html).toContain('23.81%')
    expect(html).toContain('href="/dividends/600941"')
    expect(html.match(/2025/g)).toHaveLength(1)
    expect(html).not.toContain('仅本次试算')
  })
  it('can calculate a target without live quote data', () => {
    const html = render({ quote: null, quoteStatus: '行情暂不可用' })
    expect(html).toContain('¥80.00')
    expect(html).not.toContain('4.57%')
    expect(html).not.toContain('23.81%')
  })
  it('does not use another year when reference data is missing', () => {
    const missing = structuredClone(history)
    missing.response!.data.referenceDividend.cashPerShare = null
    missing.response!.data.annualSummaries = [
      {
        fiscalYear: 2024,
        implementedTotal: '4.5',
        implementedRecordCount: 2,
        calculationIssues: [],
      },
    ]
    const html = render({
      history: missing,
      dividendStatus: '该财年暂无分红记录',
    })
    expect(html).toContain('2025 财年每股分红暂不可用于计算')
    expect(html).toContain('该财年暂无分红记录')
    expect(html).not.toContain('¥75.00')
    expect(html).not.toContain('已达到')
  })
  it('retains successful values with a concise update failure', () => {
    const html = render({
      history: { ...history, error: '网络连接失败' },
      quoteStatus: '更新失败',
      dividendStatus: '更新失败',
    })
    expect(html).toContain('¥80.00')
    expect(html).toContain('更新失败')
  })
  it('keeps a known zero distinct from missing dividends', () => {
    const zero = structuredClone(history)
    zero.response!.data.referenceDividend.cashPerShare = '0'
    const html = render({ history: zero })
    expect(html).toContain('¥0.00')
    expect(html).toContain('0.00%')
    expect(html).toContain('100.00%')
    expect(html).not.toContain('暂不可用于计算')
  })
})
