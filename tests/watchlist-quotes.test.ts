import { expect, it } from 'vitest'
import type { QuoteItem } from '../shared/api'
import { reconcileQuotes } from '../src/features/watchlist/quotes'

function item(code: string, price = '10'): QuoteItem {
  return {
    code,
    quote: {
      code,
      name: `公司${code}`,
      market: 'SH',
      price,
      quoteTime: '2026-10-27T10:00:00+08:00',
      currency: 'CNY',
      issues: [],
    },
    error: null,
  }
}

it('retains existing companies while a changed batch is pending, without inventing new data', () => {
  const previous = reconcileQuotes(['600000'], {}, [item('600000')])
  const pending = reconcileQuotes(['600000', '600001'], previous)
  expect(pending['600000']).toBe(previous['600000'])
  expect(pending['600001']).toBeUndefined()
  const updated = reconcileQuotes(['600000', '600001'], pending, [
    item('600000', '12'),
    item('600001'),
  ])
  expect(updated['600000'].quote?.price).toBe('12')
  expect(updated['600001'].quote?.name).toBe('公司600001')
})

it('cleans removed companies and ignores their responses, including after re-adding', () => {
  const previous = reconcileQuotes(['600000', '600001'], {}, [
    item('600000'),
    item('600001'),
  ])
  const removed = reconcileQuotes(['600001'], previous, [item('600000')])
  expect(Object.keys(removed)).toEqual(['600001'])
  expect(
    reconcileQuotes(['600000', '600001'], removed)['600000'],
  ).toBeUndefined()
  expect(reconcileQuotes([], previous)).toEqual({})
})

it('keeps the last quote on individual failure while preserving the failure indication', () => {
  const previous = reconcileQuotes(['600000'], {}, [item('600000')])
  const failed = reconcileQuotes(['600000', '600001'], previous, [
    ...['600000', '600001'].map((code) => ({
      code,
      quote: null,
      error: { code: 'QUOTE_UNAVAILABLE', message: '来源记录缺失' },
    })),
  ])
  expect(failed['600000']).toEqual({
    quote: previous['600000'].quote,
    failed: true,
  })
  expect(failed['600001']).toEqual({ quote: null, failed: true })
  const recovered = reconcileQuotes(['600000'], failed, [item('600000', '11')])
  expect(recovered['600000'].failed).toBe(false)
  expect(recovered['600000'].quote?.price).toBe('11')
})

it.each(['price', 'quoteTime'] as const)(
  'does not replace a usable quote with missing %s',
  (field) => {
    const previous = reconcileQuotes(['600000'], {}, [item('600000')])
    const incomplete = item('600000')
    incomplete.quote![field] = null
    const updated = reconcileQuotes(['600000'], previous, [incomplete])
    expect(updated['600000']).toEqual({
      quote: previous['600000'].quote,
      failed: true,
    })
    const first = reconcileQuotes(['600000'], {}, [incomplete])
    expect(first['600000'].quote?.name).toBe('公司600000')
    expect(first['600000'].failed).toBe(true)
  },
)
