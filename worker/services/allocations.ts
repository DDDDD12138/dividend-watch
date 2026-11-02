import type { AllocationHistory } from '../../shared/api'
import { chinaYear } from '../../shared/time'
import { allocationUrl, fetchAllocations } from '../providers/allocations'
import { SourceError } from '../providers/errors'
import { sourceResult, type CompanyDependencies } from './result'

const ALLOCATION_TTL = 3600
const isCacheableAllocation = (
  value: Awaited<ReturnType<typeof fetchAllocations>>,
) =>
  value.coverage.completeFetch &&
  value.years.every((year) => !year.issues.length)

export function allocationService({
  companies,
  cache,
  fetcher,
  now,
}: CompanyDependencies) {
  async function get(code: string) {
    const company = await companies.resolve(code)
    const cached = await cache.get(
      `allocations/${company.market}/${code}`,
      ALLOCATION_TTL,
      () => fetchAllocations(fetcher, company, now()),
      isCacheableAllocation,
    )
    const { value } = cached
    if (!value.coverage.completeFetch && !value.years.length)
      throw new SourceError('eastmoney', 'No usable annual records')
    const data: AllocationHistory = {
      company,
      source: 'eastmoney',
      sourceUrl: allocationUrl,
      lastEndedYear: chinaYear(now()) - 1,
      years: value.years,
      coverage: value.coverage,
    }
    return sourceResult(data, 'eastmoney', cached, [
      ...value.issues,
      ...value.years.flatMap((year) => year.issues),
    ])
  }
  return { get }
}
