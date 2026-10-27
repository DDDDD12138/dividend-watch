import { Hono } from 'hono'
import type {
  ApiResponse,
  AllocationHistory,
  Company,
  CompanyProfile,
  DividendHistory,
  Issue,
  QuoteItem,
} from '../shared/api'
import { fetchQuotes } from './providers/tencent'
import { fetchDividends } from './providers/eastmoney'
import { fetchProfile } from './providers/profile'
import { allocationUrl, fetchAllocations } from './providers/allocations'
import type { Fetcher } from './providers/http'
import { buildHistory } from './services/history'
import { chinaYear } from '../shared/time'
import { SourceCache, type ResponseCache } from './services/cache'
import { companyService, CompanyNotFound } from './services/companies'

export function createApp(
  options: { fetcher?: Fetcher; now?: () => Date; cache?: ResponseCache } = {},
) {
  const now = options.now ?? (() => new Date()),
    fetcher = options.fetcher ?? fetch
  const cache = new SourceCache(options.cache, now)
  const companies = companyService(fetcher, cache, now)
  const app = new Hono()
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', service: 'dividend-watch' }),
  )
  app.get('/api/companies', async (c) => {
    const values = c.req.queries('q') ?? [],
      query = (values[0] ?? '').trim()
    if (values.length !== 1 || !query || query.length > 50)
      return c.json(
        {
          error: {
            code: 'INVALID_QUERY',
            message: '请输入 1–50 字符的公司名称或代码',
          },
        },
        400,
      )
    try {
      const { value, hit } = await companies.search(query)
      const response: ApiResponse<Company[]> = {
        data: value.companies.slice(0, 10),
        meta: {
          source: 'eastmoney',
          fetchedAt: value.fetchedAt,
          cache: hit ? 'hit' : 'miss',
          issues: value.issues,
        },
      }
      return c.json(response)
    } catch {
      return c.json(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: '公司搜索暂不可用' },
        },
        503,
      )
    }
  })
  app.get('/api/quotes', async (c) => {
    const values = c.req.queries('codes') ?? []
    const codes = [
      ...new Set((values[0] ?? '').split(',').map((code) => code.trim())),
    ]
    if (
      values.length !== 1 ||
      codes.length > 50 ||
      codes.some((code) => !/^\d{6}$/.test(code))
    )
      return c.json(
        {
          error: {
            code: 'INVALID_CODES',
            message: '请提供最多 50 个六位股票代码',
          },
        },
        400,
      )
    // Limit identity lookups inside this request; never share Worker request promises globally.
    const identities = new Map<string, Company>(),
      failures = new Map<string, QuoteItem>()
    const budget = AbortSignal.timeout(8000)
    let cursor = 0
    await Promise.all(
      Array.from({ length: Math.min(5, codes.length) }, async () => {
        while (cursor < codes.length) {
          const code = codes[cursor++]
          try {
            identities.set(code, await companies.resolve(code, budget))
          } catch (error) {
            failures.set(code, {
              code,
              quote: null,
              error:
                error instanceof CompanyNotFound
                  ? {
                      code: 'UNSUPPORTED_COMPANY',
                      message: '未找到受支持的 A 股公司',
                    }
                  : {
                      code: 'COMPANY_UNAVAILABLE',
                      message: '公司身份暂不可用',
                    },
            })
          }
        }
      }),
    )
    if (!identities.size) {
      const unsupported = [...failures.values()].every(
        (item) => item.error?.code === 'UNSUPPORTED_COMPANY',
      )
      return c.json(
        {
          error: {
            code: unsupported ? 'UNSUPPORTED_COMPANY' : 'UPSTREAM_UNAVAILABLE',
            message: unsupported
              ? '未找到受支持的 A 股公司'
              : '公司资料暂不可用',
          },
        },
        unsupported ? 404 : 503,
      )
    }
    try {
      const requested = [...identities.values()].sort((a, b) =>
        a.code.localeCompare(b.code),
      )
      const key = requested
        .map(({ market, code }) => `${market}${code}`)
        .join(',')
      const { value, hit } = await cache.get(
        `quotes/${key}`,
        60,
        () => fetchQuotes(fetcher, now(), requested),
        (value) =>
          value.items.every((item) => item.quote && !item.quote.issues.length),
      )
      const data = codes.map(
        (code) =>
          failures.get(code) ?? value.items.find((item) => item.code === code)!,
      )
      if (data.every((item) => !item.quote?.price || !item.quote.quoteTime))
        return c.json(
          { error: { code: 'UPSTREAM_UNAVAILABLE', message: '行情暂不可用' } },
          503,
        )
      const response: ApiResponse<QuoteItem[]> = {
        data,
        meta: {
          source: 'tencent',
          fetchedAt: value.fetchedAt,
          cache: hit ? 'hit' : 'miss',
          issues: data.flatMap((item) =>
            item.error
              ? [{ code: item.error.code, field: item.code }]
              : (item.quote?.issues ?? []),
          ),
        },
      }
      return c.json(response)
    } catch {
      return c.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: '行情暂不可用' } },
        503,
      )
    }
  })
  app.get('/api/companies/:code/profile', async (c) => {
    const code = c.req.param('code')
    if (!/^\d{6}$/.test(code))
      return c.json(
        { error: { code: 'INVALID_CODE', message: '股票代码必须为六位数字' } },
        400,
      )
    try {
      const company = await companies.resolve(code)
      const { value, hit } = await cache.get(
        `profile/${company.market}/${code}`,
        86400,
        () => fetchProfile(fetcher, company, now()),
        () => true,
      )
      const response: ApiResponse<CompanyProfile> = {
        data: {
          company: value.company,
          listingDate: value.listingDate,
          mainBusiness: value.mainBusiness,
        },
        meta: {
          source: 'eastmoney',
          fetchedAt: value.fetchedAt,
          cache: hit ? 'hit' : 'miss',
          issues: value.issues,
        },
      }
      return c.json(response)
    } catch (error) {
      return error instanceof CompanyNotFound
        ? c.json(
            {
              error: {
                code: 'UNSUPPORTED_COMPANY',
                message: '未找到受支持的 A 股公司',
              },
            },
            404,
          )
        : c.json(
            {
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: '公司资料暂不可用',
              },
            },
            503,
          )
    }
  })
  app.get('/api/companies/:code/dividends', async (c) => {
    const code = c.req.param('code')
    if (!/^\d{6}$/.test(code))
      return c.json(
        { error: { code: 'INVALID_CODE', message: '股票代码必须为六位数字' } },
        400,
      )
    let company: Company
    try {
      company = await companies.resolve(code)
    } catch (error) {
      return error instanceof CompanyNotFound
        ? c.json(
            {
              error: {
                code: 'UNSUPPORTED_COMPANY',
                message: '未找到受支持的 A 股公司',
              },
            },
            404,
          )
        : c.json(
            {
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: '公司资料暂不可用',
              },
            },
            503,
          )
    }
    let loaded: Awaited<ReturnType<typeof fetchDividends>>, hit: boolean
    try {
      const cached = await cache.get(
        `dividends/${company.market}/${code}`,
        3600,
        () => fetchDividends(fetcher, company, now()),
        (value) =>
          value.completeFetch &&
          value.records.every((record) => !record.issues.length),
      )
      loaded = cached.value
      hit = cached.hit
    } catch {
      return c.json(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: '分红来源暂不可用' },
        },
        503,
      )
    }
    if (!loaded.completeFetch && !loaded.records.length)
      return c.json(
        {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: '来源未返回可用的分红记录',
          },
        },
        503,
      )
    const issues: Issue[] = [
      ...loaded.issues,
      ...loaded.records.flatMap((record) => record.issues),
    ]
    const response: ApiResponse<DividendHistory> = {
      data: buildHistory(company, loaded, now()),
      meta: {
        source: 'eastmoney',
        fetchedAt: loaded.fetchedAt,
        cache: hit ? 'hit' : 'miss',
        issues,
      },
    }
    return c.json(response)
  })
  app.get('/api/companies/:code/allocations', async (c) => {
    const code = c.req.param('code')
    if (!/^\d{6}$/.test(code))
      return c.json(
        { error: { code: 'INVALID_CODE', message: '股票代码必须为六位数字' } },
        400,
      )
    let company: Company
    try {
      company = await companies.resolve(code)
    } catch (error) {
      return error instanceof CompanyNotFound
        ? c.json(
            {
              error: {
                code: 'UNSUPPORTED_COMPANY',
                message: '未找到受支持的 A 股公司',
              },
            },
            404,
          )
        : c.json(
            {
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: '公司资料暂不可用',
              },
            },
            503,
          )
    }
    try {
      const { value, hit } = await cache.get(
        `allocations/${company.market}/${code}`,
        3600,
        () => fetchAllocations(fetcher, company, now()),
        (data) =>
          data.coverage.completeFetch &&
          data.years.every((year) => !year.issues.length),
      )
      if (!value.coverage.completeFetch && !value.years.length)
        throw new Error('No usable annual records')
      const response: ApiResponse<AllocationHistory> = {
        data: {
          company,
          source: 'eastmoney',
          sourceUrl: allocationUrl,
          lastEndedYear: chinaYear(now()) - 1,
          years: value.years,
          coverage: value.coverage,
        },
        meta: {
          source: 'eastmoney',
          fetchedAt: value.fetchedAt,
          cache: hit ? 'hit' : 'miss',
          issues: [
            ...value.issues,
            ...value.years.flatMap((year) => year.issues),
          ],
        },
      }
      return c.json(response)
    } catch {
      return c.json(
        {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: '年度盈利与分红统计暂不可用',
          },
        },
        503,
      )
    }
  })
  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404),
  )
  app.onError((error, c) => {
    console.error('API error', error.name)
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务内部错误' } },
      500,
    )
  })
  return app
}
