import { useEffect, useState } from 'react'
import type { YearEndPrice, YearEndPrices } from '../../../shared/api'
import { calculateReferenceYield } from '../../../shared/money'
import { request } from '../../data/api'

export async function requestYearEndPrices(
  code: string,
  years: number[],
  signal: AbortSignal,
) {
  const response = await request<YearEndPrices>(
    `/api/companies/${code}/year-end-prices?years=${years.join(',')}`,
    signal,
  )
  const rows = response.data.years
  if (
    response.data.company.code !== code ||
    !Array.isArray(rows) ||
    rows.length !== years.length ||
    new Set(rows.map((row) => row.fiscalYear)).size !== years.length
  )
    throw new Error('历史行情暂不可用')
  for (const row of rows) {
    if (
      !years.includes(row.fiscalYear) ||
      !Array.isArray(row.issues) ||
      !Number.isFinite(Date.parse(row.fetchedAt))
    )
      throw new Error('历史行情暂不可用')
    if (row.price !== null) {
      if (
        !row.tradeDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.tradeDate) ||
        Number(row.tradeDate.slice(0, 4)) !== row.fiscalYear ||
        !Number.isFinite(Date.parse(row.tradeDate)) ||
        new Date(row.tradeDate).toISOString().slice(0, 10) !== row.tradeDate ||
        row.issues.length
      )
        throw new Error('历史行情暂不可用')
      calculateReferenceYield('0', row.price)
    } else if (row.tradeDate !== null || !row.issues.length) {
      throw new Error('历史行情暂不可用')
    }
  }
  return rows
}

export function yearEndPriceStatus(
  years: number[],
  prices: ReadonlyMap<number, YearEndPrice>,
  failures: ReadonlySet<number>,
) {
  const failed = years.filter((year) => failures.has(year))
  if (!failed.length) return undefined
  if (failed.some((year) => prices.get(year)?.price)) return '更新失败'
  if (
    failed.every((year) =>
      prices
        .get(year)
        ?.issues.some((issue) => issue.code === 'NO_YEAR_END_PRICE'),
    )
  )
    return failed.length === years.length ? '暂无历史行情' : '部分年份无行情'
  return failed.length === years.length
    ? '历史行情加载失败'
    : '部分行情加载失败'
}

/**
 * Page-local cache: keep successful years across ranges, and retry on refresh.
 * Pass `years: null` while the year list is still unknown, so the first request
 * is not issued for a range that is about to change.
 */
export function useYearEndPrices(
  code: string,
  years: number[] | null,
  enabled: boolean,
  revision: number,
) {
  const empty = () => ({
    code,
    prices: new Map<number, YearEndPrice>(),
    attempts: new Map<number, number>(),
    failures: new Set<number>(),
  })
  const [state, setState] = useState(empty)
  if (state.code !== code) setState(empty())
  const key = years?.filter((year) => year >= 1990).join(',') ?? ''
  useEffect(() => {
    if (!enabled || !key || state.code !== code) return
    const batch = key
      .split(',')
      .map(Number)
      .filter((year) => state.attempts.get(year) !== revision)
    if (!batch.length) return
    const controller = new AbortController()
    void (async () => {
      const next = {
        code,
        prices: new Map(state.prices),
        attempts: new Map(state.attempts),
        failures: new Set(state.failures),
      }
      try {
        const rows = await requestYearEndPrices(code, batch, controller.signal)
        if (controller.signal.aborted) return
        for (const row of rows) {
          // A failed refresh must not erase the previous successful price/date.
          if (row.price !== null || !next.prices.get(row.fiscalYear)?.price)
            next.prices.set(row.fiscalYear, row)
          if (row.price === null) next.failures.add(row.fiscalYear)
          else next.failures.delete(row.fiscalYear)
        }
      } catch {
        if (controller.signal.aborted) return
        for (const year of batch) next.failures.add(year)
      }
      for (const year of batch) next.attempts.set(year, revision)
      setState(next)
    })()
    return () => controller.abort()
  }, [code, key, enabled, revision, state])
  const requested = key ? key.split(',').map(Number) : []
  const loading =
    enabled &&
    (years === null ||
      requested.some((year) => state.attempts.get(year) !== revision))
  return {
    prices: state.prices,
    failures: state.failures,
    loading,
    // Stale failures stay hidden while a retry is in flight.
    status: loading
      ? undefined
      : yearEndPriceStatus(requested, state.prices, state.failures),
  }
}
