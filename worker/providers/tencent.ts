import { SourceDataError } from './errors'
import type { Company, Issue, QuoteItem } from '../../shared/api'
import { InvalidAmount, decimal, units } from '../../shared/money'
import { date, readBytes, request, type Fetcher } from './http'
export function parseQuotes(
  body: string,
  fetchedAt: string,
  companies: Company[],
): QuoteItem[] {
  const matches = [...body.matchAll(/v_((?:sh|sz|bj)\d{6})="([^"]*)"/g)]
  return companies.map((company): QuoteItem => {
    const { code, market } = company
    const symbol = `${market.toLowerCase()}${code}`
    const rows = matches.filter((match) => match[1] === symbol)
    if (rows.length !== 1)
      return {
        code,
        quote: null,
        error: { code: 'QUOTE_UNAVAILABLE' },
      }
    const fields = rows[0][2].split('~')
    if (fields.length < 31 || fields[2] !== code || !fields[1]?.trim())
      return {
        code,
        quote: null,
        error: { code: 'INVALID_QUOTE' },
      }
    const issues: Issue[] = []
    let price: string | null = null,
      quoteTime: string | null = null
    try {
      const value = units(fields[3])
      if (value <= 0n || value % 1_000_000n !== 0n)
        throw new SourceDataError('tencent', 'Invalid price')
      price = decimal(value)
    } catch (error) {
      if (
        !(error instanceof SourceDataError) &&
        !(error instanceof InvalidAmount)
      )
        throw error
      issues.push({ code: 'INVALID_PRICE' })
    }
    try {
      const stamp = fields[30]
      if (
        !/^\d{14}$/.test(stamp) ||
        +stamp.slice(8, 10) > 23 ||
        +stamp.slice(10, 12) > 59 ||
        +stamp.slice(12, 14) > 59
      )
        throw new SourceDataError('tencent', 'Invalid time')
      const day = date(
        `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
        'tencent',
      )
      const time = `${day}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}+08:00`
      if (Date.parse(time) > Date.parse(fetchedAt) + 60_000)
        throw new SourceDataError('tencent', 'Future quote')
      quoteTime = time
    } catch (error) {
      if (!(error instanceof SourceDataError)) throw error
      issues.push({ code: 'INVALID_QUOTE_TIME' })
    }
    return {
      code,
      quote: {
        code,
        market,
        name: fields[1].trim(),
        currency: 'CNY',
        price,
        quoteTime,
        issues,
      },
      error: null,
    }
  })
}
export async function fetchQuotes(
  fetcher: Fetcher,
  now: Date,
  companies: Company[],
) {
  const response = await request(
    fetcher,
    `https://qt.gtimg.cn/q=${companies.map(({ market, code }) => `${market.toLowerCase()}${code}`).join(',')}`,
    AbortSignal.timeout(5000),
    5000,
    'tencent',
  )
  const bytes = await readBytes(response, 'tencent')
  const decoder = new TextDecoder('gb18030', { fatal: true, ignoreBOM: false })
  let text: string
  try {
    text = decoder.decode(bytes)
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    throw new SourceDataError('tencent', 'Invalid quote encoding', {
      cause: error,
    })
  }
  return {
    items: parseQuotes(text, now.toISOString(), companies),
    fetchedAt: now.toISOString(),
  }
}
