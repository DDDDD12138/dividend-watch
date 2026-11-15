import type {
  AnnualDividend,
  Quote,
  QuoteItem,
  YearEndPrice,
} from '../../../shared/api'
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
  return annualYieldAtPrice(summary, isUsableQuote(quote) ? quote.price : null)
}

export function annualYieldAtPrice(
  summary: AnnualDividend | undefined,
  price: string | null,
  unavailableReason = '行情暂不可用',
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
  else if (price === null) reason = unavailableReason
  if (reason) return { label: '—', reason }
  return {
    label: percent(calculateReferenceYield(summary!.implementedTotal, price)!),
    reason: null,
  }
}

export type YieldBasis = 'current' | 'yearEnd'
export interface AnnualYieldValue {
  label: string
  reason: string | null
  price: string | null
  tradeDate?: string | null
}

const yearEndIssueReasons = [
  ['INVALID_YEAR_END_PRICE', '历史行情数据格式异常'],
  ['YEAR_END_PRICE_UNAVAILABLE', '历史行情请求失败，请刷新重试'],
  ['NO_YEAR_END_PRICE', '来源未返回该年的交易记录'],
] as const

function yearEndReason(
  historical: YearEndPrice | undefined,
  loading: boolean,
  failed: boolean,
) {
  const known = yearEndIssueReasons.find(([code]) =>
    historical?.issues.some((issue) => issue.code === code),
  )
  if (known) return known[1]
  if (loading) return '历史行情加载中…'
  if (failed) return '历史行情请求失败，请刷新重试'
  return '该年年末价格暂不可用'
}

export interface YearEndPriceState {
  prices: ReadonlyMap<number, YearEndPrice>
  loading?: boolean
  failures?: ReadonlySet<number>
}

/**
 * One value per summary year plus any extra chart `years`, so years without a
 * dividend summary still report the price they would be measured against.
 */
export function annualYieldValues(
  summaries: AnnualDividend[],
  basis: YieldBasis,
  quote: Quote | null,
  { prices, loading = false, failures }: YearEndPriceState,
  years: number[] = [],
): Map<number, AnnualYieldValue> {
  const byYear = new Map(
    summaries.map((summary) => [summary.fiscalYear, summary]),
  )
  const current = isUsableQuote(quote) ? quote.price : null
  return new Map(
    [...new Set([...byYear.keys(), ...years])].map((year) => {
      const summary = byYear.get(year)
      if (basis === 'current')
        return [
          year,
          { ...annualYieldAtPrice(summary, current), price: current },
        ]
      const historical = prices.get(year)
      const price = historical?.issues.length === 0 ? historical.price : null
      return [
        year,
        {
          ...annualYieldAtPrice(
            summary,
            price,
            yearEndReason(historical, loading, failures?.has(year) ?? false),
          ),
          price,
          tradeDate: historical?.tradeDate,
        },
      ]
    }),
  )
}
