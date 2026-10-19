import type { EastmoneyDividend, Issue } from '../../shared/api'
import { decimal, perShare, units } from '../../shared/money'
import { date, fingerprint, object, request, type Fetcher } from './http'
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
    throw new Error('Invalid amount')
  let value = String(raw)
  if (typeof raw === 'number' && /e/i.test(value)) {
    value = raw.toFixed(8)
    if (Number(value) !== raw) throw new Error('Excess precision')
  }
  return decimal(units(value))
}
function optionalText(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') throw new Error('Invalid text')
  return raw.trim() || null
}
export async function normalizeRecord(
  code: string,
  value: unknown,
): Promise<EastmoneyDividend> {
  const raw = object(value)
  if (raw.SECURITY_CODE !== code || raw.SECUCODE !== `${code}.SH`)
    throw new Error('Invalid stock identity')
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
    } catch {
      issues.push({ code: 'INVALID_FIELD', field, recordId })
      return null
    }
  }
  const reportDate = read('REPORT_DATE', date, true)
  const progress = read('ASSIGN_PROGRESS', optionalText, true)
  const cashPerTenShares = read('PRETAX_BONUS_RMB', amount, true)
  let cashPerShare: string | null = null
  if (cashPerTenShares !== null) {
    try {
      cashPerShare = perShare(cashPerTenShares)
    } catch {
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
    planNoticeDate: read('PLAN_NOTICE_DATE', date),
    latestNoticeDate: read('NOTICE_DATE', date),
    recordDate: read('EQUITY_RECORD_DATE', date),
    exDate: read('EX_DIVIDEND_DATE', date),
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
  code: string,
  now: Date,
): Promise<EastmoneyResult> {
  const rawRows: unknown[] = [],
    issues: Issue[] = []
  let pagesRead = 0,
    pages = 1,
    count: number | null = null,
    completeFetch = true
  const budget = AbortSignal.timeout(20_000)
  for (let page = 1; page <= pages; page++) {
    try {
      if (page > 20) throw new Error('Pagination limit')
      const url = new URL(eastmoneyUrl)
      url.search = new URLSearchParams({
        reportName: 'RPT_SHAREBONUS_DET',
        columns: 'ALL',
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        pageSize: '100',
        pageNumber: String(page),
        source: 'WEB',
        client: 'WEB',
        filter: `(SECURITY_CODE="${code}")`,
      }).toString()
      const response = await request(fetcher, url, budget, 10_000)
      const body = object(await response.json())
      if (body.success !== true) throw new Error('Source rejected request')
      const result = object(body.result)
      if (
        !Array.isArray(result.data) ||
        !Number.isInteger(result.pages) ||
        Number(result.pages) < 0 ||
        !Number.isInteger(result.count) ||
        Number(result.count) < 0
      )
        throw new Error('Invalid pagination')
      if (page === 1) {
        pages = Number(result.pages)
        count = Number(result.count)
      } else if (pages !== result.pages || count !== result.count)
        throw new Error('Changing pagination')
      pagesRead++
      rawRows.push(...result.data)
      if (result.data.length === 0 && count !== 0)
        throw new Error('Empty non-final page')
    } catch (error) {
      if (pagesRead === 0) throw error
      completeFetch = false
      issues.push({ code: 'INCOMPLETE_PAGINATION' })
      break
    }
  }
  if (count !== rawRows.length) {
    completeFetch = false
    issues.push({ code: 'COUNT_MISMATCH' })
  }
  const records: EastmoneyDividend[] = [],
    seen = new Set<string>()
  for (const raw of rawRows) {
    try {
      const row = await normalizeRecord(code, raw)
      if (seen.has(row.recordId)) continue
      seen.add(row.recordId)
      records.push(row)
    } catch {
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
    fetchedAt: now.toISOString(),
    pagesRead,
    fetchedRecords: rawRows.length,
    completeFetch,
    issues,
  }
}
