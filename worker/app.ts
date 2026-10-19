import { Hono } from 'hono'
import type {
  ApiResponse,
  Company,
  DividendHistory,
  Issue,
  QuoteItem,
} from '../shared/api'
import { isSupported } from './scope'
import { fetchQuotes } from './providers/tencent'
import { fetchDividends } from './providers/eastmoney'
import type { Fetcher } from './providers/http'
import { buildHistory } from './services/history'
import { SourceCache, type ResponseCache } from './services/cache'
export function createApp(
  options: { fetcher?: Fetcher; now?: () => Date; cache?: ResponseCache } = {},
) {
  const now = options.now ?? (() => new Date()),
    fetcher = options.fetcher ?? fetch
  const cache = new SourceCache(options.cache, now)
  const app = new Hono()
  const quotes = () =>
    cache.get(
      'tencent/supported',
      60,
      () => fetchQuotes(fetcher, now()),
      (result) =>
        result.items.every(
          (item) => item.quote && item.quote.issues.length === 0,
        ),
    )
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', service: 'dividend-watch' }),
  )
  app.get('/api/companies', async (c) => {
    const values = c.req.queries('q') ?? [],
      query = (values[0] ?? '').trim().toLowerCase()
    if (values.length > 1 || query.length > 50)
      return c.json(
        {
          error: {
            code: 'INVALID_QUERY',
            message: '搜索词最多 50 个字符，且参数不能重复',
          },
        },
        400,
      )
    try {
      const { value, hit } = await quotes()
      if (value.items.every((item) => !item.quote))
        throw new Error('No company identities')
      const data: Company[] = value.items
        .flatMap((item) =>
          item.quote ? [{ code: item.code, name: item.quote.name }] : [],
        )
        .filter(
          (company) =>
            company.code.includes(query) ||
            company.name.toLowerCase().includes(query),
        )
      return c.json({
        data,
        meta: {
          source: 'tencent',
          scope: 'supported',
          fetchedAt: value.fetchedAt,
          cache: hit ? 'hit' : 'miss',
          issues: value.items
            .filter((item) => !item.quote)
            .map((item) => ({ code: 'COMPANY_UNAVAILABLE', field: item.code })),
        },
      })
    } catch {
      return c.json(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: '公司资料暂不可用' },
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
    if (codes.every((code) => !isSupported(code)))
      return c.json(
        { error: { code: 'UNSUPPORTED_COMPANY', message: '暂不支持这些股票' } },
        404,
      )
    try {
      const { value, hit } = await quotes()
      const data: QuoteItem[] = codes.map(
        (code) =>
          value.items.find((item) => item.code === code) ?? {
            code,
            quote: null,
            error: { code: 'UNSUPPORTED_COMPANY', message: '暂不支持该股票' },
          },
      )
      if (
        data.every(
          (item) =>
            !item.quote ||
            item.quote.price === null ||
            item.quote.quoteTime === null,
        )
      )
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
  app.get('/api/companies/:code/dividends', async (c) => {
    const code = c.req.param('code')
    if (!/^\d{6}$/.test(code))
      return c.json(
        { error: { code: 'INVALID_CODE', message: '股票代码必须为六位数字' } },
        400,
      )
    if (!isSupported(code))
      return c.json(
        { error: { code: 'UNSUPPORTED_COMPANY', message: '暂不支持该股票' } },
        404,
      )
    let loaded: Awaited<ReturnType<typeof fetchDividends>>, hit: boolean
    try {
      const cached = await cache.get(
        `eastmoney/${code}`,
        3600,
        () => fetchDividends(fetcher, code, now()),
        (value) =>
          value.completeFetch &&
          value.records.every((record) => record.issues.length === 0),
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
    if (!loaded.completeFetch && loaded.records.length === 0) {
      return c.json(
        {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: '来源未返回可用的分红记录',
          },
        },
        503,
      )
    }
    const data = buildHistory(code, loaded, now())
    const issues: Issue[] = [
      ...loaded.issues,
      ...loaded.records.flatMap((record) => record.issues),
    ]
    const response: ApiResponse<DividendHistory> = {
      data,
      meta: {
        source: 'eastmoney',
        fetchedAt: loaded.fetchedAt,
        cache: hit ? 'hit' : 'miss',
        issues,
      },
    }
    return c.json(response)
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
