export interface ApiError {
  code: string
  message: string
}
export interface Issue {
  code: string
  field?: string
  recordId?: string
}
export interface Meta {
  source: 'tencent' | 'eastmoney'
  fetchedAt: string
  cache: 'hit' | 'miss'
  issues: Issue[]
}
export interface ApiResponse<T> {
  data: T
  meta: Meta
}
export type Market = 'SH' | 'SZ' | 'BJ'
export interface StockIdentity {
  code: string
  market: Market
}
export interface Company extends StockIdentity {
  name: string
}
export interface Quote extends Company {
  price: string | null
  quoteTime: string | null
  currency: 'CNY'
  issues: Issue[]
}
export interface QuoteItem {
  code: string
  quote: Quote | null
  error: ApiError | null
}
/** Source progress value that marks a distribution as implemented; only these records count toward annual totals. */
export const EASTMONEY_IMPLEMENTED_PROGRESS = '实施分配'
/** Source-specific record. No invented scheme lifecycle or dividend kind. */
export interface EastmoneyDividend {
  recordId: string
  code: string
  sourceName: string | null
  reportDate: string | null
  fiscalYear: number | null
  progress: string | null
  cashPerTenShares: string | null
  cashPerShare: string | null
  planNoticeDate: string | null
  latestNoticeDate: string | null
  recordDate: string | null
  exDate: string | null
  payDate: null
  announcementUrl: null
  bonusRatio: string | null
  transferRatio: string | null
  description: string | null
  issues: Issue[]
  raw: Record<string, unknown>
}
export interface AnnualDividend {
  fiscalYear: number
  implementedTotal: string | null
  implementedRecordCount: number
  /** An application selection rule, not a source assertion of completeness. */
  referenceEligible: boolean
  calculationIssues: Issue[]
}
export interface DividendHistory {
  company: Company
  code: string
  source: 'eastmoney'
  sourceUrl: string
  records: EastmoneyDividend[]
  annualSummaries: AnnualDividend[]
  referenceDividend: {
    fiscalYear: number
    cashPerShare: string
    basis: 'eastmoney_implemented_sum'
  } | null
  coverage: {
    fetchedRecords: number
    returnedRecords: number
    pagesRead: number
    completeFetch: boolean
  }
}

/** Same-fiscal-year amounts from Eastmoney's annual dividend statistics, in CNY. */
export interface AnnualAllocation {
  fiscalYear: number
  netProfit: string | null
  cashDividend: string | null
  issues: Issue[]
}
export interface AllocationHistory {
  company: Company
  source: 'eastmoney'
  sourceUrl: string
  years: AnnualAllocation[]
  coverage: {
    fetchedRecords: number
    returnedRecords: number
    pagesRead: number
    completeFetch: boolean
  }
}
