import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  dividendNotices,
  uniqueDividendNotices,
} from '../shared/dividendNotices'
import { DividendNotices } from '../src/features/dividends/DividendNotices'
import { dividendRecord as record } from './support/domain'

it.each([
  [{}, []],
  [{ bonusRatio: '0', transferRatio: '0' }, []],
  [{ bonusRatio: '2' }, ['SHARE_BASIS_CHANGED']],
  [{ transferRatio: '1' }, ['SHARE_BASIS_CHANGED']],
  [{ bonusRatio: '2', transferRatio: '1' }, ['SHARE_BASIS_CHANGED']],
  [
    { issues: [{ code: 'INVALID_FIELD', field: 'BONUS_RATIO' }] },
    ['INVALID_SHARE_RATIO'],
  ],
  [
    { issues: [{ code: 'INVALID_FIELD', field: 'IT_RATIO' }] },
    ['INVALID_SHARE_RATIO'],
  ],
  [
    {
      issues: [{ code: 'INVALID_FIELD', field: 'BONUS_RATIO' }],
      transferRatio: '1',
    },
    ['SHARE_BASIS_CHANGED', 'INVALID_SHARE_RATIO'],
  ],
  [{ issues: [{ code: 'INVALID_FIELD', field: 'NOTICE_DATE' }] }, []],
  [
    {
      issues: [{ code: 'INVALID_FIELD', field: 'BONUS_RATIO' }],
      transferRatio: '1',
      progress: '董事会决议通过',
    },
    [],
  ],
])('classifies normalized share fields consistently: %j', (fields, codes) => {
  expect(dividendNotices(record(fields)).map((notice) => notice.code)).toEqual(
    codes,
  )
})

it('keeps separators outside independently colored compact notices', () => {
  const notices = dividendNotices(
    record({
      issues: [{ code: 'INVALID_FIELD', field: 'BONUS_RATIO' }],
      transferRatio: '1',
    }),
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

it('keeps both information and errors separate in annual and record modes', () => {
  const item = record({
    issues: [{ code: 'INVALID_FIELD', field: 'BONUS_RATIO' }],
    transferRatio: '1',
  })
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

it('deduplicates summaries while retaining separate distribution records', () => {
  const first = record({ bonusRatio: '2', transferRatio: '1' })
  const second = record({
    recordId: 'interim',
    transferRatio: '3',
    reportDate: '2025-06-30',
  })
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

it('renders nothing for empty notices or records without implemented share changes', () => {
  for (const mode of ['compact', 'annual'] as const)
    expect(
      renderToStaticMarkup(
        createElement(DividendNotices, { mode, notices: [] }),
      ),
    ).toBe('')
  const records = [
    record(),
    record({ transferRatio: '1', progress: '董事会决议通过' }),
  ]
  expect(
    renderToStaticMarkup(
      createElement(DividendNotices, { mode: 'records', records }),
    ),
  ).toBe('')
})
