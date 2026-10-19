import type { Issue, QuoteItem } from '../../shared/api'
import { decimal, units } from '../../shared/money'
import { supportedSymbols } from '../scope'
import { date, request, type Fetcher } from './http'
export function parseQuotes(body: string, fetchedAt: string): QuoteItem[] {
  const matches = [...body.matchAll(/v_(sh\d{6})="([^"]*)"/g)]
  return supportedSymbols.map((symbol): QuoteItem => {
    const code = symbol.slice(2)
    const rows = matches.filter((match) => match[1] === symbol)
    if (rows.length !== 1)
      return {
        code,
        quote: null,
        error: { code: 'QUOTE_UNAVAILABLE', message: '来源记录缺失或重复' },
      }
    const fields = rows[0][2].split('~')
    if (fields.length < 31 || fields[2] !== code || !fields[1]?.trim())
      return {
        code,
        quote: null,
        error: { code: 'INVALID_QUOTE', message: '来源字段校验失败' },
      }
    const issues: Issue[] = []
    let price: string | null = null,
      quoteTime: string | null = null
    try {
      const value = units(fields[3])
      if (value <= 0n || value % 1_000_000n !== 0n)
        throw new Error('Invalid price')
      price = decimal(value)
    } catch {
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
        throw new Error('Invalid time')
      const day = date(
        `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      )
      const time = `${day}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}+08:00`
      if (Date.parse(time) > Date.parse(fetchedAt) + 60_000)
        throw new Error('Future quote')
      quoteTime = time
    } catch {
      issues.push({ code: 'INVALID_QUOTE_TIME' })
    }
    return {
      code,
      quote: {
        code,
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
export async function fetchQuotes(fetcher: Fetcher, now: Date) {
  const response = await request(
    fetcher,
    `https://qt.gtimg.cn/q=${supportedSymbols.join(',')}`,
    AbortSignal.timeout(5000),
    5000,
  )
  const text = new TextDecoder('gb18030', {
    fatal: true,
    ignoreBOM: false,
  }).decode(await response.arrayBuffer())
  return {
    items: parseQuotes(text, now.toISOString()),
    fetchedAt: now.toISOString(),
  }
}
