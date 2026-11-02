import type { EastmoneyDividend, Issue, StockIdentity } from '../../shared/api'
import { InvalidAmount, decimal, perShare, units } from '../../shared/money'
import { date, fingerprint, object, type Fetcher } from './http'
import { SourceDataError } from './errors'
import { fetchEastmoneyPages } from './eastmoney-pagination'
export const eastmoneyUrl =
  'https://datacenter-web.eastmoney.com/api/data/v1/get'
export interface EastmoneyResult {
  records: EastmoneyDividend[]
  fetchedAt: string
  pagesRead: number
  fetchedRecords: number
  completeFetch: boolean
  issues: Issue[]
}
function amount(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string' && typeof raw !== 'number')
    throw new SourceDataError('eastmoney', 'Invalid amount')
  let value = String(raw)
  if (typeof raw === 'number' && /e/i.test(value)) {
    value = raw.toFixed(8)
    if (Number(value) !== raw)
      throw new SourceDataError('eastmoney', 'Excess precision')
  }
  return decimal(units(value))
}
function optionalText(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string')
    throw new SourceDataError('eastmoney', 'Invalid text')
  return raw.trim() || null
}
export async function normalizeRecord(
  identity: StockIdentity,
  value: unknown,
): Promise<EastmoneyDividend> {
  const { code, market } = identity
  const raw = object(value, 'eastmoney')
  if (raw.SECURITY_CODE !== code || raw.SECUCODE !== `${code}.${market}`)
    throw new SourceDataError('eastmoney', 'Invalid stock identity')
  const recordId = await fingerprint(raw),
    issues: Issue[] = []
  function read<T>(
    field: string,
    parser: (value: unknown) => T | null,
    required = false,
  ): T | null {
    try {
      const result = parser(raw[field])
      if (required && result === null)
        issues.push({ code: 'MISSING_FIELD', field, recordId })
      return result
    } catch (error) {
      if (
        !(error instanceof SourceDataError) &&
        !(error instanceof InvalidAmount)
      )
        throw error
      issues.push({ code: 'INVALID_FIELD', field, recordId })
      return null
    }
  }
  const parseDate = (value: unknown) => date(value, 'eastmoney')
  const reportDate = read('REPORT_DATE', parseDate, true)
  const progress = read('ASSIGN_PROGRESS', optionalText, true)
  const cashPerTenShares = read('PRETAX_BONUS_RMB', amount, true)
  let cashPerShare: string | null = null
  if (cashPerTenShares !== null) {
    try {
      cashPerShare = perShare(cashPerTenShares)
    } catch (error) {
      if (!(error instanceof InvalidAmount)) throw error
      issues.push({
        code: 'INVALID_FIELD',
        field: 'PRETAX_BONUS_RMB',
        recordId,
      })
    }
  }
  return {
    recordId,
    code,
    reportDate,
    fiscalYear: reportDate ? +reportDate.slice(0, 4) : null,
    sourceName: read('SECURITY_NAME_ABBR', optionalText),
    progress,
    cashPerTenShares,
    cashPerShare,
    planNoticeDate: read('PLAN_NOTICE_DATE', parseDate),
    latestNoticeDate: read('NOTICE_DATE', parseDate),
    recordDate: read('EQUITY_RECORD_DATE', parseDate),
    exDate: read('EX_DIVIDEND_DATE', parseDate),
    payDate: null,
    announcementUrl: null,
    bonusRatio: read('BONUS_RATIO', amount),
    transferRatio: read('IT_RATIO', amount),
    description: read('IMPL_PLAN_PROFILE', optionalText),
    issues,
    raw,
  }
}
export async function fetchDividends(
  fetcher: Fetcher,
  identity: StockIdentity,
  now: Date,
): Promise<EastmoneyResult> {
  const { code, market } = identity
  const page = await fetchEastmoneyPages(
    fetcher,
    eastmoneyUrl,
    {
      reportName: 'RPT_SHAREBONUS_DET',
      columns: 'ALL',
      source: 'WEB',
      client: 'WEB',
      filter: `(SECUCODE="${code}.${market}")`,
    },
    now,
  )
  const { rows: rawRows, issues, pagesRead, fetchedRecords, fetchedAt } = page
  let { completeFetch } = page
  const records: EastmoneyDividend[] = [],
    seen = new Set<string>()
  for (const raw of rawRows) {
    try {
      const row = await normalizeRecord(identity, raw)
      if (seen.has(row.recordId)) continue
      seen.add(row.recordId)
      records.push(row)
    } catch (error) {
      if (!(error instanceof SourceDataError)) throw error
      issues.push({ code: 'INVALID_RECORD_IDENTITY' })
      completeFetch = false
    }
  }
  // An unassignable record might belong to any fiscal year: don't silently omit it.
  if (records.some((row) => row.fiscalYear === null)) {
    completeFetch = false
    issues.push({ code: 'UNASSIGNED_REPORT_PERIOD' })
  }
  return {
    records,
    fetchedAt,
    pagesRead,
    fetchedRecords,
    completeFetch,
    issues,
  }
}
