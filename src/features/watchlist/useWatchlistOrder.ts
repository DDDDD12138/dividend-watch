import { useCallback, useRef, useState } from 'react'
import { reconcileOrder, resolveOrder, type StockRowResult } from './order'
import { readYieldOrder, writeYieldOrder } from './orderStorage'

export function useWatchlistOrder(codes: string[], revision: number) {
  const results = useRef<Record<string, StockRowResult>>({})
  const [state, setState] = useState(() => ({
    ...readYieldOrder(codes),
    loading: codes.length > 0,
  }))

  const onResult = useCallback(
    (code: string, result: StockRowResult) => {
      if (!codes.includes(code) || result.revision !== revision) return
      results.current[code] = result
      const next = resolveOrder(state.order, results.current, revision)
      const error = next.loading ? undefined : writeYieldOrder(next.order)
      setState((previous) => {
        const storageError = error ?? previous.error
        return next.order === previous.order &&
          next.loading === previous.loading &&
          storageError === previous.error
          ? previous
          : { ...next, error: storageError }
      })
    },
    [codes, revision, state.order],
  )

  function changeCompanies(nextCodes: string[]) {
    results.current = Object.fromEntries(
      Object.entries(results.current).filter(([code]) =>
        nextCodes.includes(code),
      ),
    )
    const next = resolveOrder(
      reconcileOrder(state.order, nextCodes),
      results.current,
      revision,
    )
    setState({
      ...next,
      error: writeYieldOrder(next.order),
    })
  }

  return { ...state, onResult, changeCompanies }
}
