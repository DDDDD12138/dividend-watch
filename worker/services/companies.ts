import type { Company } from '../../shared/api'
import { searchCompanies } from '../providers/companies'
import { SourceDataError } from '../providers/errors'
import { sourceResult, type SourceDependencies } from './result'

const SEARCH_TTL = 300
const IDENTITY_TTL = 86400
const SEARCH_LIMIT = 10
const isCacheableSearch = (
  result: Awaited<ReturnType<typeof searchCompanies>>,
) => result.issues.length === 0

export class CompanyNotFound extends Error {
  override name = 'CompanyNotFound'
}
export function companyService({ fetcher, cache, now }: SourceDependencies) {
  const searchSource = (query: string, signal = AbortSignal.timeout(6000)) =>
    cache.get(
      `search/${encodeURIComponent(query)}`,
      SEARCH_TTL,
      () => searchCompanies(fetcher, query, now(), signal),
      isCacheableSearch,
    )
  async function resolve(
    code: string,
    signal = AbortSignal.timeout(6000),
  ): Promise<Company> {
    const { value } = await cache.get(
      `identity/${code}`,
      IDENTITY_TTL,
      async () => {
        const { value } = await searchSource(code, signal)
        const company = value.companies.find((item) => item.code === code)
        if (!company) {
          if (value.issues.length)
            throw new SourceDataError(
              'eastmoney',
              'Company identity unavailable',
            )
          throw new CompanyNotFound('No supported A-share match')
        }
        return company
      },
      () => true,
    )
    return value
  }
  async function search(query: string) {
    const cached = await searchSource(query)
    return sourceResult(
      cached.value.companies.slice(0, SEARCH_LIMIT),
      'eastmoney',
      cached,
      cached.value.issues,
    )
  }
  return { search, resolve }
}
