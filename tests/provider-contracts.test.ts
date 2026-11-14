import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { fetchDividends } from '../worker/providers/eastmoney'
import { buildHistory } from '../worker/services/history'
import { fetchProfile } from '../worker/providers/profile'
import { fetchAllocations } from '../worker/providers/allocations'
import { searchCompanies } from '../worker/providers/companies'
import { fetchQuotes } from '../worker/providers/tencent'
import type { Fetcher } from '../worker/providers/http'
import captures from './fixtures/captures.json'
import { bankCompanies, bankIdentity } from './support/context'

const capturedAt = new Date(captures.capturedAt)
const pagination = {
  sortColumns: 'REPORT_DATE',
  sortTypes: '-1',
  pageSize: '100',
  pageNumber: '1',
}

// Assert the production request independently of the implementation, then replay
// an unedited captured body. Date filters used at capture time keep samples small.
function source(
  endpoint: string,
  parameters: Record<string, string>,
  file: string,
) {
  return vi.fn<Fetcher>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    expect(`${url.origin}${url.pathname}`).toBe(endpoint)
    expect([...url.searchParams]).toHaveLength(Object.keys(parameters).length)
    expect(Object.fromEntries(url.searchParams)).toEqual(parameters)
    expect(init?.redirect).toBe('manual')
    return new Response(
      readFileSync(new URL(`./fixtures/${file}`, import.meta.url)),
    )
  })
}

describe('captured provider contracts', () => {
  it('parses the search envelope and source market identifiers', async () => {
    const fetcher = source(
      'https://searchapi.eastmoney.com/api/suggest/get',
      { input: '601939', type: '14', count: '30' },
      'eastmoney/search.json',
    )
    const result = await searchCompanies(
      fetcher,
      '601939',
      capturedAt,
      new AbortController().signal,
    )
    expect(result).toEqual({
      companies: [bankCompanies[0]],
      issues: [],
      fetchedAt: capturedAt.toISOString(),
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('parses dividend amounts, dates and progress from the captured envelope', async () => {
    const fetcher = source(
      'https://datacenter-web.eastmoney.com/api/data/v1/get',
      {
        reportName: 'RPT_SHAREBONUS_DET',
        columns: 'ALL',
        source: 'WEB',
        client: 'WEB',
        filter: '(SECUCODE="601939.SH")',
        ...pagination,
      },
      'eastmoney/dividends.json',
    )
    const result = await fetchDividends(fetcher, bankIdentity(), capturedAt)
    expect(
      result.records.map(
        ({ reportDate, cashPerTenShares, cashPerShare, progress, exDate }) => ({
          reportDate,
          cashPerTenShares,
          cashPerShare,
          progress,
          exDate,
        }),
      ),
    ).toEqual([
      {
        reportDate: '2026-06-30',
        cashPerTenShares: '2.01',
        cashPerShare: '0.201',
        progress: '董事会决议通过',
        exDate: null,
      },
      {
        reportDate: '2025-12-31',
        cashPerTenShares: '2.029',
        cashPerShare: '0.2029',
        progress: '实施分配',
        exDate: '2026-07-13',
      },
      {
        reportDate: '2025-06-30',
        cashPerTenShares: '1.858',
        cashPerShare: '0.1858',
        progress: '实施分配',
        exDate: '2025-12-11',
      },
    ])
    expect(result).toMatchObject({
      completeFetch: true,
      fetchedRecords: 3,
      pagesRead: 1,
      issues: [],
    })
    expect(result.records.every((record) => record.issues.length === 0)).toBe(
      true,
    )
    const history = buildHistory(bankCompanies[0], result, capturedAt)
    expect(history.referenceDividend).toEqual({
      fiscalYear: 2025,
      cashPerShare: '0.3887',
      basis: 'eastmoney_implemented_sum',
      notices: [],
      issues: [],
    })
    expect(
      history.annualSummaries.find((year) => year.fiscalYear === 2026)
        ?.calculationIssues,
    ).toContainEqual({ code: 'FISCAL_YEAR_NOT_ENDED' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('parses company profile fields without rewriting the business description', async () => {
    const fetcher = source(
      'https://datacenter-web.eastmoney.com/api/data/v1/get',
      {
        reportName: 'RPT_F10_BASIC_ORGINFO',
        columns: 'SECUCODE,SECURITY_CODE,LISTING_DATE,MAIN_BUSINESS',
        filter: '(SECUCODE="601939.SH")',
      },
      'eastmoney/profile.json',
    )
    expect(await fetchProfile(fetcher, bankCompanies[0], capturedAt)).toEqual({
      company: bankCompanies[0],
      listingDate: '2007-09-25',
      mainBusiness:
        '公司金融业务、个人金融业务、资金资管业务和包括境外业务在内的其他业务',
      issues: [],
      fetchedAt: capturedAt.toISOString(),
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('parses implemented annual amounts in CNY', async () => {
    const fetcher = source(
      'https://datacenter.eastmoney.com/securities/api/data/v1/get',
      {
        reportName: 'RPT_F10_DIVIDEND_HISTOGRAM',
        columns:
          'SECUCODE,SECURITY_CODE,REPORT_DATE,PARENTNETPROFIT,DIVIDEND_IMPLE',
        filter: '(SECUCODE="601939.SH")',
        source: 'HSF10',
        client: 'PC',
        ...pagination,
      },
      'eastmoney/allocations.json',
    )
    expect(await fetchAllocations(fetcher, bankIdentity(), capturedAt)).toEqual(
      {
        years: [
          {
            fiscalYear: 2025,
            netProfit: '338906000000',
            cashDividend: '101684000000',
            issues: [],
          },
        ],
        coverage: {
          completeFetch: true,
          fetchedRecords: 1,
          returnedRecords: 1,
          pagesRead: 1,
        },
        issues: [],
        fetchedAt: capturedAt.toISOString(),
      },
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('decodes the original Tencent bytes and reads the real positional fields', async () => {
    const fetcher = source(
      'https://qt.gtimg.cn/q=sh601939',
      {},
      'tencent/quotes.gb18030.bin',
    )
    expect(await fetchQuotes(fetcher, capturedAt, [bankCompanies[0]])).toEqual({
      items: [
        {
          code: '601939',
          quote: {
            ...bankCompanies[0],
            currency: 'CNY',
            name: '建设银行',
            price: '12.11',
            quoteTime: '2026-11-13T16:14:42+08:00',
            issues: [],
          },
          error: null,
        },
      ],
      fetchedAt: capturedAt.toISOString(),
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
