import { SourceDataError } from './errors'
import type { CompanyProfile, Company, Issue } from '../../shared/api'
import { eastmoneyUrl } from './eastmoney'
import { date, object, readJson, request, type Fetcher } from './http'

export async function fetchProfile(
  fetcher: Fetcher,
  company: Company,
  now: Date,
) {
  const issues: Issue[] = []
  const secucode = `${company.code}.${company.market}`
  const url = new URL(eastmoneyUrl)
  url.search = new URLSearchParams({
    reportName: 'RPT_F10_BASIC_ORGINFO',
    columns: 'SECUCODE,SECURITY_CODE,LISTING_DATE,MAIN_BUSINESS',
    filter: `(SECUCODE="${secucode}")`,
  }).toString()
  const response = await request(
    fetcher,
    url,
    AbortSignal.timeout(6000),
    5000,
    'eastmoney',
  )
  const body = object(await readJson(response, 'eastmoney'), 'eastmoney')
  if (body.success === false && body.code === 9201 && body.result === null)
    return {
      company,
      listingDate: null,
      mainBusiness: null,
      issues,
      fetchedAt: now.toISOString(),
    }
  if (body.success !== true)
    throw new SourceDataError('eastmoney', 'Company profile source unavailable')
  const result = object(body.result, 'eastmoney')
  if (!Array.isArray(result.data) || result.data.length !== 1)
    throw new SourceDataError('eastmoney', 'Ambiguous company identity')
  const row = object(result.data[0], 'eastmoney')
  if (row.SECUCODE !== secucode || row.SECURITY_CODE !== company.code)
    throw new SourceDataError('eastmoney', 'Invalid company identity')
  const business = row.MAIN_BUSINESS
  if (business != null && typeof business !== 'string')
    issues.push({ code: 'INVALID_MAIN_BUSINESS', field: 'MAIN_BUSINESS' })
  const data: CompanyProfile = {
    company,
    listingDate: date(row.LISTING_DATE, 'eastmoney'),
    mainBusiness: typeof business === 'string' ? business.trim() || null : null,
  }
  return { ...data, issues, fetchedAt: now.toISOString() }
}
