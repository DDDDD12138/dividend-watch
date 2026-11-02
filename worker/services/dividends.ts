import { fetchDividends, type EastmoneyResult } from '../providers/eastmoney'
import { SourceError } from '../providers/errors'
import { buildHistory } from './history'
import { sourceResult, type CompanyDependencies } from './result'

const DIVIDEND_TTL = 3600
const isCacheableHistory = (value: EastmoneyResult) =>
  value.completeFetch && value.records.every((record) => !record.issues.length)

export function dividendService({
  companies,
  cache,
  fetcher,
  now,
}: CompanyDependencies) {
  async function get(code: string) {
    const company = await companies.resolve(code)
    const cached = await cache.get(
      `dividends/${company.market}/${code}`,
      DIVIDEND_TTL,
      () => fetchDividends(fetcher, company, now()),
      isCacheableHistory,
    )
    const { value } = cached
    if (!value.completeFetch && !value.records.length)
      throw new SourceError('eastmoney', 'No usable dividend records')
    return sourceResult(
      buildHistory(company, value, now()),
      'eastmoney',
      cached,
      [...value.issues, ...value.records.flatMap((record) => record.issues)],
    )
  }
  return { get }
}
