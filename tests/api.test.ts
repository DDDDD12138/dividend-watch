import { describe, expect, it, vi } from 'vitest'
import type {
  ApiResponse,
  Company,
  DividendHistory,
  QuoteItem,
} from '../shared/api'
import { createApp } from '../worker/app'
import { SourceCache, type ResponseCache } from '../worker/services/cache'
import { fixtureFetcher, now, quoteBytes } from './helpers'
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
    '/api/companies?q=' + 'x'.repeat(51),
  ])('rejects invalid input %s', async (path) => {
    expect((await app.request(path)).status).toBe(400)
  })
  it.each([
    '/api/missing',
    '/api/companies/600900/dividends',
    '/api/quotes?codes=600900',
  ])('reports unsupported paths/codes %s', async (path) => {
    expect((await app.request(path)).status).toBe(404)
  })
  it('returns the source-specific history with no fake payout fields', async () => {
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
  it('returns 503 rather than test fixtures when a source fails', async () => {
    const failed = createApp({
      fetcher: async () => {
        throw new Error('upstream details')
      },
    })
    for (const path of [
      '/api/companies',
      '/api/quotes?codes=601939',
      '/api/companies/601939/dividends',
    ]) {
      const response = await failed.request(path)
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain('upstream details')
    }
  })
  it('uses dynamically fetched names and reports partial company availability', async () => {
    const fetcher = vi.fn(async () => new Response(quoteBytes()))
    const live = createApp({ fetcher, now: () => now })
    const response = await live.request('/api/companies?q=建设')
    const body = (await response.json()) as ApiResponse<Company[]>
    expect(body.data).toEqual([{ code: '601939', name: '建设银行' }])
    expect(body.meta.issues).toHaveLength(2)
    const quote = (await (
      await live.request('/api/quotes?codes=601939,601398,600900')
    ).json()) as ApiResponse<QuoteItem[]>
    expect(quote.data[0].quote?.price).toBe('11.45')
    expect(quote.data[1].error).not.toBeNull()
    expect(quote.data[2].error?.code).toBe('UNSUPPORTED_COMPANY')
  })
  it('keeps source caches independent and does not re-fetch dividends on quote errors', async () => {
    const fetcher = vi.fn(fixtureFetcher),
      cache = new MemoryCache()
    const cached = createApp({ fetcher, cache, now: () => now })
    await cached.request('/api/companies/601939/dividends')
    expect((await cached.request('/api/quotes?codes=601939')).status).toBe(503)
    const response = await cached.request('/api/companies/601939/dividends')
    const body = (await response.json()) as ApiResponse<DividendHistory>
    expect(body.meta.cache).toBe('hit')
    expect(fetcher).toHaveBeenCalledTimes(2)
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

it('does not present rejected stock records as an empty successful history', async () => {
  const app = createApp({
    now: () => now,
    fetcher: async () =>
      Response.json({
        success: true,
        result: { pages: 1, count: 1, data: [{ SECURITY_CODE: '600000' }] },
      }),
  })
  expect((await app.request('/api/companies/601939/dividends')).status).toBe(
    503,
  )
})
