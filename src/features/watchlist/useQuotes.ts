import { useEffect, useRef, useState } from 'react'
import type { ApiResponse, QuoteItem } from '../../../shared/api'
import { request, requestError } from '../../data/api'
import { reconcileQuotes, type WatchlistQuote } from './quotes'

interface QuoteState extends WatchlistQuote {
  error?: string
  fetchedAt?: string
  revision: number
}

export function useQuotes(codes: string[], revision: number) {
  const key = codes.join(',')
  const [snapshot, setSnapshot] = useState<{
    key: string
    items: Record<string, QuoteState>
  }>({ key, items: {} })
  if (snapshot.key !== key) {
    const wanted = new Set(codes)
    setSnapshot({
      key,
      items: Object.fromEntries(
        Object.entries(snapshot.items).filter(([code]) => wanted.has(code)),
      ),
    })
  }
  // Entries remain after completion so membership changes only request new codes.
  const owners = useRef(new Map<string, AbortController>())
  const lastRevision = useRef(revision)

  useEffect(() => {
    const requests = owners.current
    return () => {
      for (const controller of new Set(requests.values())) controller.abort()
      requests.clear()
    }
  }, [])

  useEffect(() => {
    const currentCodes = key ? key.split(',') : []
    const wanted = new Set(currentCodes)
    const requests = owners.current
    const previousControllers = new Set(requests.values())
    if (lastRevision.current !== revision) {
      requests.clear()
      lastRevision.current = revision
    }
    for (const code of requests.keys()) {
      if (!wanted.has(code)) requests.delete(code)
    }
    const retainedControllers = new Set(requests.values())
    for (const controller of previousControllers) {
      if (!retainedControllers.has(controller)) controller.abort()
    }
    const added = currentCodes.filter((code) => !requests.has(code))
    if (!added.length) return

    const controller = new AbortController()
    for (const code of added) requests.set(code, controller)

    function settle(response?: ApiResponse<QuoteItem[]>, error?: string) {
      if (controller.signal.aborted) return
      setSnapshot((previous) => {
        const activeCodes = added.filter(
          (code) =>
            previous.key.split(',').includes(code) &&
            requests.get(code) === controller,
        )
        if (!activeCodes.length) return previous
        const updated = response
          ? reconcileQuotes(activeCodes, previous.items, response.data)
          : {}
        const next = { ...previous.items }
        for (const code of activeCodes) {
          next[code] = {
            ...(updated[code] ?? {
              quote: previous.items[code]?.quote ?? null,
              failed: true,
            }),
            fetchedAt:
              response?.meta.fetchedAt ?? previous.items[code]?.fetchedAt,
            error,
            revision,
          }
        }
        return { ...previous, items: next }
      })
    }
    void request<QuoteItem[]>(
      `/api/quotes?codes=${added.join(',')}`,
      controller.signal,
    ).then(
      (response) => settle(response),
      (error: unknown) => settle(undefined, requestError(error)),
    )
  }, [key, revision])

  const items = Object.fromEntries(
    codes.map((code) => {
      const item = snapshot.items[code]
      return [
        code,
        {
          quote: item?.quote ?? null,
          failed: item?.failed ?? false,
          fetchedAt: item?.fetchedAt,
          loading: !item || item.revision !== revision,
          error: item?.revision === revision ? item.error : undefined,
        },
      ]
    }),
  )
  const values = Object.values(items)
  return {
    items,
    loading: values.some((item) => item.loading),
    error: values.find((item) => item.error)?.error,
    fetchedAt: values
      .flatMap((item) => (item.fetchedAt ? [item.fetchedAt] : []))
      .sort()
      .at(-1),
  }
}
