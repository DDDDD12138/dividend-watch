import type { AnnualDividend, Quote, QuoteItem } from '../../../shared/api'
import { calculateReferenceYield } from '../../../shared/money'
import { request } from '../../data/api'
import { percent } from '../../lib/format'
import { isUsableQuote } from '../watchlist/quotes'
import { issueText } from './model'

// Treat per-company failures like request failures so useResource retains only
// the last successful quote for this exact URL, including its original time.
export async function requestDividendQuote(path: string, signal: AbortSignal) {
  const code = new URL(path, 'https://local.invalid').searchParams.get('codes')
  const response = await request<QuoteItem[]>(path, signal)
  const item = response.data.find((item) => item.code === code)
  const quote = item?.quote
  if (
    item?.error ||
    !isUsableQuote(quote) ||
    quote.code !== code ||
    !Number.isFinite(Date.parse(quote.quoteTime))
  )
    throw new Error('行情暂不可用')
  try {
    calculateReferenceYield('0', quote.price)
  } catch {
    throw new Error('行情暂不可用')
  }
  return { ...response, data: quote }
}

export function annualReferenceYield(
  summary: AnnualDividend | undefined,
  quote: Quote | null,
) {
  const issues = summary?.calculationIssues ?? []
  let reason: string | null = null
  if (issues.length)
    reason = issues
      .map((issue) =>
        issue.code === 'NO_IMPLEMENTED_YEAR_END_REPORT'
          ? '未取得该财年年报分红实施记录'
          : issueText(issue),
      )
      .join('；')
  else if (summary?.implementedTotal == null) reason = '年度分红金额暂不可用'
  else if (!isUsableQuote(quote)) reason = '行情暂不可用'
  if (reason) return { label: '—', reason }
  return {
    label: percent(
      calculateReferenceYield(summary!.implementedTotal, quote!.price)!,
    ),
    reason: null,
  }
}
