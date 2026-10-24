import { createElement } from 'react'
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
      expect(vi.mocked(useResource).mock.calls[0][0]).toBeNull()
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
          referenceEligible: true,
          calculationIssues: [],
        },
      }),
    )
    expect(html).toContain('年度每股现金分红')
    expect(html).toContain('¥0.600')
    expect(html).toContain('查看当年分红记录')
  })
})
