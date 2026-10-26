import type { Quote, QuoteItem } from '../../../shared/api'

export interface WatchlistQuote {
  quote: Quote | null
  failed: boolean
}

export function isUsableQuote(
  quote: Quote | null | undefined,
): quote is Quote & { price: string; quoteTime: string } {
  return !!(quote?.price && quote.quoteTime)
}

// Retain data only for companies still followed, independently of batch URLs.
export function reconcileQuotes(
  codes: string[],
  previous: Record<string, WatchlistQuote>,
  incoming: QuoteItem[] = [],
): Record<string, WatchlistQuote> {
  const updates = new Map(incoming.map((item) => [item.code, item]))
  return Object.fromEntries(
    codes.flatMap((code) => {
      const item = updates.get(code)
      if (!item) return previous[code] ? [[code, previous[code]]] : []
      const last = previous[code]?.quote
      const usableIncoming = isUsableQuote(item.quote) ? item.quote : null
      const usableLast = isUsableQuote(last) ? last : null
      return [
        [
          code,
          {
            quote: usableIncoming ?? usableLast ?? item.quote ?? last ?? null,
            failed: !!item.error || !usableIncoming,
          },
        ],
      ]
    }),
  )
}
