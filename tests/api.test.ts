import { describe, expect, it, vi } from 'vitest'
import type {
  ApiResponse,
  Company,
  DividendHistory,
  QuoteItem,
} from '../shared/api'
import { createApp } from '../worker/app'
import { SourceCache, type ResponseCache } from '../worker/services/cache'
import {
  fixtureFetcher,
  now,
  quoteBytes,
  quoteText,
  searchResponse,
  bankCompanies,
} from './helpers'
class MemoryCache implements ResponseCache {
  entries = new Map<string, Response>()
  async match(key: Request) {
    return this.entries.get(key.url)?.clone()
  }
  async put(key: Request, value: Response) {
    this.entries.set(key.url, value.clone())
  }
}
describe('API contracts', () => {
  const app = createApp({ fetcher: fixtureFetcher, now: () => now })
  it('retains health response', async () => {
    expect(await (await app.request('/api/health')).json()).toEqual({
      status: 'ok',
      service: 'dividend-watch',
    })
  })
  it.each([
    '/api/quotes',
    '/api/quotes?codes=bad',
    '/api/quotes?codes=601939,',
    '/api/quotes?codes=601939&codes=601398',
    '/api/companies/xx/dividends',
    '/api/companies',
    '/api/companies?q= ',
    '/api/companies?q=a&q=b',
    '/api/companies?q=' + 'x'.repeat(51),
  ])('rejects invalid input %s', async (path) => {
    expect((await app.request(path)).status).toBe(400)
  })
  it.each([
    '/api/missing',
    '/api/companies/999999/dividends',
    '/api/quotes?codes=999999',
  ])('reports unavailable identities and paths %s', async (path) => {
    expect((await app.request(path)).status).toBe(404)
  })
  it('returns source history without fake payout fields', async () => {
    const response = await app.request('/api/companies/601939/dividends')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = (await response.json()) as ApiResponse<DividendHistory>
    expect(body.data.referenceDividend?.cashPerShare).toBe('0.3887')
    expect(body.meta.source).toBe('eastmoney')
    expect(body.meta.issues).toEqual([])
    expect(
      body.data.records.every(
        (r) => r.payDate === null && r.announcementUrl === null,
      ),
    ).toBe(true)
    expect(body.data).not.toHaveProperty('complete')
    expect(body.data.records[0]).not.toHaveProperty('stage')
  })
  it('returns search identities from Eastmoney instead of fetching every quote', async () => {
    const fetcher = vi.fn(fixtureFetcher)
    const app = createApp({ fetcher })
    const body = (await (
      await app.request('/api/companies?q=建设')
    ).json()) as ApiResponse<Company[]>
    expect(body.data).toEqual([bankCompanies[0]])
    expect(body.meta.source).toBe('eastmoney')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain(
      'searchapi.eastmoney.com',
    )
  })
  it('returns 503 rather than fixtures or false not-found when a source fails', async () => {
    const failed = createApp({
      fetcher: async () => {
        throw new Error('upstream details')
      },
    })
    for (const path of [
      '/api/companies?q=银行',
      '/api/quotes?codes=601939',
      '/api/companies/601939/dividends',
    ]) {
      const response = await failed.request(path)
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain('upstream details')
    }
  })
  it('requests only resolved symbols and preserves per-company failures', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.hostname === 'qt.gtimg.cn') {
        expect(url.pathname.slice(3)).toBe('sh601398,sh601939')
        return new Response(quoteBytes())
      }
      return fixtureFetcher(input)
    })
    const app = createApp({ fetcher, now: () => now })
    const body = (await (
      await app.request('/api/quotes?codes=601939,601398,999999')
    ).json()) as ApiResponse<QuoteItem[]>
    expect(body.data[0].quote?.name).toBe('建设银行')
    expect(body.data[0].quote?.market).toBe('SH')
    expect(body.data[1].error?.code).toBe('QUOTE_UNAVAILABLE')
    expect(body.data[2].error?.code).toBe('UNSUPPORTED_COMPANY')
  })
  it.each([
    ['600900', 'SH'],
    ['000001', 'SZ'],
    ['300750', 'SZ'],
    ['920002', 'BJ'],
  ] as const)(
    'accepts %s through market identity, without a stock allowlist',
    async (code, market) => {
      const fetcher = vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input))
        if (url.hostname === 'searchapi.eastmoney.com')
          return searchResponse([{ code, name: 'SourceName', market }])
        if (url.hostname === 'qt.gtimg.cn') {
          expect(url.pathname.slice(3)).toBe(`${market.toLowerCase()}${code}`)
          return new Response(
            quoteText(
              code,
              'SourceName',
              '10',
              '20261019161456',
              market.toLowerCase(),
            ),
          )
        }
        expect(url.searchParams.get('filter')).toBe(
          `(SECUCODE="${code}.${market}")`,
        )
        return Response.json({ success: false, code: 9201, result: null })
      })
      const app = createApp({ fetcher, now: () => now })
      expect((await app.request(`/api/quotes?codes=${code}`)).status).toBe(200)
      const response = await app.request(`/api/companies/${code}/dividends`)
      const body = (await response.json()) as ApiResponse<DividendHistory>
      expect(response.status).toBe(200)
      expect(body.data.records).toEqual([])
      expect(body.data.referenceDividend).toBeNull()
    },
  )
  it('keeps company, quotes and dividend caches independent', async () => {
    const fetcher = vi.fn(fixtureFetcher)
    const app = createApp({ fetcher, cache: new MemoryCache(), now: () => now })
    await app.request('/api/companies/601939/dividends')
    expect((await app.request('/api/quotes?codes=601939')).status).toBe(503)
    const body = (await (
      await app.request('/api/companies/601939/dividends')
    ).json()) as ApiResponse<DividendHistory>
    expect(body.meta.cache).toBe('hit')
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes('datacenter-web'),
      ),
    ).toHaveLength(1)
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('searchapi')),
    ).toHaveLength(1)
  })
  it('normalizes quote cache keys but returns items in requested order', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      new URL(String(input)).hostname === 'qt.gtimg.cn'
        ? new Response(quoteText('601939', 'CCB') + quoteText('601398', 'ICBC'))
        : fixtureFetcher(input),
    )
    const app = createApp({ fetcher, cache: new MemoryCache(), now: () => now })
    await app.request('/api/quotes?codes=601939,601398')
    const body = (await (
      await app.request('/api/quotes?codes=601398,601939')
    ).json()) as ApiResponse<QuoteItem[]>
    expect(body.meta.cache).toBe('hit')
    expect(body.data.map((item) => item.code)).toEqual(['601398', '601939'])
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('qt.gtimg')),
    ).toHaveLength(1)
  })
  it('does not present rejected dividend identity as a successful empty history', async () => {
    const app = createApp({
      now: () => now,
      fetcher: async (input) =>
        new URL(String(input)).hostname === 'searchapi.eastmoney.com'
          ? fixtureFetcher(input)
          : Response.json({
              success: true,
              result: {
                pages: 1,
                count: 1,
                data: [{ SECURITY_CODE: '600000' }],
              },
            }),
    })
    expect((await app.request('/api/companies/601939/dividends')).status).toBe(
      503,
    )
  })
})
describe('cache TTL', () => {
  it('expires and tolerates cache failures', async () => {
    let time = 0
    const cache = new SourceCache(new MemoryCache(), () => new Date(time)),
      load = vi.fn(async () => ({ value: '1' }))
    expect((await cache.get('source', 60, load, () => true)).hit).toBe(false)
    time = 59_000
    expect((await cache.get('source', 60, load, () => true)).hit).toBe(true)
    time = 60_000
    expect((await cache.get('source', 60, load, () => true)).hit).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
    const broken = new SourceCache({
      match: async () => {
        throw new Error()
      },
      put: async () => {
        throw new Error()
      },
    })
    expect((await broken.get('source', 60, load, () => true)).value).toEqual({
      value: '1',
    })
  })
  it('does not cache incomplete or failed source responses', async () => {
    const cache = new SourceCache(new MemoryCache()),
      load = vi.fn(async () => ({ complete: false }))
    await cache.get('source', 60, load, () => false)
    await cache.get('source', 60, load, () => false)
    expect(load).toHaveBeenCalledTimes(2)
    const fail = vi.fn(async () => {
      throw new Error('failed')
    })
    await expect(cache.get('bad', 60, fail, () => true)).rejects.toThrow()
    await expect(cache.get('bad', 60, fail, () => true)).rejects.toThrow()
    expect(fail).toHaveBeenCalledTimes(2)
  })
})

it('bounds identity resolution concurrency within a batch', async () => {
  let active = 0,
    peak = 0
  const app = createApp({
    fetcher: async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return searchResponse([])
    },
  })
  const codes = Array.from({ length: 12 }, (_, index) => String(600000 + index))
  expect(
    (await app.request(`/api/quotes?codes=${codes.join(',')}`)).status,
  ).toBe(404)
  expect(peak).toBe(5)
})
