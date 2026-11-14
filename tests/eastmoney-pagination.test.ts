import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../worker/app'
import { fetchDividends } from '../worker/providers/eastmoney'
import { fetchAllocations } from '../worker/providers/allocations'
import type { Fetcher } from '../worker/providers/http'
import { SourceError } from '../worker/providers/errors'
import { bankCompanies, bankIdentity, now } from './support/context'
import {
  dividendRow,
  searchResponse,
  failedResponse,
  allocationRow,
  eastmoneyPage as page,
} from './support/providers'

const sources = [
  {
    name: 'dividends',
    row: () => dividendRow(),
    load: async (fetcher: Fetcher) => {
      const value = await fetchDividends(fetcher, bankIdentity(), now)
      return {
        complete: value.completeFetch,
        records: value.records.length,
        pages: value.pagesRead,
        issues: value.issues,
      }
    },
  },
  {
    name: 'allocations',
    row: allocationRow,
    load: async (fetcher: Fetcher) => {
      const value = await fetchAllocations(fetcher, bankIdentity(), now)
      return {
        complete: value.coverage.completeFetch,
        records: value.years.length,
        pages: value.coverage.pagesRead,
        issues: value.issues,
      }
    },
  },
]

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe.each(sources)('$name pagination contract', ({ name, row, load }) => {
  it('rejects zero pages with nonempty records without caching the result', async () => {
    const entries = new Map<string, Response>()
    const source = vi.fn(async () => page([row()], 0, 1))
    const app = createApp({
      now: () => now,
      cache: {
        match: async (key) => entries.get(key.url)?.clone(),
        put: async (key, value) => {
          entries.set(key.url, value.clone())
        },
      },
      fetcher: async (input) =>
        String(input).includes('searchapi')
          ? searchResponse(bankCompanies)
          : source(),
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await app.request(`/api/companies/601939/${name}`)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: { code: 'UPSTREAM_UNAVAILABLE' },
      })
    }
    expect(source).toHaveBeenCalledTimes(2)
    expect([...entries.keys()].some((key) => key.includes(`/${name}/`))).toBe(
      false,
    )
  })
  it.each([
    () => page([], 0, 0),
    () => Response.json({ success: false, code: 9201, result: null }),
  ])('accepts an explicit empty history', async (response) => {
    expect(await load(async () => response())).toEqual({
      complete: true,
      records: 0,
      pages: 1,
      issues: [],
    })
  })
  it('retains partial data when a later page is malformed JSON', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([row()], 2, 2))
      .mockResolvedValueOnce(new Response('invalid JSON'))
    const result = await load(fetcher)
    expect(result).toMatchObject({ complete: false, records: 1, pages: 1 })
    expect(result.issues).toContainEqual({ code: 'INCOMPLETE_PAGINATION' })
    expect(result.issues).toContainEqual({ code: 'COUNT_MISMATCH' })
  })
  it('does not turn an internal pagination-processing error into partial success', async () => {
    const error = new ReferenceError('programming bug')
    const response = new Response()
    // Inject a failure when the parsed result is inspected, outside the body-read boundary.
    vi.spyOn(response, 'json').mockResolvedValue({
      success: true,
      result: {
        data: [row()],
        count: 2,
        get pages() {
          throw error
        },
      },
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([row()], 2, 2))
      .mockResolvedValueOnce(response)
    await expect(load(fetcher)).rejects.toBe(error)
  })
  it.each(['request', 'body'])(
    'serves partial data without caching it after a later-page %s disconnect',
    async (boundary) => {
      const entries = new Map<string, Response>()
      const source = vi.fn(async (input: string | URL | Request) => {
        if (new URL(String(input)).searchParams.get('pageNumber') === '1')
          return page([row()], 2, 2)
        const error = new Error('Network connection lost.')
        if (boundary === 'request') throw error
        return failedResponse(error)
      })
      const app = createApp({
        now: () => now,
        cache: {
          match: async (key) => entries.get(key.url)?.clone(),
          put: async (key, value) => {
            entries.set(key.url, value.clone())
          },
        },
        fetcher: async (input) =>
          String(input).includes('searchapi')
            ? searchResponse(bankCompanies)
            : source(input),
      })
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await app.request(`/api/companies/601939/${name}`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.coverage.completeFetch).toBe(false)
        expect(body.data.coverage.returnedRecords).toBe(1)
        expect(body.meta.cache).toBe('miss')
        expect(body.meta.issues).toContainEqual({
          code: 'INCOMPLETE_PAGINATION',
        })
        expect(body.meta.issues).toContainEqual({ code: 'COUNT_MISMATCH' })
        if (name === 'dividends')
          expect(body.data.referenceDividend.cashPerShare).toBeNull()
      }
      expect(source).toHaveBeenCalledTimes(4)
      expect([...entries.keys()].some((key) => key.includes(`/${name}/`))).toBe(
        false,
      )
    },
  )
  it('rejects malformed JSON on the first page as a source error', async () => {
    await expect(
      load(async () => new Response('invalid JSON')),
    ).rejects.toBeInstanceOf(SourceError)
  })
  it('does not accept changing pagination or a later empty-result code', async () => {
    for (const second of [
      page([row()], 3, 3),
      Response.json({ success: false, code: 9201, result: null }),
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(page([row()], 2, 2))
        .mockResolvedValueOnce(second)
      const result = await load(fetcher)
      expect(result).toMatchObject({ complete: false, records: 1 })
      expect(result.issues).toContainEqual({ code: 'INCOMPLETE_PAGINATION' })
    }
  })
  it('bounds pagination at twenty requests and reports incomplete coverage', async () => {
    const fetcher = vi.fn(async () => page([row()], 21, 21))
    const result = await load(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(20)
    expect(result).toMatchObject({ complete: false, pages: 20 })
    expect(result.issues).toContainEqual({ code: 'INCOMPLETE_PAGINATION' })
  })
})
