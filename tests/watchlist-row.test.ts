import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { dividendHistory } from './support/domain'
import { useWatchlistDividends } from '../src/features/watchlist/useWatchlistDividends'
import { StockRow } from '../src/features/watchlist/StockRow'
import { bankCompanies, now } from './support/context'

vi.mock('../src/features/watchlist/useWatchlistDividends', () => ({
  useWatchlistDividends: vi.fn(),
}))

function renderRow(quoteLoading = false) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(
        'table',
        {},
        createElement(
          'tbody',
          {},
          createElement(StockRow, {
            code: '601939',
            quoteLoading,
            expectedYield: '5.5',
            revision: 1,
            onResult: vi.fn(),
            onOpenOverview: vi.fn(),
            item: {
              failed: false,
              quote: {
                ...bankCompanies[0],
                price: '10',
                quoteTime: now.toISOString(),
                currency: 'CNY',
                issues: [],
              },
            },
          }),
        ),
      ),
    ),
  )
}

it.each([
  [true, false],
  [false, true],
  [true, true],
  [false, false],
])(
  'keeps values visible and marks the row busy until both requests finish (dividends: %s, quotes: %s)',
  (historyLoading, quoteLoading) => {
    const data = dividendHistory()
    vi.mocked(useWatchlistDividends).mockReturnValue({
      loading: historyLoading,
      response: {
        data,
        meta: {
          source: 'eastmoney',
          fetchedAt: now.toISOString(),
          cache: 'miss',
          issues: [],
        },
      },
    })
    const html = renderRow(quoteLoading)
    const loading = historyLoading || quoteLoading
    expect(html).toContain(`<tr aria-busy="${loading}">`)
    expect(html).toContain('class="row-refresh"')
    expect(html.includes('aria-label="更新中"')).toBe(loading)
    expect(html).not.toContain('更新中</span>')
    expect(html).toContain('¥10.00')
    expect(html).toContain('¥0.3')
    expect(html).toContain('3.00%')
  },
)

it('shows a concise refresh failure while keeping valuation and fetch time available', () => {
  const data = dividendHistory()
  vi.mocked(useWatchlistDividends).mockReturnValue({
    loading: false,
    error: '网络连接失败',
    response: {
      data,
      meta: {
        source: 'eastmoney',
        fetchedAt: now.toISOString(),
        cache: 'miss',
        issues: [],
      },
    },
  })
  const html = renderRow()
  expect(html).toContain('更新失败</span>')
  expect(html).not.toContain('更新中')
  expect(html).toContain('获取于 10/20 09:00')
  expect(html).not.toContain('更新失败 · 使用')
  expect(html).toContain('3.00%')
  expect(html).toContain('¥0.3')
})

it('does not substitute data from another company or year on the first failed request', () => {
  vi.mocked(useWatchlistDividends).mockReturnValue({
    loading: false,
    error: '网络连接失败',
  })
  const html = renderRow()
  expect(html).toContain('分红加载失败')
  expect(html).not.toContain('更新失败 · 使用')
  expect(html).toContain('class="yield-value">—</strong>')
})
it('shows share changes as information while keeping cash, yield and target visible', () => {
  const data = dividendHistory()
  data.records.find(
    (record) => record.reportDate === '2025-12-31',
  )!.transferRatio = '1'
  data.referenceDividend.notices = [{ code: 'SHARE_BASIS_CHANGED' }]
  vi.mocked(useWatchlistDividends).mockReturnValue({
    loading: false,
    response: {
      data,
      meta: {
        source: 'eastmoney',
        fetchedAt: now.toISOString(),
        cache: 'miss',
        issues: [],
      },
    },
  })
  const html = renderRow()
  expect(html).toContain(
    '<span class="dividend-notice dividend-notice--info">有送转</span>',
  )
  expect(html).not.toContain('class="row-status"')
  expect(html).toContain('¥0.3')
  expect(html).toContain('3.00%')
  expect(html).toContain('¥5.45')
})
it.each([
  ['missing-year', '该财年暂无分红记录'],
  ['incomplete', '分红记录尚未获取完整'],
])(
  'uses the same reason in the visible status and explanation for %s',
  (scenario, message) => {
    const data = dividendHistory()
    data.referenceDividend.cashPerShare = null
    data.referenceDividend.issues = [
      {
        code:
          scenario === 'missing-year'
            ? 'MISSING_REFERENCE_YEAR'
            : 'INCOMPLETE_FETCH',
      },
    ]
    vi.mocked(useWatchlistDividends).mockReturnValue({
      loading: false,
      response: {
        data,
        meta: {
          source: 'eastmoney',
          fetchedAt: now.toISOString(),
          cache: 'miss',
          issues: [],
        },
      },
    })
    const html = renderRow()
    expect(html).toContain(
      `<span class="row-status" role="status">${message}</span>`,
    )
    const title = html.match(/class="dividend-cell"[^>]*title="([^"]*)"/)?.[1]
    expect(title).toContain(message)
    expect(html).not.toContain('该财年暂不可计算')
  },
)
