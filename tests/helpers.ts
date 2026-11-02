import fixture from './fixtures/eastmoney.json'
import type { Company, StockIdentity } from '../shared/api'
import type { Fetcher } from '../worker/providers/http'
export const now = new Date('2026-10-20T01:00:00Z')
export function failedResponse(cause: unknown) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(cause)
      },
    }),
  )
}
export function rows(code = '601939'): Record<string, unknown>[] {
  return structuredClone(
    fixture.companies[code as keyof typeof fixture.companies],
  )
}
export const bankCompanies: Company[] = [
  { code: '601939', name: '建设银行', market: 'SH' },
  { code: '601398', name: '工商银行', market: 'SH' },
  { code: '601988', name: '中国银行', market: 'SH' },
]
export function bankIdentity(code = '601939'): StockIdentity {
  return { code, market: 'SH' }
}
export function searchResponse(companies: Company[]) {
  return Response.json({
    QuotationCodeTable: {
      Status: 0,
      TotalCount: companies.length,
      Data: companies.map((company) => ({
        Code: company.code,
        Name: company.name,
        SecurityType:
          company.market === 'SH' ? '1' : company.market === 'SZ' ? '2' : '27',
        JYS:
          company.market === 'SH' ? '2' : company.market === 'SZ' ? '6' : '81',
      })),
    },
  })
}
export const fixtureFetcher: Fetcher = async (input) => {
  const url = new URL(String(input))
  if (url.hostname === 'searchapi.eastmoney.com') {
    const query = url.searchParams.get('input')!
    return searchResponse(
      bankCompanies.filter(
        (company) =>
          company.code.includes(query) || company.name.includes(query),
      ),
    )
  }
  if (url.hostname !== 'datacenter-web.eastmoney.com')
    throw new Error('Unexpected request')
  const code = url.searchParams.get('filter')!.match(/\d{6}/)![0]
  const data = rows(code)
  return Response.json({
    success: true,
    result: { pages: 1, count: data.length, data },
  })
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
export function quoteBytes() {
  // GB18030 bytes for the source name; tests never query the network.
  const [head, tail] = quoteText('601939', 'NAME').split('NAME')
  return new Uint8Array([
    ...new TextEncoder().encode(head),
    0xbd,
    0xa8,
    0xc9,
    0xe8,
    0xd2,
    0xf8,
    0xd0,
    0xd0,
    ...new TextEncoder().encode(tail),
  ])
}
