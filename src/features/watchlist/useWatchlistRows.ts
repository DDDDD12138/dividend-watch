import { useCallback, useEffect, useReducer } from 'react'
import type {
  WatchlistRowResult,
  WatchlistRowsState,
} from './watchlistRowsState'
import { readYieldOrder, writeYieldOrder } from './orderStorage'
import { watchlistRowsReducer } from './watchlistRowsState'

export function useWatchlistRows(codes: string[], revision: number) {
  const [state, dispatch] = useReducer(
    watchlistRowsReducer,
    { codes, revision },
    ({ codes, revision }): WatchlistRowsState => ({
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
    current = watchlistRowsReducer(state, action)
    dispatch(action)
  }

  const onResult = useCallback((code: string, result: WatchlistRowResult) => {
    dispatch({ type: 'result', code, result })
  }, [])

  // Persist only a committed ranking, never an order captured by an old callback.
  useEffect(() => {
    if (!current.loading)
      dispatch({ type: 'saved', error: writeYieldOrder(current.order) })
  }, [current.order, current.loading])

  return {
    results: current.results,
    order: current.order,
    loading: current.loading,
    error: current.error,
    onResult,
  }
}
