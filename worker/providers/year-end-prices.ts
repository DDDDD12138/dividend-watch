import type { StockIdentity, YearEndPrice } from '../../shared/api'
import { decimal, InvalidAmount, units } from '../../shared/money'
import { chinaDate, chinaYear } from '../../shared/time'
import { SourceDataError } from './errors'
import { date, object, readJson, request, type Fetcher } from './http'

/** One annual candle per year, including the current unfinished year. */
export async function fetchYearEndPrices(
  fetcher: Fetcher,
  company: StockIdentity,
  firstYear: number,
  now: Date,
) {
  const currentYear = chinaYear(now)
  const count = currentYear - firstYear + 1
  const url = new URL(
    'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
  )
  url.search = new URLSearchParams({
    symbol: `${company.market.toLowerCase()}${company.code}`,
    scale: '86400',
    ma: 'no',
    datalen: String(count),
  }).toString()
  const response = await request(
    fetcher,
    url,
    AbortSignal.timeout(5000),
    5000,
    'sina',
  )
  const body = await readJson(response, 'sina')
  if (!Array.isArray(body) || body.length > count)
    throw new SourceDataError('sina', 'Invalid annual history response')
  const fetchedAt = now.toISOString()
  const today = chinaDate(now)
  const seen = new Set<number>()
  const prices = new Map<number, YearEndPrice>()
  for (const raw of body) {
    const row = object(raw, 'sina')
    const day = date(row.day, 'sina')
    if (!day || day > today || Number(day.slice(0, 4)) < 1990)
      throw new SourceDataError('sina', 'Invalid annual date')
    const fiscalYear = Number(day.slice(0, 4))
    // Reject daily/monthly responses instead of silently treating them as annual candles.
    if (seen.has(fiscalYear))
      throw new SourceDataError('sina', 'Duplicate annual candle')
    seen.add(fiscalYear)
    if (fiscalYear >= currentYear || fiscalYear < firstYear) continue
    let price: string | null = null
    try {
      if (typeof row.close !== 'string')
        throw new InvalidAmount('Invalid close')
      const close = units(row.close)
      if (close <= 0n || close % 1_000_000n !== 0n)
        throw new InvalidAmount('Invalid A-share close')
      price = decimal(close)
    } catch (error) {
      if (!(error instanceof InvalidAmount)) throw error
    }
    prices.set(fiscalYear, {
      fiscalYear,
      price,
      tradeDate: price === null ? null : day,
      fetchedAt,
      issues: price === null ? [{ code: 'INVALID_YEAR_END_PRICE' }] : [],
    })
  }
  const years = Array.from({ length: currentYear - firstYear }, (_, index) => {
    const fiscalYear = firstYear + index
    return (
      prices.get(fiscalYear) ?? {
        fiscalYear,
        price: null,
        tradeDate: null,
        fetchedAt,
        issues: [{ code: 'NO_YEAR_END_PRICE' }],
      }
    )
  })
  return { years, fetchedAt }
}
