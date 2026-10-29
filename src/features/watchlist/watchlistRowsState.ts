import {
  reconcileOrder,
  resolveOrder,
  sameOrder,
  type StockRowResult,
} from './order'

export interface WatchlistRowResult extends StockRowResult {
  name: string
}

export interface WatchlistRowsState {
  codes: string[]
  revision: number
  results: Record<string, WatchlistRowResult>
  order: string[]
  loading: boolean
  error: string
}

export type WatchlistRowsAction =
  | { type: 'sync'; codes: string[]; revision: number }
  | { type: 'result'; code: string; result: WatchlistRowResult }
  | { type: 'saved'; error: string }

export function watchlistRowsReducer(
  state: WatchlistRowsState,
  action: WatchlistRowsAction,
): WatchlistRowsState {
  if (action.type === 'saved')
    return state.error === action.error
      ? state
      : { ...state, error: action.error }

  if (action.type === 'sync') {
    // Keep the values currently displayed by the rows during a refresh.
    // resolveOrder still waits for every result to carry the new revision.
    const results = Object.fromEntries(
      Object.entries(state.results).filter(([code]) =>
        action.codes.includes(code),
      ),
    )
    const reconciled = reconcileOrder(state.order, action.codes)
    const order = sameOrder(reconciled, state.order) ? state.order : reconciled
    return {
      ...state,
      codes: action.codes,
      revision: action.revision,
      results,
      ...resolveOrder(order, results, action.revision),
    }
  }

  // A row may report after membership or refresh has changed. Its result must
  // never replace the current membership with the order from an older render.
  if (
    !state.codes.includes(action.code) ||
    action.result.revision !== state.revision
  )
    return state
  const results = { ...state.results, [action.code]: action.result }
  return {
    ...state,
    results,
    ...resolveOrder(state.order, results, state.revision),
  }
}
