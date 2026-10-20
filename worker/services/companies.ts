import type { Company } from '../../shared/api'
import { searchCompanies } from '../providers/companies'
import type { Fetcher } from '../providers/http'
import type { SourceCache } from './cache'

export class CompanyNotFound extends Error {}
export function companyService(
  fetcher: Fetcher,
  cache: SourceCache,
  now: () => Date,
) {
  const search = (query: string, signal = AbortSignal.timeout(6000)) =>
    cache.get(
      `search/${encodeURIComponent(query)}`,
      300,
      () => searchCompanies(fetcher, query, now(), signal),
      (result) => result.issues.length === 0,
    )
  async function resolve(
    code: string,
    signal = AbortSignal.timeout(6000),
  ): Promise<Company> {
    const { value } = await cache.get(
      `identity/${code}`,
      86400,
      async () => {
        const { value } = await search(code, signal)
        const company = value.companies.find((item) => item.code === code)
        if (!company) {
          if (value.issues.length)
            throw new Error('Company identity unavailable')
          throw new CompanyNotFound('No supported A-share match')
        }
        return company
      },
      () => true,
    )
    return value
  }
  return { search, resolve }
}
