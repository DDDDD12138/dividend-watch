import { describe, expect, it, vi } from 'vitest'
import { fetchProfile } from '../worker/providers/profile'
import { createApp } from '../worker/app'
import { now, searchResponse } from './helpers'

const company = { code: '600941', market: 'SH', name: '中国移动' } as const
function profileResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    success: true,
    result: {
      data: [
        {
          SECUCODE: '600941.SH',
          SECURITY_CODE: '600941',
          LISTING_DATE: '2022-01-05 00:00:00',
          MAIN_BUSINESS: '通信和信息服务',
          ...overrides,
        },
      ],
    },
  })
}

describe('market-specific company profile', () => {
  it.each([null, '', '  ', undefined])(
    'preserves missing business text without replacing it: %s',
    async (text) => {
      const result = await fetchProfile(
        async () => profileResponse({ MAIN_BUSINESS: text }),
        company,
        now,
      )
      expect(result.mainBusiness).toBeNull()
      expect(result.listingDate).toBe('2022-01-05')
    },
  )
  it('returns the source wording without summarizing or replacing it', async () => {
    const result = await fetchProfile(
      async () =>
        profileResponse({
          MAIN_BUSINESS: '  原始主营业务,不自动改写。  ',
          LISTING_DATE: null,
        }),
      company,
      now,
    )
    expect(result.mainBusiness).toBe('原始主营业务,不自动改写。')
    expect(result.listingDate).toBeNull()
  })
  it('requests the exact security and normalizes its listing date', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('filter')).toBe('(SECUCODE="600941.SH")')
      expect(url.searchParams.get('columns')).toBe(
        'SECUCODE,SECURITY_CODE,LISTING_DATE,MAIN_BUSINESS',
      )
      return profileResponse()
    })
    expect(await fetchProfile(fetcher, company, now)).toEqual({
      company,
      listingDate: '2022-01-05',
      mainBusiness: '通信和信息服务',
      issues: [],
      fetchedAt: now.toISOString(),
    })
  })
  it.each([
    { SECUCODE: '00941.HK' },
    { SECURITY_CODE: '600000' },
    { LISTING_DATE: '2022-02-30' },
  ])(
    'rejects a mismatched identity or invalid profile field: %j',
    async (row) => {
      await expect(
        fetchProfile(async () => profileResponse(row), company, now),
      ).rejects.toThrow()
    },
  )
  it.each([123, false, {}, []])(
    'isolates malformed business text while preserving a valid listing date: %j',
    async (business) => {
      const result = await fetchProfile(
        async () => profileResponse({ MAIN_BUSINESS: business }),
        company,
        now,
      )
      expect(result.listingDate).toBe('2022-01-05')
      expect(result.mainBusiness).toBeNull()
      expect(result.issues).toEqual([
        { code: 'INVALID_MAIN_BUSINESS', field: 'MAIN_BUSINESS' },
      ])
    },
  )
  it('serves and caches partial profile data with its field issue, then refreshes after expiry', async () => {
    let clock = now
    const entries = new Map<string, Response>()
    const cache = {
      match: async (key: Request) => entries.get(key.url)?.clone(),
      put: async (key: Request, value: Response) => {
        entries.set(key.url, value.clone())
      },
    }
    const source = vi.fn(async () => profileResponse({ MAIN_BUSINESS: 123 }))
    const app = createApp({
      fetcher: async (input) =>
        String(input).includes('searchapi')
          ? searchResponse([company])
          : source(),
      cache,
      now: () => clock,
    })
    const first = await app.request('/api/companies/600941/profile')
    expect(first.status).toBe(200)
    const body = await first.json()
    expect(body.data.listingDate).toBe('2022-01-05')
    expect(body.data.mainBusiness).toBeNull()
    expect(body.meta.issues).toEqual([
      { code: 'INVALID_MAIN_BUSINESS', field: 'MAIN_BUSINESS' },
    ])
    const cached = await (
      await app.request('/api/companies/600941/profile')
    ).json()
    expect(cached.meta.cache).toBe('hit')
    expect(cached.meta.issues).toEqual(body.meta.issues)
    expect(source).toHaveBeenCalledTimes(1)
    clock = new Date(now.getTime() + 86401_000)
    source.mockImplementation(async () => profileResponse())
    const refreshed = await (
      await app.request('/api/companies/600941/profile')
    ).json()
    expect(refreshed.data.mainBusiness).toBe('通信和信息服务')
    expect(refreshed.meta.issues).toEqual([])
    expect(source).toHaveBeenCalledTimes(2)
  })
  it('preserves an unknown date instead of inferring one', async () => {
    expect(
      (
        await fetchProfile(
          async () => profileResponse({ LISTING_DATE: null }),
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
        fetchProfile(async () => Response.json(body), company, now),
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
    const first = await app.request('/api/companies/600941/profile')
    expect(first.status).toBe(200)
    expect((await first.json()).data).toEqual({
      company,
      listingDate: null,
      mainBusiness: null,
    })
    const second = await (
      await app.request('/api/companies/600941/profile')
    ).json()
    expect(second.data).toEqual({
      company,
      listingDate: null,
      mainBusiness: null,
    })
    expect(second.meta.cache).toBe('hit')
    expect(source).toHaveBeenCalledTimes(1)
    clock = new Date(now.getTime() + 86401_000)
    source.mockImplementation(async () => profileResponse())
    const refreshed = await (
      await app.request('/api/companies/600941/profile')
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
        : profileResponse(),
    )
    const app = createApp({ fetcher, cache, now: () => now })
    expect((await app.request('/api/companies/bad/profile')).status).toBe(400)
    const first = await (
      await app.request('/api/companies/600941/profile')
    ).json()
    expect(first.data).toEqual({
      company,
      listingDate: '2022-01-05',
      mainBusiness: '通信和信息服务',
    })
    const second = await (
      await app.request('/api/companies/600941/profile')
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
    expect((await app.request('/api/companies/600941/profile')).status).toBe(
      503,
    )
  })
})
