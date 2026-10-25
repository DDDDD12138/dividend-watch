import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reconcileOrder,
  resolveOrder,
  type StockRowResult,
} from '../src/features/watchlist/order'
import {
  readYieldOrder,
  writeYieldOrder,
  YIELD_ORDER_KEY,
} from '../src/features/watchlist/orderStorage'

const codes = ['601939', '601398', '601988']
const order = [...codes].reverse()
const settled = (value: string | undefined): StockRowResult => ({
  revision: 1,
  loading: false,
  yield: value,
})
const unavailable = settled(undefined)

describe('ranking a completed refresh', () => {
  it.each([
    {},
    { '601939': settled('0.09') },
    {
      '601939': settled('0.09'),
      '601398': unavailable,
      '601988': { revision: 1, loading: true, yield: '0.06' },
    },
    {
      '601939': settled('0.09'),
      '601398': settled('0.05'),
      '601988': { revision: 0, loading: false, yield: '0.06' },
    },
  ] satisfies Partial<Record<string, StockRowResult>>[])(
    'waits for every company in the current refresh without changing order',
    (results) => {
      const result = resolveOrder(order, results, 1)
      expect(result.loading).toBe(true)
      expect(result.order).toBe(order)
    },
  )

  it('sorts all reported values, including retained values from failed refreshes', () => {
    expect(
      resolveOrder(
        order,
        {
          '601939': settled('0.09'),
          '601398': settled('0.05'),
          '601988': settled('0.06'),
        },
        1,
      ),
    ).toEqual({ loading: false, order: ['601939', '601988', '601398'] })
  })

  it('places genuinely unavailable values after valid values, including zero', () => {
    const result = resolveOrder(
      order,
      {
        '601939': settled('0.06'),
        '601398': settled('0'),
        '601988': settled(undefined),
      },
      1,
    )
    expect(result).toEqual({ loading: false, order: codes })
  })

  it('keeps the existing order for equal yields and when all values are unknown', () => {
    for (const value of ['0.05', undefined]) {
      const result = resolveOrder(
        order,
        Object.fromEntries(codes.map((code) => [code, settled(value)])),
        1,
      )
      expect(result.loading).toBe(false)
      expect(result.order).toBe(order)
    }
  })

  it('preserves the relative order of unknown companies', () => {
    expect(
      resolveOrder(
        order,
        {
          '601939': settled('0.04'),
          '601398': settled(undefined),
          '601988': settled(undefined),
        },
        1,
      ).order,
    ).toEqual(['601939', '601988', '601398'])
  })

  it('immediately settles and sorts the remaining companies when a pending company is removed', () => {
    const results: Record<string, StockRowResult> = {
      '601939': settled('0.09'),
      '601398': settled('0.05'),
      '601988': { revision: 1, loading: true, yield: undefined },
    }
    expect(resolveOrder(order, results, 1).loading).toBe(true)
    const remaining = reconcileOrder(order, ['601939', '601398'])
    expect(resolveOrder(remaining, results, 1)).toEqual({
      loading: false,
      order: ['601939', '601398'],
    })
    expect(resolveOrder([], results, 1)).toEqual({ loading: false, order: [] })
    expect(resolveOrder([...remaining, '600000'], results, 1).loading).toBe(
      true,
    )
  })

  it('excludes removed companies and appends newly followed companies', () => {
    expect(reconcileOrder(['601988', '600000', '601939'], codes)).toEqual([
      '601988',
      '601939',
      '601398',
    ])
    expect(reconcileOrder(order, [])).toEqual([])
    expect(
      resolveOrder(
        ['601939'],
        {
          '601939': settled('0.1'),
          '601988': unavailable,
        },
        1,
      ).order,
    ).toEqual(['601939'])
  })
})

describe('order persistence', () => {
  const stored = new Map<string, string>()
  const setItem = vi.fn((key: string, value: string) => stored.set(key, value))
  beforeEach(() => {
    stored.clear()
    setItem.mockClear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem,
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads and normalizes the saved sequence without writing', () => {
    expect(readYieldOrder(codes)).toEqual({ order: codes, error: '' })
    stored.set(YIELD_ORDER_KEY, '["601988","600000","601939"]')
    expect(readYieldOrder(codes)).toEqual({
      order: ['601988', '601939', '601398'],
      error: '',
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('saves only codes, skips identical writes and supports clearing', () => {
    expect(writeYieldOrder(order)).toBe('')
    expect(writeYieldOrder([...order])).toBe('')
    expect(setItem).toHaveBeenCalledTimes(1)
    expect([...stored.entries()]).toEqual([
      [YIELD_ORDER_KEY, JSON.stringify(order)],
    ])
    expect(readYieldOrder(codes).order).toEqual(order)
    writeYieldOrder([])
    expect(readYieldOrder(codes).order).toEqual(codes)
  })

  it.each([
    'invalid',
    'null',
    '{}',
    '[601939]',
    '["601939","601939"]',
    '["bad"]',
  ])('reports invalid storage without rewriting it: %s', (text) => {
    stored.set(YIELD_ORDER_KEY, text)
    expect(readYieldOrder(codes)).toEqual({
      order: codes,
      error: '排序记录读取失败',
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('reports unavailable storage without interrupting the page', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('Denied')
      },
    })
    expect(readYieldOrder(codes)).toEqual({
      order: codes,
      error: '排序记录读取失败',
    })
    expect(writeYieldOrder(order)).toBe('排序记录保存失败')
  })

  it('can save the same ranking after a previous write failure', () => {
    setItem.mockImplementationOnce(() => {
      throw new Error('Quota exceeded')
    })
    expect(writeYieldOrder(order)).toBe('排序记录保存失败')
    expect(writeYieldOrder(order)).toBe('')
    expect(readYieldOrder(codes).order).toEqual(order)
  })
})
