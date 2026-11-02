import type { Issue } from '../../shared/api'
import { SourceDataError, SourceError } from './errors'
import { object, readJson, request, type Fetcher } from './http'

const PAGE_SIZE = 100
const MAX_PAGES = 20
const TOTAL_TIMEOUT = 20_000
const PAGE_TIMEOUT = 10_000

export async function fetchEastmoneyPages(
  fetcher: Fetcher,
  endpoint: string,
  parameters: Record<string, string>,
  now: Date,
) {
  const rows: unknown[] = [],
    issues: Issue[] = []
  let pagesRead = 0,
    pages = 1,
    count: number | null = null,
    completeFetch = true
  const budget = AbortSignal.timeout(TOTAL_TIMEOUT)
  for (let page = 1; page <= pages; page++) {
    try {
      if (page > MAX_PAGES)
        throw new SourceError('eastmoney', 'Pagination limit')
      const url = new URL(endpoint)
      url.search = new URLSearchParams({
        ...parameters,
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        pageSize: String(PAGE_SIZE),
        pageNumber: String(page),
      }).toString()
      const response = await request(
        fetcher,
        url,
        budget,
        PAGE_TIMEOUT,
        'eastmoney',
      )
      const body = object(await readJson(response, 'eastmoney'), 'eastmoney')
      // Only the first page can declare an empty history.
      if (
        page === 1 &&
        body.success === false &&
        body.code === 9201 &&
        body.result === null
      ) {
        count = 0
        pagesRead++
        break
      }
      if (body.success !== true)
        throw new SourceDataError('eastmoney', 'Source rejected request')
      const result = object(body.result, 'eastmoney')
      if (
        !Array.isArray(result.data) ||
        !Number.isInteger(result.pages) ||
        Number(result.pages) < 0 ||
        !Number.isInteger(result.count) ||
        Number(result.count) < 0 ||
        (result.pages === 0 && Number(result.count) > 0)
      )
        throw new SourceDataError('eastmoney', 'Invalid pagination')
      if (page === 1) {
        pages = Number(result.pages)
        count = Number(result.count)
      } else if (pages !== result.pages || count !== result.count) {
        throw new SourceDataError('eastmoney', 'Changing pagination')
      }
      pagesRead++
      rows.push(...result.data)
      if (!result.data.length && count !== 0)
        throw new SourceDataError('eastmoney', 'Empty non-final page')
    } catch (error) {
      if (!(error instanceof SourceError) || pagesRead === 0) throw error
      completeFetch = false
      issues.push({ code: 'INCOMPLETE_PAGINATION' })
      break
    }
  }
  if (count !== rows.length) {
    completeFetch = false
    issues.push({ code: 'COUNT_MISMATCH' })
  }
  return {
    rows,
    fetchedAt: now.toISOString(),
    fetchedRecords: rows.length,
    pagesRead,
    completeFetch,
    issues,
  }
}
