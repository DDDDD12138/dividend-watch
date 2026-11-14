import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../worker/app'
import * as history from '../worker/services/history'
import * as money from '../shared/money'
import { now } from './support/context'
import {
  apiFetcher,
  quoteText,
  searchResponse,
  failedResponse,
} from './support/providers'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('API error contract', () => {
  it('does not treat internal field-parser errors as malformed source data', async () => {
    vi.spyOn(money, 'units').mockImplementation(() => {
      throw new TypeError('field parser bug')
    })
    const response = await createApp({
      fetcher: apiFetcher,
      now: () => now,
    }).request('/api/companies/601939/dividends')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } })
  })
  it.each([
    ['/api/companies?q=', 400, 'INVALID_QUERY'],
    ['/api/quotes?codes=bad', 400, 'INVALID_CODES'],
    [
      '/api/quotes?codes=' +
        Array.from({ length: 51 }, (_, index) => String(600000 + index)).join(
          ',',
        ),
      400,
      'INVALID_CODES',
    ],
    ['/api/companies/bad/profile', 400, 'INVALID_CODE'],
    ['/api/companies/bad/dividends', 400, 'INVALID_CODE'],
    ['/api/companies/bad/allocations', 400, 'INVALID_CODE'],
    ['/api/companies/999999/profile', 404, 'UNSUPPORTED_COMPANY'],
    ['/api/companies/999999/allocations', 404, 'UNSUPPORTED_COMPANY'],
    ['/api/unknown', 404, 'NOT_FOUND'],
  ])('returns only the error code for %s', async (path, status, code) => {
    const app = createApp({ fetcher: apiFetcher })
    const response = await app.request(path)
    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: { code } })
  })
  it.each([
    '/api/companies?q=银行',
    '/api/quotes?codes=601939',
    '/api/companies/601939/profile',
    '/api/companies/601939/dividends',
    '/api/companies/601939/allocations',
  ])(
    'returns 500 for unexpected errors rather than disguising them as upstream failures: %s',
    async (path) => {
      const failure = new ReferenceError('private implementation details')
      const fetcher = vi.fn(apiFetcher)
      const app = createApp({
        fetcher,
        now: () => {
          throw failure
        },
      })
      const response = await app.request(path)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { code: 'INTERNAL_ERROR' },
      })
      expect(fetcher).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(
        'API request failed',
        expect.objectContaining({
          path: path.split('?')[0],
          type: 'ReferenceError',
          stack: failure.stack,
        }),
      )
    },
  )
  it('also propagates an error in the business calculation after source data has loaded', async () => {
    vi.spyOn(history, 'buildHistory').mockImplementation(() => {
      throw new Error('calculation bug')
    })
    const response = await createApp({
      fetcher: apiFetcher,
      now: () => now,
    }).request('/api/companies/601939/dividends')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } })
  })
  it.each([
    () => {
      throw new Error('Network connection lost.')
    },
    () => {
      throw new Error('internal error')
    },
    () => {
      throw new TypeError('private network details')
    },
    () => new Response(null, { status: 502 }),
    () => new Response('invalid JSON'),
    () => failedResponse(new Error('Network connection lost.')),
  ])(
    'classifies expected source failures and logs context only on the server',
    async (source) => {
      const response = await createApp({
        fetcher: async () => source(),
      }).request('/api/companies?q=银行')
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: { code: 'UPSTREAM_UNAVAILABLE' },
      })
      expect(console.error).toHaveBeenCalledWith(
        'API request failed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/companies',
          source: 'eastmoney',
        }),
      )
    },
  )
  it('preserves partial company failures without server-generated messages', async () => {
    const app = createApp({
      now: () => now,
      fetcher: async (input) => {
        const url = new URL(String(input))
        if (url.hostname === 'qt.gtimg.cn')
          return new Response(quoteText('601939', 'CCB'))
        if (url.searchParams.get('input') === '601398')
          throw new Error('network down')
        return apiFetcher(input)
      },
    })
    const response = await app.request(
      '/api/quotes?codes=601939,601398,999999,601939',
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.map((item: { code: string }) => item.code)).toEqual([
      '601939',
      '601398',
      '999999',
    ])
    expect(body.data[1].error).toEqual({ code: 'COMPANY_UNAVAILABLE' })
    expect(body.data[2].error).toEqual({ code: 'UNSUPPORTED_COMPANY' })
  })
  it.each([
    () => {
      throw new Error('Network connection lost.')
    },
    () => failedResponse(new Error('Network connection lost.')),
  ])(
    'logs Tencent request and body failures under the same logical source',
    async (fail) => {
      const app = createApp({
        fetcher: async (input) =>
          new URL(String(input)).hostname === 'qt.gtimg.cn'
            ? fail()
            : apiFetcher(input),
        now: () => now,
      })
      const response = await app.request('/api/quotes?codes=601939')
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: { code: 'UPSTREAM_UNAVAILABLE' },
      })
      expect(console.error).toHaveBeenCalledWith(
        'API request failed',
        expect.objectContaining({
          path: '/api/quotes',
          source: 'tencent',
        }),
      )
    },
  )
  it('returns 503 when all identities fail and at least one is unavailable rather than unsupported', async () => {
    const app = createApp({
      fetcher: async (input) => {
        if (String(input).includes('601939')) throw new Error('offline')
        return searchResponse([])
      },
    })
    const response = await app.request('/api/quotes?codes=601939,999999')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    })
  })
})
