import type { Company } from '../../shared/api'
import type { Fetcher } from '../../worker/providers/http'
import { bankCompanies } from './context'
export function failedResponse(cause: unknown) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(cause)
      },
    }),
  )
}
export function searchResponse(companies: Company[]) {
  return Response.json(
    searchBody(companies.map((company) => searchRow(company))),
  )
}
export function searchBody(Data: unknown[]) {
  return {
    QuotationCodeTable: {
      Status: 0,
      TotalCount: Data.length,
      Data,
    },
  }
}
export function searchRow(company: Company) {
  return {
    Code: company.code,
    Name: company.name,
    SecurityType:
      company.market === 'SH' ? '1' : company.market === 'SZ' ? '2' : '27',
    JYS: company.market === 'SH' ? '2' : company.market === 'SZ' ? '6' : '81',
  }
}
export function eastmoneyPage(data: unknown[], pages = 1, count = data.length) {
  return Response.json({ success: true, result: { data, pages, count } })
}
// Minimal synthetic source records for malformed fields, pagination and other edge cases.
export function dividendRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    SECUCODE: '601939.SH',
    SECURITY_CODE: '601939',
    SECURITY_NAME_ABBR: '建设银行',
    REPORT_DATE: '2025-12-31',
    ASSIGN_PROGRESS: '实施分配',
    PRETAX_BONUS_RMB: 2.029,
    PLAN_NOTICE_DATE: '2026-03-28',
    NOTICE_DATE: '2026-07-07',
    EQUITY_RECORD_DATE: '2026-07-10',
    EX_DIVIDEND_DATE: '2026-07-13',
    BONUS_RATIO: null,
    IT_RATIO: null,
    ...overrides,
  }
}
export function allocationRow(overrides: Record<string, unknown> = {}) {
  return {
    SECUCODE: '601939.SH',
    SECURITY_CODE: '601939',
    REPORT_DATE: '2025-12-31',
    PARENTNETPROFIT: 100,
    DIVIDEND_IMPLE: 20,
    ...overrides,
  }
}
export function profileResponse(overrides: Record<string, unknown> = {}) {
  return eastmoneyPage([
    {
      SECUCODE: '600941.SH',
      SECURITY_CODE: '600941',
      LISTING_DATE: '2022-01-05 00:00:00',
      MAIN_BUSINESS: '通信和信息服务',
      ...overrides,
    },
  ])
}
export function quoteText(
  code = '601939',
  name = '来源名称',
  price = '11.45',
  stamp = '20261019161456',
  market = 'sh',
) {
  const fields = Array<string>(50).fill('')
  fields[1] = name
  fields[2] = code
  fields[3] = price
  fields[30] = stamp
  return `v_${market}${code}="${fields.join('~')}";`
}

// Minimal input for API orchestration/cache tests. Exact upstream request
// parameters and real response formats are covered by provider-contracts.test.ts.
export const apiFetcher: Fetcher = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method =
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  const endpoint = `${url.origin}${url.pathname}`
  const query = url.searchParams.get('input')
  if (
    method === 'GET' &&
    endpoint === 'https://searchapi.eastmoney.com/api/suggest/get' &&
    query
  ) {
    return searchResponse(
      bankCompanies.filter(
        (company) =>
          company.code.includes(query) || company.name.includes(query),
      ),
    )
  }
  if (
    method === 'GET' &&
    endpoint === 'https://datacenter-web.eastmoney.com/api/data/v1/get' &&
    url.searchParams.get('reportName') === 'RPT_SHAREBONUS_DET' &&
    url.searchParams.get('filter') === '(SECUCODE="601939.SH")' &&
    url.searchParams.get('pageNumber') === '1'
  ) {
    return eastmoneyPage([dividendRow({ PRETAX_BONUS_RMB: 2 })])
  }
  throw new Error(`Unexpected test request: ${method} ${url}`)
}
