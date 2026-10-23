import type { AnnualAllocation, Issue, StockIdentity } from '../../shared/api'
import { decimal, units } from '../../shared/money'
import { date, object, request, type Fetcher } from './http'

export const allocationUrl =
  'https://datacenter.eastmoney.com/securities/api/data/v1/get'

function amount(value: unknown, signed: boolean): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new Error('Invalid amount')
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw new Error('Unsafe amount')
  const text = String(value)
  const negative = text.startsWith('-')
  if (negative && !signed) throw new Error('Negative dividend')
  const parsed = units(negative ? text.slice(1) : text)
  return `${negative && parsed !== 0n ? '-' : ''}${decimal(parsed)}`
}

export function normalizeAllocation(
  identity: StockIdentity,
  value: unknown,
): AnnualAllocation {
  const raw = object(value)
  if (
    raw.SECUCODE !== `${identity.code}.${identity.market}` ||
    raw.SECURITY_CODE !== identity.code
  )
    throw new Error('Invalid stock identity')
  const reportDate = date(raw.REPORT_DATE)
  if (!reportDate?.endsWith('-12-31')) throw new Error('Invalid annual period')
  const issues: Issue[] = []
  function read(field: string, signed = false) {
    try {
      const result = amount(raw[field], signed)
      if (result === null)
        issues.push({ code: 'MISSING_FIELD', field, recordId: reportDate! })
      return result
    } catch {
      issues.push({ code: 'INVALID_FIELD', field, recordId: reportDate! })
      return null
    }
  }
  return {
    fiscalYear: Number(reportDate.slice(0, 4)),
    netProfit: read('PARENTNETPROFIT', true),
    // DIVIDEND_IMPLE is an amount in CNY; DIVIDEND_PAY_IMPLE is a percentage.
    // PLAN fields include proposals and must not replace implemented amounts.
    cashDividend: read('DIVIDEND_IMPLE'),
    issues,
  }
}

export async function fetchAllocations(
  fetcher: Fetcher,
  identity: StockIdentity,
  now: Date,
) {
  const rows: unknown[] = [],
    issues: Issue[] = []
  let pages = 1,
    count: number | null = null,
    pagesRead = 0,
    completeFetch = true
  const budget = AbortSignal.timeout(20_000)
  for (let page = 1; page <= pages; page++) {
    try {
      if (page > 20) throw new Error('Pagination limit')
      const url = new URL(allocationUrl)
      url.search = new URLSearchParams({
        reportName: 'RPT_F10_DIVIDEND_HISTOGRAM',
        columns:
          'SECUCODE,SECURITY_CODE,REPORT_DATE,PARENTNETPROFIT,DIVIDEND_IMPLE',
        filter: `(SECUCODE="${identity.code}.${identity.market}")`,
        pageNumber: String(page),
        pageSize: '100',
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        source: 'HSF10',
        client: 'PC',
      }).toString()
      const response = await request(fetcher, url, budget, 10_000)
      const body = object(await response.json())
      if (
        page === 1 &&
        body.success === false &&
        body.code === 9201 &&
        body.result === null
      ) {
        count = 0
        pagesRead++
        break
      }
      if (body.success !== true) throw new Error('Source rejected request')
      const result = object(body.result)
      if (
        !Array.isArray(result.data) ||
        !Number.isInteger(result.pages) ||
        Number(result.pages) < 0 ||
        !Number.isInteger(result.count) ||
        Number(result.count) < 0 ||
        (result.pages === 0 && Number(result.count) > 0)
      )
        throw new Error('Invalid pagination')
      if (page === 1) {
        pages = Number(result.pages)
        count = Number(result.count)
      } else if (pages !== result.pages || count !== result.count)
        throw new Error('Changing pagination')
      pagesRead++
      rows.push(...result.data)
      if (!result.data.length && count !== 0)
        throw new Error('Empty non-final page')
    } catch {
      if (!pagesRead) throw new Error('Annual statistics unavailable')
      completeFetch = false
      issues.push({ code: 'INCOMPLETE_PAGINATION' })
      break
    }
  }
  if (count !== rows.length) {
    completeFetch = false
    issues.push({ code: 'COUNT_MISMATCH' })
  }
  const byYear = new Map<number, AnnualAllocation>()
  const conflicts = new Set<number>()
  for (const row of rows) {
    try {
      const item = normalizeAllocation(identity, row)
      const previous = byYear.get(item.fiscalYear)
      if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
        conflicts.add(item.fiscalYear)
        completeFetch = false
        issues.push({
          code: 'CONFLICTING_ANNUAL_RECORDS',
          recordId: String(item.fiscalYear),
        })
      } else byYear.set(item.fiscalYear, item)
    } catch {
      completeFetch = false
      issues.push({ code: 'INVALID_ANNUAL_RECORD' })
    }
  }
  // The source provides no revision discriminator; conflicting years stay unknown.
  for (const year of conflicts) byYear.delete(year)
  return {
    years: [...byYear.values()].sort((a, b) => b.fiscalYear - a.fiscalYear),
    fetchedAt: now.toISOString(),
    issues,
    coverage: {
      fetchedRecords: rows.length,
      returnedRecords: byYear.size,
      pagesRead,
      completeFetch,
    },
  }
}
