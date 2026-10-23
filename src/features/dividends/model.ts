import type {
  AnnualDividend,
  DividendHistory,
  EastmoneyDividend,
  Issue,
} from '../../../shared/api'
import { EASTMONEY_IMPLEMENTED_PROGRESS } from '../../../shared/api'
import { units } from '../../../shared/money'
import { chinaYear } from '../../../shared/time'
export type HistoryRange = '5' | '10' | 'all'
export type ChartLayer = 'year' | 'record' | 'profit' | 'cash'
export interface YearGroup {
  year: number
  summary?: AnnualDividend
  records: EastmoneyDividend[]
}
export const marketNames = { SH: '沪市', SZ: '深市', BJ: '北交所' }
export function issueText(issue: Issue): string {
  const messages: Record<string, string> = {
    AMBIGUOUS_RECORDS: '记录存在歧义，暂不汇总',
    MISSING_PROGRESS: '部分记录缺少方案进度',
    INCOMPLETE_FETCH: '分红记录尚未获取完整',
    NO_IMPLEMENTED_RECORDS: '暂无实施分配记录',
    MISSING_CASH_AMOUNT: '部分记录缺少现金金额',
    NO_IMPLEMENTED_YEAR_END_REPORT: '暂无年末报告期的实施分配记录',
    FISCAL_YEAR_NOT_ENDED: '该财年尚未结束',
    SHARE_BASIS_CHANGED: '存在送转股，历史每股金额不直接用于当前价格计算',
    INVALID_SHARE_RATIO: '送转比例数据异常',
  }
  return messages[issue.code] ?? '部分来源字段缺失或异常'
}
export function sortRecords(records: EastmoneyDividend[]) {
  return [...records].sort(
    (a, b) =>
      (a.exDate ?? '9999').localeCompare(b.exDate ?? '9999') ||
      (a.reportDate ?? '').localeCompare(b.reportDate ?? '') ||
      a.recordId.localeCompare(b.recordId),
  )
}
export function historyView(
  history: DividendHistory,
  range: HistoryRange,
  now = new Date(),
) {
  const currentYear = chinaYear(now)
  const years = [
    ...new Set(
      history.records.flatMap((record) =>
        record.fiscalYear === null ? [] : [record.fiscalYear],
      ),
    ),
  ].sort((a, b) => a - b)
  const ended = years.filter((year) => year < currentYear)
  const last = ended.at(-1)
  const first =
    last === undefined
      ? undefined
      : range === 'all'
        ? ended[0]
        : Math.max(ended[0], last - Number(range) + 1)
  const group = (year: number): YearGroup => ({
    year,
    summary: history.annualSummaries.find((item) => item.fiscalYear === year),
    records: sortRecords(
      history.records.filter((item) => item.fiscalYear === year),
    ),
  })
  const chart =
    first === undefined || last === undefined
      ? []
      : Array.from({ length: last - first + 1 }, (_, index) =>
          group(first + index),
        )
  return {
    currentYear,
    chart,
    historical: chart.filter((item) => item.records.length).toReversed(),
    recent: years
      .filter((year) => year >= currentYear)
      .toReversed()
      .map(group),
    unassigned: sortRecords(
      history.records.filter((item) => item.fiscalYear === null),
    ),
  }
}
export function chartRecords(group: YearGroup) {
  if (group.summary?.implementedTotal == null) return []
  return group.records.filter(
    (record) =>
      record.progress === EASTMONEY_IMPLEMENTED_PROGRESS &&
      record.cashPerShare !== null,
  )
}
export function yearChange(
  current: YearGroup,
  all: AnnualDividend[],
): string | null {
  const previous = all.find((item) => item.fiscalYear === current.year - 1)
  if (
    !current.summary?.referenceEligible ||
    !previous?.referenceEligible ||
    current.summary.implementedTotal === null ||
    previous.implementedTotal === null
  )
    return null
  const base = units(previous.implementedTotal)
  if (base === 0n) return null
  const difference = units(current.summary.implementedTotal) - base
  const numerator = (difference < 0n ? -difference : difference) * 10000n
  const rounded = (numerator + base / 2n) / base
  return `${rounded === 0n ? '' : difference < 0n ? '−' : '+'}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}%`
}
export function dividendAmount(value: string | null | undefined) {
  if (value == null) return '—'
  const [whole, fraction = ''] = value.split('.')
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(3, '0')}`
}
export function cash(value: string | null | undefined) {
  return value == null ? '—' : `¥${dividendAmount(value)}`
}
