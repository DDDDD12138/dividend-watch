import type { AllocationHistory, AnnualAllocation } from '../../../shared/api'
import { units } from '../../../shared/money'
import { historyYears, type HistoryRange } from '../../lib/historyYears'
import { dividendAxis } from './axis'

export interface AllocationPoint {
  year: number
  record?: AnnualAllocation
  ratio: string | null
  growth: string | null
}
export function signedUnits(value: string) {
  return value.startsWith('-') ? -units(value.slice(1)) : units(value)
}
function rounded(value: bigint, denominator: bigint, digits: number) {
  const scale = 10n ** BigInt(digits)
  const absolute = value < 0n ? -value : value
  const rounded = (absolute * scale + denominator / 2n) / denominator
  return `${value < 0n && rounded !== 0n ? '−' : ''}${rounded / scale}${digits ? `.${String(rounded % scale).padStart(digits, '0')}` : ''}`
}
/** Amounts are displayed in hundred-million CNY; rounding never changes source amounts. */
export function allocationAmount(value: string | null | undefined) {
  if (value == null) return '—'
  const magnitude = Math.abs(Number(value) / 100_000_000)
  const digits =
    magnitude === 0 || magnitude >= 10
      ? 1
      : Math.min(16, Math.max(2, 1 - Math.floor(Math.log10(magnitude))))
  return rounded(signedUnits(value), units('100000000'), digits)
}
/** Large chart labels use whole hundred-million units; tooltips and dialogs retain finer values. */
export function allocationChartAmount(value: string | null | undefined) {
  if (value != null && Math.abs(Number(value)) >= 10_000_000_000)
    return rounded(signedUnits(value), units('100000000'), 0)
  return allocationAmount(value)
}
export function allocationRatio(record: AnnualAllocation | undefined) {
  if (record?.netProfit == null || record.cashDividend === null) return null
  const profit = signedUnits(record.netProfit)
  if (profit <= 0n) return null
  return rounded(units(record.cashDividend) * 100n, profit, 1)
}
export function allocationGrowth(
  record: AnnualAllocation,
  previous?: AnnualAllocation,
) {
  if (
    record.netProfit === null ||
    previous?.netProfit == null ||
    previous.fiscalYear !== record.fiscalYear - 1
  )
    return null
  const base = signedUnits(previous.netProfit)
  if (base <= 0n) return null
  const difference = signedUnits(record.netProfit) - base
  const result = rounded(difference * 100n, base, 1)
  return `${difference > 0n && result !== '0.0' ? '+' : ''}${result}%`
}
export function allocationView(
  history: AllocationHistory,
  range: HistoryRange,
): AllocationPoint[] {
  const byYear = new Map(history.years.map((row) => [row.fiscalYear, row]))
  return historyYears(
    range,
    history.years.map((row) => row.fiscalYear),
    history.lastEndedYear,
  ).map((year) => {
    const record = byYear.get(year)
    return {
      year,
      record,
      ratio: allocationRatio(record),
      growth: record ? allocationGrowth(record, byYear.get(year - 1)) : null,
    }
  })
}
/** Keep losses below zero and cash above zero, including cash greater than profit. */
export function allocationAxis(points: AllocationPoint[]) {
  const values = points
    .flatMap(({ record }) => [record?.netProfit, record?.cashDividend])
    .filter((value) => value != null)
    .map((value) => Number(value) / 100_000_000)
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values)
  const positive = dividendAxis(high - low)
  const step = positive.ticks[1].value
  const minimum = low < 0 ? Math.floor((low * 1.1) / step) * step : 0
  const maximum =
    high > 0 ? Math.ceil((high * 1.1) / step) * step : low < 0 ? 0 : 1
  const exponent = Math.floor(Math.log10(step))
  const digits = Math.max(
    0,
    -exponent + (Math.abs(step / 10 ** exponent - 2.5) < 1e-8 ? 1 : 0),
  )
  return {
    minimum,
    maximum,
    ticks: Array.from(
      { length: Math.round((maximum - minimum) / step) + 1 },
      (_, index) => {
        const value = Number((minimum + step * index).toPrecision(12))
        return { value, label: value.toFixed(digits) }
      },
    ),
  }
}
