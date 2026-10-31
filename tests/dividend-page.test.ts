import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AllocationHistory } from '../shared/api'
import { useDividends, useResource, type Resource } from '../src/data/api'
import { DividendsPage } from '../src/features/dividends/DividendsPage'
import { AllocationPanel } from '../src/features/dividends/AllocationPanel'
import {
  AllocationDialog,
  type AllocationSelection,
} from '../src/features/dividends/AllocationDialog'
import { buildHistory } from '../worker/services/history'
import { fetchDividends } from '../worker/providers/eastmoney'
import { bankCompanies, fixtureFetcher, now } from './helpers'

vi.mock('../src/components/Modal', () => ({
  Modal: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../src/data/api', () => ({
  useDividends: vi.fn(),
  useResource: vi.fn(),
}))
const annual: Resource<AllocationHistory> = {
  loading: false,
  response: {
    data: {
      company: { code: '601939', name: '建设银行', market: 'SH' },
      source: 'eastmoney',
      sourceUrl: 'https://example.test/annual',
      lastEndedYear: 2025,
      years: [
        {
          fiscalYear: 2025,
          netProfit: '11200000000',
          cashDividend: '6000000000',
          issues: [],
        },
      ],
      coverage: {
        fetchedRecords: 1,
        returnedRecords: 1,
        pagesRead: 1,
        completeFetch: true,
      },
    },
    meta: {
      source: 'eastmoney',
      fetchedAt: '2026-10-24T01:00:00Z',
      cache: 'miss',
      issues: [],
    },
  },
}
const selection: AllocationSelection = {
  point: {
    year: 2025,
    record: annual.response!.data.years[0],
    ratio: '53.6',
    growth: null,
  },
  fetchedAt: annual.response!.meta.fetchedAt,
}
function renderPage() {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/dividends/601939'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/dividends/:code',
          element: createElement(DividendsPage),
        }),
      ),
    ),
  )
}
beforeEach(() => {
  vi.mocked(useDividends).mockReset()
  vi.mocked(useResource).mockReset().mockReturnValue({ loading: false })
})
describe('independent dividend detail views', () => {
  it('separates share information from invalid share data without blocking cash calculations', async () => {
    const input = await fetchDividends(fixtureFetcher, bankCompanies[0], now)
    const record = input.records.find(
      (record) => record.reportDate === '2025-12-31',
    )!
    record.transferRatio = '1'
    record.bonusRatio = null
    record.issues.push({
      code: 'INVALID_FIELD',
      field: 'BONUS_RATIO',
      recordId: record.recordId,
    })
    const data = buildHistory(bankCompanies[0], input, now)
    vi.mocked(useDividends).mockReturnValue({
      loading: false,
      response: { data, meta: annual.response!.meta },
    })
    const html = renderPage()
    expect(html).toContain(
      'class="dividend-notice dividend-notice--info">该财年包含送股或转增',
    )
    expect(html).toContain(
      'class="dividend-notice dividend-notice--error">送转资料异常，不影响现金分红计算。',
    )
    expect(html).toContain('class="reference-badge">首页参考')
    expect(data.referenceDividend.cashPerShare).toBe('0.3887')
    expect(data.referenceDividend.issues).toEqual([])
  })
  it('marks a cash reference year with transfers and displays notices separately from problems', async () => {
    const input = await fetchDividends(fixtureFetcher, bankCompanies[0], now)
    input.records.find(
      (record) => record.reportDate === '2025-12-31',
    )!.transferRatio = '1'
    vi.mocked(useDividends).mockReturnValue({
      loading: false,
      response: {
        data: buildHistory(bankCompanies[0], input, now),
        meta: annual.response!.meta,
      },
    })
    const html = renderPage()
    expect(html).toContain('class="reference-badge">首页参考')
    expect(html).toContain(
      'class="dividend-notice dividend-notice--info">该财年包含送股或转增，现金分红按原始每股金额汇总。',
    )
    expect(html).not.toContain('历史每股金额不直接用于当前价格计算')
  })
  it.each([
    [undefined, '来源未提供上市日期'],
    ['网络连接失败', '上市日期加载失败'],
  ])(
    'distinguishes an unknown listing date from a failed request: %s',
    (error, message) => {
      vi.mocked(useDividends).mockReturnValue({ loading: true })
      vi.mocked(useResource).mockReturnValueOnce({
        loading: false,
        error,
        response: { data: { listingDate: null }, meta: annual.response!.meta },
      })
      const html = renderPage()
      expect(html).toContain(message)
      expect(html).not.toContain(
        error ? '来源未提供上市日期' : '上市日期加载失败',
      )
    },
  )
  it('explicitly identifies retained annual statistics after refresh fails', () => {
    const html = renderToStaticMarkup(
      createElement(AllocationPanel, {
        resource: { ...annual, error: '网络连接失败' },
        range: '5',
        emphasis: null,
        onEmphasis: vi.fn(),
        onYear: vi.fn(),
      }),
    )
    expect(html).toContain('年度统计更新失败</p>')
    expect(html).not.toContain('当前显示')
  })
  it.each([{ loading: true }, { loading: false, error: '分红来源暂不可用' }])(
    'keeps the allocation switch reachable when dividend history is unavailable: %j',
    (resource) => {
      vi.mocked(useDividends).mockReturnValue(resource)
      const html = renderPage()
      expect(html).toContain('aria-label="图表内容"')
      expect(html).toContain('每股分红</button>')
      expect(html).toContain('分红比例</button>')
      const allocationSwitch = html.match(
        /<button[^>]*>分红比例<\/button>/,
      )?.[0]
      expect(allocationSwitch).toBeDefined()
      expect(allocationSwitch).not.toContain('disabled')
      expect(html).not.toContain('暂无分红记录')
      // Merely rendering the switch must not eagerly request the allocation endpoint.
      expect(
        vi
          .mocked(useResource)
          .mock.calls.some(([path]) => path?.endsWith('/allocations')),
      ).toBe(false)
    },
  )
  it('can use independently available allocation identity while dividends have failed', () => {
    vi.mocked(useDividends).mockReturnValue({
      loading: false,
      error: '分红来源暂不可用',
    })
    vi.mocked(useResource).mockReturnValue(annual)
    const html = renderPage()
    expect(html).toContain('建设银行')
    expect(html).toContain('沪市')
  })
  it('renders the allocation panel without requiring dividend history', () => {
    const html = renderToStaticMarkup(
      createElement(AllocationPanel, {
        resource: annual,
        range: '5',
        emphasis: null,
        onEmphasis: vi.fn(),
        onYear: vi.fn(),
      }),
    )
    expect(html).toContain('归母净利润')
    expect(html).toContain('现金分红比例')
    expect(html).not.toContain('年度统计更新失败')
  })
  it('keeps standalone annual figures while omitting unavailable per-share enrichment and navigation', () => {
    const html = renderToStaticMarkup(
      createElement(AllocationDialog, { selection, onClose: vi.fn() }),
    )
    expect(html).toContain('53.6')
    expect(html).toContain('112.0')
    expect(html).toContain('60.0')
    expect(html).not.toContain('年度每股现金分红')
    expect(html).not.toContain('查看当年分红记录')
    expect(html).not.toContain('该财年暂无可用分红明细')
  })
  it('includes the per-share summary and link when corresponding records are available', () => {
    const html = renderToStaticMarkup(
      createElement(AllocationDialog, {
        selection,
        onClose: vi.fn(),
        onYear: vi.fn(),
        dividend: {
          fiscalYear: 2025,
          implementedTotal: '0.6',
          implementedRecordCount: 2,
          calculationIssues: [],
          notices: [],
        },
      }),
    )
    expect(html).toContain('年度每股现金分红')
    expect(html).toContain('¥0.600')
    expect(html).toContain('查看当年分红记录')
  })
})
