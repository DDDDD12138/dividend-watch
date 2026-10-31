import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  dividendNotices,
  uniqueDividendNotices,
} from '../shared/dividendNotices'
import { DividendNotices } from '../src/features/dividends/DividendNotices'
import { normalizeRecord } from '../worker/providers/eastmoney'
import { bankIdentity, rows } from './helpers'

async function record(overrides: Record<string, unknown> = {}) {
  return normalizeRecord(bankIdentity(), {
    ...rows()[1],
    BONUS_RATIO: null,
    IT_RATIO: null,
    ...overrides,
  })
}

it.each([
  [{}, []],
  [{ BONUS_RATIO: 0, IT_RATIO: 0 }, []],
  [{ BONUS_RATIO: 2 }, ['SHARE_BASIS_CHANGED']],
  [{ IT_RATIO: 1 }, ['SHARE_BASIS_CHANGED']],
  [{ BONUS_RATIO: 2, IT_RATIO: 1 }, ['SHARE_BASIS_CHANGED']],
  [{ BONUS_RATIO: 'invalid' }, ['INVALID_SHARE_RATIO']],
  [{ IT_RATIO: 'invalid' }, ['INVALID_SHARE_RATIO']],
  [
    { BONUS_RATIO: 'invalid', IT_RATIO: 1 },
    ['SHARE_BASIS_CHANGED', 'INVALID_SHARE_RATIO'],
  ],
  [{ NOTICE_DATE: 'invalid' }, []],
  [
    { BONUS_RATIO: 'invalid', IT_RATIO: 1, ASSIGN_PROGRESS: '董事会决议通过' },
    [],
  ],
])('classifies source share fields consistently: %j', async (fields, codes) => {
  expect(
    dividendNotices(await record(fields)).map((notice) => notice.code),
  ).toEqual(codes)
})

it('keeps separators outside independently colored compact notices', async () => {
  const notices = dividendNotices(
    await record({ BONUS_RATIO: 'invalid', IT_RATIO: 1 }),
  )
  const html = renderToStaticMarkup(
    createElement(DividendNotices, { mode: 'compact', notices }),
  )
  expect(html).toContain(
    '<span class="dividend-notice dividend-notice--info">有送转</span>',
  )
  expect(html).toContain(
    '<span class="dividend-notice dividend-notice--error">送转资料异常</span>',
  )
  expect(html.match(/class="dividend-notices-separator"/g)).toHaveLength(2)
  expect(html).not.toMatch(/class="dividend-notice [^"]+">[^<]*·/)
})

it('keeps both information and errors separate in annual and record modes', async () => {
  const item = await record({ BONUS_RATIO: 'invalid', IT_RATIO: 1 })
  const notices = dividendNotices(item)
  const annual = renderToStaticMarkup(
    createElement(DividendNotices, { mode: 'annual', notices }),
  )
  const details = renderToStaticMarkup(
    createElement(DividendNotices, { mode: 'records', records: [item] }),
  )
  for (const html of [annual, details]) {
    expect(
      html.match(/class="dividend-notice dividend-notice--info"/g),
    ).toHaveLength(1)
    expect(
      html.match(/class="dividend-notice dividend-notice--error"/g),
    ).toHaveLength(1)
    expect(html).toContain('送转资料异常，不影响现金分红计算')
  }
  expect(annual).toContain('该财年包含送股或转增，现金分红按原始每股金额汇总。')
  expect(details).toContain('每 10 股转增 1 股')
})

it('deduplicates summaries while retaining separate distribution records', async () => {
  const first = await record({ BONUS_RATIO: 2, IT_RATIO: 1 })
  const second = await record({ IT_RATIO: 3, REPORT_DATE: '2025-06-30' })
  const notices = uniqueDividendNotices(
    [first, second].flatMap(dividendNotices),
  )
  expect(notices).toEqual([{ code: 'SHARE_BASIS_CHANGED' }])
  const html = renderToStaticMarkup(
    createElement(DividendNotices, {
      mode: 'records',
      records: [first, second],
    }),
  )
  expect(html).toContain('每 10 股送 2 股、转增 1 股')
  expect(html).toContain('每 10 股转增 3 股')
})

it('renders nothing for empty notices or records without implemented share changes', async () => {
  for (const mode of ['compact', 'annual'] as const)
    expect(
      renderToStaticMarkup(
        createElement(DividendNotices, { mode, notices: [] }),
      ),
    ).toBe('')
  const records = [
    await record(),
    await record({ IT_RATIO: 1, ASSIGN_PROGRESS: '董事会决议通过' }),
  ]
  expect(
    renderToStaticMarkup(
      createElement(DividendNotices, { mode: 'records', records }),
    ),
  ).toBe('')
})
