import type { DividendHistory } from '../../../shared/api'
import { request, useResource } from '../../data/api'
import { createRequestQueue } from '../../data/requestQueue'

// Only background list requests share this limit; open company views load directly.
const queue = createRequestQueue(4)
const load = (path: string, signal: AbortSignal) =>
  queue(() => request<DividendHistory>(path, signal), signal)

export function useWatchlistDividends(code: string, revision: number) {
  return useResource<DividendHistory>(
    `/api/companies/${code}/dividends`,
    revision,
    load,
  )
}
