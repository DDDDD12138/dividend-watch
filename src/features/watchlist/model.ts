import type { DividendHistory, Quote } from '../../../shared/api'
import { calculateMetrics, units } from '../../../shared/money'
import { historyYears } from '../../lib/historyYears'

export interface Preferences {
  version: 1
  codes: string[]
  expectedYield: string
  sort: 'added' | 'yield'
}
export const STORAGE_KEY = 'dividend-watch.preferences'
export const defaultPreferences: Preferences = {
  version: 1,
  codes: [],
  expectedYield: '5.5',
  sort: 'added',
}
export function validYield(value: string): boolean {
  try {
    calculateMetrics(null, null, value)
    return true
  } catch {
    return false
  }
}
export function parsePreferences(text: string): Preferences {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid settings')
  const p = value as Record<string, unknown>
  if (
    p.version !== 1 ||
    !Array.isArray(p.codes) ||
    p.codes.length > 50 ||
    !p.codes.every(
      (code) => typeof code === 'string' && /^\d{6}$/.test(code),
    ) ||
    new Set(p.codes).size !== p.codes.length ||
    typeof p.expectedYield !== 'string' ||
    !validYield(p.expectedYield) ||
    (p.sort !== 'added' && p.sort !== 'yield')
  )
    throw new Error('Invalid settings')
  return {
    version: 1,
    codes: p.codes,
    expectedYield: p.expectedYield,
    sort: p.sort,
  }
}
export function metricsFor(
  history: DividendHistory | undefined,
  quote: Quote | null | undefined,
  expectedYield: string,
) {
  return calculateMetrics(
    history?.referenceDividend.cashPerShare ?? null,
    quote?.quoteTime ? quote.price : null,
    expectedYield,
  )
}
export function compareYields(a: string | undefined, b: string | undefined) {
  if (a === undefined) return b === undefined ? 0 : 1
  if (b === undefined) return -1
  const left = units(a),
    right = units(b)
  return left === right ? 0 : left > right ? -1 : 1
}
export function recentYears(history: DividendHistory) {
  return historyYears('5', [], history.referenceDividend.fiscalYear).map(
    (year) => {
      return {
        year,
        amount:
          history.annualSummaries.find((item) => item.fiscalYear === year)
            ?.implementedTotal ?? null,
      }
    },
  )
}
