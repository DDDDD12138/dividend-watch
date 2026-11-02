import { SourceDataError } from './errors'
import type { Company, Issue, Market } from '../../shared/api'
import { object, readJson, request, type Fetcher } from './http'

export const companySearchUrl =
  'https://searchapi.eastmoney.com/api/suggest/get'
// Source identifiers, not code-prefix guesses: SecurityType + JYS.
const markets: Readonly<Record<string, Market>> = {
  '1:2': 'SH',
  '25:23': 'SH',
  '2:6': 'SZ',
  '2:80': 'SZ',
  '27:81': 'BJ',
}
const stockTypes = new Set(['1', '2', '25', '27'])
export function parseCompanies(value: unknown) {
  const table = object(
    object(value, 'eastmoney').QuotationCodeTable,
    'eastmoney',
  )
  if (
    table.Status !== 0 ||
    !Number.isInteger(table.TotalCount) ||
    Number(table.TotalCount) < 0
  )
    throw new SourceDataError('eastmoney', 'Invalid company search status')
  if (table.Status === 0 && table.TotalCount === 0 && table.Data === null)
    return { companies: [] as Company[], issues: [] as Issue[] }
  if (
    !Array.isArray(table.Data) ||
    table.Data.length > Number(table.TotalCount) ||
    (table.Data.length === 0 && table.TotalCount !== 0)
  )
    throw new SourceDataError('eastmoney', 'Invalid company search response')
  const companies = new Map<string, Company>()
  const conflicts = new Set<string>()
  const issues: Issue[] = []
  for (const value of table.Data) {
    try {
      const row = object(value, 'eastmoney')
      if (typeof row.SecurityType !== 'string')
        throw new SourceDataError('eastmoney', 'Missing security type')
      if (!stockTypes.has(row.SecurityType)) continue
      const market = markets[`${row.SecurityType}:${row.JYS}`]
      if (
        !market ||
        typeof row.Code !== 'string' ||
        !/^\d{6}$/.test(row.Code) ||
        typeof row.Name !== 'string' ||
        !row.Name.trim()
      )
        throw new SourceDataError('eastmoney', 'Invalid stock identity')
      const company: Company = { code: row.Code, name: row.Name.trim(), market }
      const previous = companies.get(company.code)
      if (
        previous &&
        (previous.market !== market || previous.name !== company.name)
      ) {
        conflicts.add(company.code)
        issues.push({ code: 'AMBIGUOUS_COMPANY', field: company.code })
      }
      companies.set(company.code, company)
    } catch (error) {
      if (!(error instanceof SourceDataError)) throw error
      issues.push({ code: 'INVALID_COMPANY_IDENTITY' })
    }
  }
  return {
    companies: [...companies.values()].filter(
      (company) => !conflicts.has(company.code),
    ),
    issues,
  }
}
export async function searchCompanies(
  fetcher: Fetcher,
  query: string,
  now: Date,
  signal: AbortSignal,
) {
  const url = new URL(companySearchUrl)
  url.search = new URLSearchParams({
    input: query,
    type: '14',
    count: '30',
  }).toString()
  const response = await request(fetcher, url, signal, 5000, 'eastmoney')
  const result = parseCompanies(await readJson(response, 'eastmoney'))
  if (!result.companies.length && result.issues.length)
    throw new SourceDataError('eastmoney', 'No valid company identities')
  return { ...result, fetchedAt: now.toISOString() }
}
