import { useCallback, useEffect, useReducer } from 'react'
import type { StockRowResult } from './order'
import { readYieldOrder, writeYieldOrder } from './orderStorage'
import { watchlistOrderReducer } from './watchlistOrderState'

export function useWatchlistOrder(codes: string[], revision: number) {
  const [state, dispatch] = useReducer(
    watchlistOrderReducer,
    { codes, revision },
    ({ codes, revision }) => ({
      ...readYieldOrder(codes),
      codes,
      revision,
      results: {},
      loading: codes.length > 0,
    }),
  )
  let current = state
  if (state.codes !== codes || state.revision !== revision) {
    const action = { type: 'sync', codes, revision } as const
    current = watchlistOrderReducer(state, action)
    dispatch(action)
  }

  const onResult = useCallback((code: string, result: StockRowResult) => {
    dispatch({ type: 'result', code, result })
  }, [])

  // Persist only a committed ranking, never an order captured by an old callback.
  useEffect(() => {
    if (!current.loading)
      dispatch({ type: 'saved', error: writeYieldOrder(current.order) })
  }, [current.order, current.loading])

  return {
    order: current.order,
    loading: current.loading,
    error: current.error,
    onResult,
  }
}
