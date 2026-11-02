import { Hono } from 'hono'
import type { ApiErrorCode, ApiFailure } from '../shared/api'
import type { Fetcher } from './providers/http'
import { SourceError } from './providers/errors'
import { SourceCache, type ResponseCache } from './services/cache'
import { companyService, CompanyNotFound } from './services/companies'
import { quoteService } from './services/quotes'
import { profileService } from './services/profile'
import { dividendService } from './services/dividends'
import { allocationService } from './services/allocations'
import { InvalidInput, searchQuery, stockCode, stockCodes } from './validation'

const errorStatus = {
  INVALID_QUERY: 400,
  INVALID_CODES: 400,
  INVALID_CODE: 400,
  UNSUPPORTED_COMPANY: 404,
  NOT_FOUND: 404,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ApiErrorCode, number>

function errorCode(error: Error): ApiErrorCode {
  if (error instanceof InvalidInput) return error.code
  if (error instanceof CompanyNotFound) return 'UNSUPPORTED_COMPANY'
  if (error instanceof SourceError) return 'UPSTREAM_UNAVAILABLE'
  return 'INTERNAL_ERROR'
}

export function createApp(
  options: { fetcher?: Fetcher; now?: () => Date; cache?: ResponseCache } = {},
) {
  const now = options.now ?? (() => new Date())
  const fetcher = options.fetcher ?? fetch
  const cache = new SourceCache(options.cache, now)
  const companies = companyService({ fetcher, cache, now })
  const dependencies = { companies, cache, fetcher, now }
  const quotes = quoteService(dependencies)
  const profiles = profileService(dependencies)
  const dividends = dividendService(dependencies)
  const allocations = allocationService(dependencies)

  const app = new Hono()
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', service: 'dividend-watch' }),
  )
  app.get('/api/companies', async (c) =>
    c.json(await companies.search(searchQuery(c.req.queries('q')))),
  )
  app.get('/api/quotes', async (c) =>
    c.json(await quotes.get(stockCodes(c.req.queries('codes')))),
  )
  app.get('/api/companies/:code/profile', async (c) =>
    c.json(await profiles.get(stockCode(c.req.param('code')))),
  )
  app.get('/api/companies/:code/dividends', async (c) =>
    c.json(await dividends.get(stockCode(c.req.param('code')))),
  )
  app.get('/api/companies/:code/allocations', async (c) =>
    c.json(await allocations.get(stockCode(c.req.param('code')))),
  )
  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND' } } satisfies ApiFailure, 404),
  )
  app.onError((error, c) => {
    const code = errorCode(error)
    const status = errorStatus[code]
    if (status >= 500) {
      console.error('API request failed', {
        method: c.req.method,
        path: c.req.path,
        source: error instanceof SourceError ? error.source : undefined,
        type: error.name,
        message: error.message,
        cause: error.cause,
        stack: status === 500 ? error.stack : undefined,
      })
    }
    return c.json({ error: { code } } satisfies ApiFailure, status)
  })
  return app
}
