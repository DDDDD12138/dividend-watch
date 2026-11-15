import type { ApiResponse, YearEndPrice, YearEndPrices } from '../../shared/api'
import { chinaYear } from '../../shared/time'
import { SourceDataError, SourceError } from '../providers/errors'
import { fetchYearEndPrices } from '../providers/year-end-prices'
import type { CompanyDependencies } from './result'

/**
 * Years before the first candle predate the listing and never appear, so they
 * must not block caching; a gap or malformed close after it may be transient.
 */
function cacheable({ years }: { years: YearEndPrice[] }) {
  const first = years.findIndex((row) => row.price !== null)
  return (
    first >= 0 &&
    years.slice(first).every((row) => row.price !== null) &&
    years
      .slice(0, first)
      .every((row) =>
        row.issues.every((issue) => issue.code === 'NO_YEAR_END_PRICE'),
      )
  )
}

export function yearEndPriceService({
  companies,
  cache,
  fetcher,
  now,
}: CompanyDependencies) {
  async function get(
    code: string,
    years: number[],
  ): Promise<ApiResponse<YearEndPrices>> {
    const company = await companies.resolve(code)
    const fetchedOn = now()
    const currentYear = chinaYear(fetchedOn)
    // Annual candles are tiny: always fetch at least ten years so the 5- and
    // 10-year views share one cache entry instead of one per first year.
    const firstYear = Math.min(...years, currentYear - 10)
    let cached
    try {
      cached = await cache.get(
        `year-end-prices/sina-annual-v1/${company.market}${code}/${currentYear}/${firstYear}`,
        86400,
        () => fetchYearEndPrices(fetcher, company, firstYear, fetchedOn),
        cacheable,
      )
    } catch (error) {
      if (!(error instanceof SourceError)) throw error
      console.warn('Year-end price request failed', {
        code,
        market: company.market,
        years,
        source: error.source,
        type: error.name,
        message: error.message,
      })
      cached = {
        hit: false,
        value: {
          fetchedAt: fetchedOn.toISOString(),
          years: years.map((fiscalYear) => ({
            fiscalYear,
            price: null,
            tradeDate: null,
            fetchedAt: fetchedOn.toISOString(),
            issues: [
              {
                code:
                  error instanceof SourceDataError
                    ? 'INVALID_YEAR_END_PRICE'
                    : 'YEAR_END_PRICE_UNAVAILABLE',
              },
            ],
          })),
        },
      }
    }
    const requested = new Set(years)
    const results = cached.value.years.filter((row) =>
      requested.has(row.fiscalYear),
    )
    return {
      data: { company, years: results },
      meta: {
        source: 'sina',
        fetchedAt: cached.value.fetchedAt,
        cache: cached.hit ? 'hit' : 'miss',
        issues: results.flatMap((row) =>
          row.issues.map((issue) => ({
            ...issue,
            field: String(row.fiscalYear),
          })),
        ),
      },
    }
  }
  return { get }
}
