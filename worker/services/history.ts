import type {
  AnnualDividend,
  Company,
  DividendHistory,
  EastmoneyDividend,
  Issue,
} from '../../shared/api'
import { EASTMONEY_IMPLEMENTED_PROGRESS } from '../../shared/api'
import { sumAmounts, units } from '../../shared/money'
import { chinaYear } from '../../shared/time'
import { eastmoneyUrl, type EastmoneyResult } from '../providers/eastmoney'
/** Only clear, distinct record/ex dates establish separate distributions in one report period. */
function hasAmbiguousRecords(rows: EastmoneyDividend[]): boolean {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j]
      if (a.reportDate !== b.reportDate) continue
      if (
        !a.recordDate ||
        !a.exDate ||
        !b.recordDate ||
        !b.exDate ||
        a.recordDate === b.recordDate ||
        a.exDate === b.exDate
      )
        return true
    }
  }
  return false
}
export function buildHistory(
  company: Company,
  input: EastmoneyResult,
  now: Date,
): DividendHistory {
  const rows = input.records
  const years = [
    ...new Set(
      rows.flatMap((row) => (row.fiscalYear === null ? [] : [row.fiscalYear])),
    ),
  ].sort((a, b) => b - a)
  const annualSummaries: AnnualDividend[] = years.map((year) => {
    const records = rows.filter((row) => row.fiscalYear === year)
    const implemented = records.filter(
      (row) => row.progress === EASTMONEY_IMPLEMENTED_PROGRESS,
    )
    const calculationIssues: Issue[] = []
    const ambiguous = hasAmbiguousRecords(records)
    const missingProgress = records.some((row) => row.progress === null)
    if (ambiguous) calculationIssues.push({ code: 'AMBIGUOUS_RECORDS' })
    if (missingProgress) calculationIssues.push({ code: 'MISSING_PROGRESS' })
    if (!input.completeFetch)
      calculationIssues.push({ code: 'INCOMPLETE_FETCH' })
    const implementedTotal =
      ambiguous || missingProgress || !input.completeFetch
        ? null
        : sumAmounts(implemented.map((row) => row.cashPerShare))
    if (!implemented.length)
      calculationIssues.push({ code: 'NO_IMPLEMENTED_RECORDS' })
    else if (implemented.some((row) => row.cashPerShare === null))
      calculationIssues.push({ code: 'MISSING_CASH_AMOUNT' })
    if (!implemented.some((row) => row.reportDate === `${year}-12-31`))
      calculationIssues.push({ code: 'NO_IMPLEMENTED_YEAR_END_REPORT' })
    if (year >= chinaYear(now))
      calculationIssues.push({ code: 'FISCAL_YEAR_NOT_ENDED' })
    if (
      implemented.some((row) =>
        [row.bonusRatio, row.transferRatio].some(
          (value) => value !== null && units(value) > 0n,
        ),
      )
    )
      calculationIssues.push({ code: 'SHARE_BASIS_CHANGED' })
    if (
      implemented.some((row) =>
        row.issues.some(
          (issue) =>
            issue.field === 'BONUS_RATIO' || issue.field === 'IT_RATIO',
        ),
      )
    )
      calculationIssues.push({ code: 'INVALID_SHARE_RATIO' })
    return {
      fiscalYear: year,
      implementedTotal,
      implementedRecordCount: implemented.length,
      referenceEligible:
        implementedTotal !== null && calculationIssues.length === 0,
      calculationIssues,
    }
  })
  const reference = annualSummaries.find((year) => year.referenceEligible)
  return {
    code: company.code,
    company,
    source: 'eastmoney',
    sourceUrl: eastmoneyUrl,
    records: rows,
    annualSummaries,
    referenceDividend:
      reference && reference.implementedTotal !== null
        ? {
            fiscalYear: reference.fiscalYear,
            cashPerShare: reference.implementedTotal,
            basis: 'eastmoney_implemented_sum',
          }
        : null,
    coverage: {
      fetchedRecords: input.fetchedRecords,
      returnedRecords: rows.length,
      pagesRead: input.pagesRead,
      completeFetch: input.completeFetch,
    },
  }
}
