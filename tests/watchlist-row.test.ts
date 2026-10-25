import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { useDividends } from '../src/data/api'
import { StockRow } from '../src/features/watchlist/StockRow'
import { buildHistory } from '../worker/services/history'
import { fetchDividends } from '../worker/providers/eastmoney'
import { bankCompanies, fixtureFetcher, now } from './helpers'

vi.mock('../src/data/api', () => ({ useDividends: vi.fn() }))

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
            quote: {
              code: '601939',
              error: null,
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
  async (historyLoading, quoteLoading) => {
    const data = buildHistory(
      bankCompanies[0],
      await fetchDividends(fixtureFetcher, bankCompanies[0], now),
      now,
    )
    vi.mocked(useDividends).mockReturnValue({
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
    expect(html).toContain('¥0.3887')
    expect(html).toContain('3.89%')
  },
)

it('shows a concise refresh failure while keeping valuation and fetch time available', async () => {
  const data = buildHistory(
    bankCompanies[0],
    await fetchDividends(fixtureFetcher, bankCompanies[0], now),
    now,
  )
  vi.mocked(useDividends).mockReturnValue({
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
  expect(html).toContain('3.89%')
  expect(html).toContain('¥0.3887')
})

it('does not substitute data from another company or year on the first failed request', () => {
  vi.mocked(useDividends).mockReturnValue({
    loading: false,
    error: '网络连接失败',
  })
  const html = renderRow()
  expect(html).toContain('分红加载失败')
  expect(html).not.toContain('更新失败 · 使用')
  expect(html).toContain('class="yield-value">—</strong>')
})
it.each([
  ['missing-year', '该财年暂无分红记录'],
  ['share-change', '存在送转股，历史每股金额不直接用于当前价格计算'],
  ['incomplete', '分红记录尚未获取完整'],
])(
  'uses the same reason in the visible status and explanation for %s',
  async (scenario, message) => {
    const input = await fetchDividends(fixtureFetcher, bankCompanies[0], now)
    if (scenario === 'missing-year')
      input.records = input.records.filter(
        (record) => record.fiscalYear !== 2025,
      )
    if (scenario === 'share-change')
      input.records.find(
        (record) => record.reportDate === '2025-12-31',
      )!.bonusRatio = '1'
    if (scenario === 'incomplete') input.completeFetch = false
    const data = buildHistory(bankCompanies[0], input, now)
    vi.mocked(useDividends).mockReturnValue({
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
