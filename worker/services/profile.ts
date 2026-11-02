import type { CompanyProfile } from '../../shared/api'
import { fetchProfile } from '../providers/profile'
import { sourceResult, type CompanyDependencies } from './result'

const PROFILE_TTL = 86400
// A malformed optional business field must not discard a valid listing date.
const isCacheableProfile = () => true

export function profileService({
  companies,
  cache,
  fetcher,
  now,
}: CompanyDependencies) {
  async function get(code: string) {
    const company = await companies.resolve(code)
    const cached = await cache.get(
      `profile/${company.market}/${code}`,
      PROFILE_TTL,
      () => fetchProfile(fetcher, company, now()),
      isCacheableProfile,
    )
    const { value } = cached
    const data: CompanyProfile = {
      company: value.company,
      listingDate: value.listingDate,
      mainBusiness: value.mainBusiness,
    }
    return sourceResult(data, 'eastmoney', cached, value.issues)
  }
  return { get }
}
