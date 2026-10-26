import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreListingBand } from '../src/features/dividends/PreListingBand'
import { describe, expect, it, vi } from 'vitest'
import { fetchListing } from '../worker/providers/listing'
import { createApp } from '../worker/app'
import { now, searchResponse } from './helpers'

const company = { code: '600941', market: 'SH', name: '中国移动' } as const
function listingResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    success: true,
    result: {
      data: [
        {
          SECUCODE: '600941.SH',
          SECURITY_CODE: '600941',
          LISTING_DATE: '2022-01-05 00:00:00',
          ...overrides,
        },
      ],
    },
  })
}

describe('market-specific listing date', () => {
  it('requests the exact security and normalizes its listing date', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('filter')).toBe('(SECUCODE="600941.SH")')
      expect(url.searchParams.get('columns')).toBe(
        'SECUCODE,SECURITY_CODE,LISTING_DATE',
      )
      return listingResponse()
    })
    expect(await fetchListing(fetcher, company, now)).toEqual({
      listingDate: '2022-01-05',
      fetchedAt: now.toISOString(),
    })
  })
  it.each([
    { SECUCODE: '00941.HK' },
    { SECURITY_CODE: '600000' },
    { LISTING_DATE: '2022-02-30' },
  ])('rejects a mismatched market/code or invalid date: %j', async (row) => {
    await expect(
      fetchListing(async () => listingResponse(row), company, now),
    ).rejects.toThrow()
  })
  it('preserves an unknown date instead of inferring one', async () => {
    expect(
      (
        await fetchListing(
          async () => listingResponse({ LISTING_DATE: null }),
          company,
          now,
        )
      ).listingDate,
    ).toBeNull()
  })
  it.each([
    { success: false, code: 9201, result: {} },
    { success: false, code: 500, result: null },
    { success: true, code: 9201, result: null },
  ])(
    'does not treat other failures or malformed replies as empty data: %j',
    async (body) => {
      await expect(
        fetchListing(async () => Response.json(body), company, now),
      ).rejects.toThrow()
    },
  )
  it('returns and caches an explicit empty result, then rechecks after expiry', async () => {
    let clock = now
    const entries = new Map<string, Response>()
    const cache = {
      match: async (key: Request) => entries.get(key.url)?.clone(),
      put: async (key: Request, value: Response) => {
        entries.set(key.url, value.clone())
      },
    }
    const source = vi.fn(async () =>
      Response.json({ success: false, code: 9201, result: null }),
    )
    const app = createApp({
      fetcher: async (input) =>
        String(input).includes('searchapi')
          ? searchResponse([company])
          : source(),
      cache,
      now: () => clock,
    })
    const first = await app.request('/api/companies/600941/listing')
    expect(first.status).toBe(200)
    expect((await first.json()).data).toEqual({ listingDate: null })
    const second = await (
      await app.request('/api/companies/600941/listing')
    ).json()
    expect(second.data).toEqual({ listingDate: null })
    expect(second.meta.cache).toBe('hit')
    expect(source).toHaveBeenCalledTimes(1)
    clock = new Date(now.getTime() + 86401_000)
    source.mockImplementation(async () => listingResponse())
    const refreshed = await (
      await app.request('/api/companies/600941/listing')
    ).json()
    expect(refreshed.data.listingDate).toBe('2022-01-05')
    expect(refreshed.meta.cache).toBe('miss')
    expect(source).toHaveBeenCalledTimes(2)
  })
  it('exposes listing metadata independently of dividend requests and caches successful dates', async () => {
    const entries = new Map<string, Response>()
    const cache = {
      match: async (key: Request) => entries.get(key.url)?.clone(),
      put: async (key: Request, value: Response) => {
        entries.set(key.url, value.clone())
      },
    }
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('searchapi')
        ? searchResponse([company])
        : listingResponse(),
    )
    const app = createApp({ fetcher, cache, now: () => now })
    expect((await app.request('/api/companies/bad/listing')).status).toBe(400)
    const first = await (
      await app.request('/api/companies/600941/listing')
    ).json()
    expect(first.data).toEqual({ listingDate: '2022-01-05' })
    const second = await (
      await app.request('/api/companies/600941/listing')
    ).json()
    expect(second.meta.cache).toBe('hit')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('returns a failure when the source fails, without inventing an empty date', async () => {
    const app = createApp({
      fetcher: async (input) => {
        if (String(input).includes('searchapi'))
          return searchResponse([company])
        throw new Error('offline')
      },
    })
    expect((await app.request('/api/companies/600941/listing')).status).toBe(
      503,
    )
  })
})

describe('independent pre-listing background', () => {
  function render(years: number[], listingDate?: string | null) {
    return renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(PreListingBand, {
          years,
          listingDate,
          step: 100,
          x: 40,
          y: 24,
          height: 240,
        }),
      ),
    )
  }
  it('covers 2021 for a 2022 listing, independent of fiscal-year dividend records', () => {
    const html = render(
      [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
      '2022-01-05',
    )
    expect(html).toContain('width="600" height="240"')
    expect(html).toContain('未上市')
    // The same 2021 column stays shaded in the five-year range.
    expect(render([2021, 2022, 2023, 2024, 2025], '2022-01-05')).toContain(
      'width="100" height="240"',
    )
  })
  it.each([null, undefined, '2010-01-01', '2021-01-01'])(
    'does not shade unknown dates or years starting with/after listing: %s',
    (date) =>
      expect(render([2021, 2022, 2023, 2024, 2025], date)).not.toContain(
        'pre-listing-band',
      ),
  )
})
