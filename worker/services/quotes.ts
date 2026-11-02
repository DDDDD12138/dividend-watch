import type { Company, QuoteItem } from '../../shared/api'
import { SourceError } from '../providers/errors'
import { fetchQuotes } from '../providers/tencent'
import { CompanyNotFound } from './companies'
import { sourceResult, type CompanyDependencies } from './result'

const QUOTE_TTL = 60
const IDENTITY_CONCURRENCY = 5
const IDENTITY_TIMEOUT = 8000
const isCacheableQuotes = (value: Awaited<ReturnType<typeof fetchQuotes>>) =>
  value.items.every((item) => item.quote && !item.quote.issues.length)

export function quoteService({
  companies,
  cache,
  fetcher,
  now,
}: CompanyDependencies) {
  async function get(codes: string[]) {
    // Worker promises and concurrency state belong to this request only.
    const identities = new Map<string, Company>()
    const failures = new Map<string, QuoteItem>()
    const budget = AbortSignal.timeout(IDENTITY_TIMEOUT)
    let cursor = 0
    let sourceFailure: SourceError | undefined
    await Promise.all(
      Array.from(
        { length: Math.min(IDENTITY_CONCURRENCY, codes.length) },
        async () => {
          while (cursor < codes.length) {
            const code = codes[cursor++]
            try {
              identities.set(code, await companies.resolve(code, budget))
            } catch (error) {
              if (
                !(error instanceof CompanyNotFound) &&
                !(error instanceof SourceError)
              )
                throw error
              if (error instanceof SourceError) sourceFailure ??= error
              failures.set(code, {
                code,
                quote: null,
                error: {
                  code:
                    error instanceof CompanyNotFound
                      ? 'UNSUPPORTED_COMPANY'
                      : 'COMPANY_UNAVAILABLE',
                },
              })
            }
          }
        },
      ),
    )
    if (!identities.size) {
      if (sourceFailure) throw sourceFailure
      throw new CompanyNotFound('No supported A-share match')
    }
    const requested = [...identities.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    )
    const key = requested
      .map(({ market, code }) => `${market}${code}`)
      .join(',')
    const cached = await cache.get(
      `quotes/${key}`,
      QUOTE_TTL,
      () => fetchQuotes(fetcher, now(), requested),
      isCacheableQuotes,
    )
    const items = new Map(cached.value.items.map((item) => [item.code, item]))
    const data = codes.map((code) => {
      const item = failures.get(code) ?? items.get(code)
      if (!item) throw new Error('Missing resolved quote item')
      return item
    })
    if (data.every((item) => !item.quote?.price || !item.quote.quoteTime))
      throw new SourceError('tencent', 'No usable quotes')
    return sourceResult(
      data,
      'tencent',
      cached,
      data.flatMap((item) =>
        item.error
          ? [{ code: item.error.code, field: item.code }]
          : (item.quote?.issues ?? []),
      ),
    )
  }
  return { get }
}
