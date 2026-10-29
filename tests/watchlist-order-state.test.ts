import { describe, expect, it } from 'vitest'
import {
  watchlistRowsReducer as reduce,
  type WatchlistRowsState,
} from '../src/features/watchlist/watchlistRowsState'

const result = (value: string, revision = 0) => ({
  name: '测试公司',
  revision,
  loading: false,
  yield: value,
})
function initial(): WatchlistRowsState {
  return {
    codes: ['600001', '600002'],
    order: ['600001', '600002'],
    revision: 0,
    results: { '600001': result('0.05'), '600002': result('0.04') },
    loading: false,
    error: '',
  }
}

describe('ranking updates use current list membership', () => {
  it('does not restore a removed company when an old row reports afterward', () => {
    const removed = reduce(initial(), {
      type: 'sync',
      codes: ['600002'],
      revision: 0,
    })
    const late = reduce(removed, {
      type: 'result',
      code: '600001',
      result: result('0.09'),
    })
    expect(late).toBe(removed)
    const updated = reduce(late, {
      type: 'result',
      code: '600002',
      result: result('0.06'),
    })
    expect(updated.order).toEqual(['600002'])
    expect(Object.keys(updated.results)).toEqual(['600002'])
    expect(updated.loading).toBe(false)
  })

  it('keeps a newly added company when an existing row reports', () => {
    const added = reduce(initial(), {
      type: 'sync',
      codes: ['600001', '600002', '600003'],
      revision: 0,
    })
    const pending = reduce(added, {
      type: 'result',
      code: '600001',
      result: result('0.08'),
    })
    expect(pending.order).toEqual(['600001', '600002', '600003'])
    expect(pending.loading).toBe(true)
    const completed = reduce(pending, {
      type: 'result',
      code: '600003',
      result: result('0.1'),
    })
    expect(completed.order).toEqual(['600003', '600001', '600002'])
    expect(completed.loading).toBe(false)
  })

  it('keeps visible row values but rejects late results from previous refreshes', () => {
    const refreshed = reduce(initial(), {
      type: 'sync',
      codes: ['600001', '600002'],
      revision: 1,
    })
    expect(refreshed.results).toEqual(initial().results)
    expect(refreshed.order).toEqual(initial().order)
    expect(refreshed.loading).toBe(true)
    expect(
      reduce(refreshed, {
        type: 'result',
        code: '600001',
        result: result('0.1'),
      }),
    ).toBe(refreshed)
  })

  it('clears removed results and waits for a re-added company', () => {
    let state = initial()
    for (let i = 0; i < 100; i++) {
      state = reduce(state, { type: 'sync', codes: ['600002'], revision: 0 })
      state = reduce(state, {
        type: 'result',
        code: '600001',
        result: result('0.5'),
      })
      expect(state.order).toEqual(['600002'])
      state = reduce(state, {
        type: 'sync',
        codes: ['600002', '600001'],
        revision: 0,
      })
      expect(state.loading).toBe(true)
      expect(state.results['600001']).toBeUndefined()
      state = reduce(state, {
        type: 'result',
        code: '600001',
        result: result('0.05'),
      })
      expect(state.order).toEqual(['600001', '600002'])
      expect(state.loading).toBe(false)
    }
  })

  it('preserves sorting when only the input array identity changes', () => {
    const state = initial()
    expect(
      reduce(state, { type: 'sync', codes: [...state.codes], revision: 0 })
        .order,
    ).toBe(state.order)
  })
})
