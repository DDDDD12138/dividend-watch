import type { ApiResponse, DataSource, Issue } from '../../shared/api'
import type { Fetcher } from '../providers/http'
import type { SourceCache } from './cache'
import type { companyService } from './companies'

export interface SourceDependencies {
  fetcher: Fetcher
  cache: SourceCache
  now: () => Date
}
export interface CompanyDependencies extends SourceDependencies {
  companies: ReturnType<typeof companyService>
}

export function sourceResult<T>(
  data: T,
  source: DataSource,
  cached: { value: { fetchedAt: string }; hit: boolean },
  issues: Issue[],
): ApiResponse<T> {
  return {
    data,
    meta: {
      source,
      fetchedAt: cached.value.fetchedAt,
      cache: cached.hit ? 'hit' : 'miss',
      issues,
    },
  }
}
