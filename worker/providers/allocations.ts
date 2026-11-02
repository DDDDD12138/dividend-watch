import type { AnnualAllocation, Issue, StockIdentity } from '../../shared/api'
import { InvalidAmount, decimal, units } from '../../shared/money'
import { date, object, type Fetcher } from './http'
import { SourceDataError } from './errors'
import { fetchEastmoneyPages } from './eastmoney-pagination'

export const allocationUrl =
  'https://datacenter.eastmoney.com/securities/api/data/v1/get'

function amount(value: unknown, signed: boolean): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new SourceDataError('eastmoney', 'Invalid amount')
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw new SourceDataError('eastmoney', 'Unsafe amount')
  const text = String(value)
  const negative = text.startsWith('-')
  if (negative && !signed)
    throw new SourceDataError('eastmoney', 'Negative dividend')
  const parsed = units(negative ? text.slice(1) : text)
  return `${negative && parsed !== 0n ? '-' : ''}${decimal(parsed)}`
}

export function normalizeAllocation(
  identity: StockIdentity,
  value: unknown,
): AnnualAllocation {
  const raw = object(value, 'eastmoney')
  if (
    raw.SECUCODE !== `${identity.code}.${identity.market}` ||
    raw.SECURITY_CODE !== identity.code
  )
    throw new SourceDataError('eastmoney', 'Invalid stock identity')
  const reportDate = date(raw.REPORT_DATE, 'eastmoney')
  if (!reportDate?.endsWith('-12-31'))
    throw new SourceDataError('eastmoney', 'Invalid annual period')
  const issues: Issue[] = []
  function read(field: string, signed = false) {
    try {
      const result = amount(raw[field], signed)
      if (result === null)
        issues.push({ code: 'MISSING_FIELD', field, recordId: reportDate! })
      return result
    } catch (error) {
      if (
        !(error instanceof SourceDataError) &&
        !(error instanceof InvalidAmount)
      )
        throw error
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
  const page = await fetchEastmoneyPages(
    fetcher,
    allocationUrl,
    {
      reportName: 'RPT_F10_DIVIDEND_HISTOGRAM',
      columns:
        'SECUCODE,SECURITY_CODE,REPORT_DATE,PARENTNETPROFIT,DIVIDEND_IMPLE',
      filter: `(SECUCODE="${identity.code}.${identity.market}")`,
      source: 'HSF10',
      client: 'PC',
    },
    now,
  )
  const { rows, issues, pagesRead, fetchedRecords, fetchedAt } = page
  let { completeFetch } = page
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
    } catch (error) {
      if (!(error instanceof SourceDataError)) throw error
      completeFetch = false
      issues.push({ code: 'INVALID_ANNUAL_RECORD' })
    }
  }
  // The source provides no revision discriminator; conflicting years stay unknown.
  for (const year of conflicts) byYear.delete(year)
  return {
    years: [...byYear.values()].sort((a, b) => b.fiscalYear - a.fiscalYear),
    fetchedAt,
    issues,
    coverage: {
      fetchedRecords,
      returnedRecords: byYear.size,
      pagesRead,
      completeFetch,
    },
  }
}
