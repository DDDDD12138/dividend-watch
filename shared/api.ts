export type ApiErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_CODES'
  | 'INVALID_CODE'
  | 'UNSUPPORTED_COMPANY'
  | 'NOT_FOUND'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR'
export interface ApiError {
  code: ApiErrorCode
}
export interface ApiFailure {
  error: ApiError
}
export type QuoteErrorCode =
  | 'UNSUPPORTED_COMPANY'
  | 'COMPANY_UNAVAILABLE'
  | 'QUOTE_UNAVAILABLE'
  | 'INVALID_QUOTE'
export interface Issue {
  code: string
  field?: string
  recordId?: string
}
export type DataSource = 'tencent' | 'eastmoney'
export interface Meta {
  source: DataSource
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
export interface CompanyProfile {
  company: Company
  /** Listing date for this security's market, not another share class. */
  listingDate: string | null
  mainBusiness: string | null
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
  error: { code: QuoteErrorCode } | null
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
export interface DividendNotice {
  code: 'SHARE_BASIS_CHANGED' | 'INVALID_SHARE_RATIO'
}
export interface AnnualDividend {
  fiscalYear: number
  implementedTotal: string | null
  implementedRecordCount: number
  calculationIssues: Issue[]
  /** Informational notices that do not block cash calculations. */
  notices: DividendNotice[]
}
export interface DividendHistory {
  company: Company
  code: string
  source: 'eastmoney'
  sourceUrl: string
  records: EastmoneyDividend[]
  annualSummaries: AnnualDividend[]
  referenceDividend: {
    /** Always the previous Shanghai calendar year, even when its amount is unavailable. */
    fiscalYear: number
    cashPerShare: string | null
    basis: 'eastmoney_implemented_sum'
    issues: Issue[]
    notices: DividendNotice[]
  }
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
  /** Previous Shanghai calendar year at response time, independent of cached source data. */
  lastEndedYear: number
  years: AnnualAllocation[]
  coverage: {
    fetchedRecords: number
    returnedRecords: number
    pagesRead: number
    completeFetch: boolean
  }
}
/** Follow limit, and the most codes one `/api/quotes` request may carry. */
export const MAX_WATCHLIST_SIZE = 50
