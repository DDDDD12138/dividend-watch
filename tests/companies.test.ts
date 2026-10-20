import { describe, expect, it } from 'vitest'
import { parseCompanies } from '../worker/providers/companies'
import { normalizeRecord } from '../worker/providers/eastmoney'
import { parseQuotes } from '../worker/providers/tencent'
import { now, quoteText, rows } from './helpers'
const wrap = (Data: unknown[]) => ({
  QuotationCodeTable: { Status: 0, TotalCount: Data.length, Data },
})
const stock = (Code: string, SecurityType: string, JYS: string) => ({
  Code,
  Name: 'Source name',
  SecurityType,
  JYS,
})
describe('company identities', () => {
  it('distinguishes A-shares from index/fund collisions and maps all supported boards', () => {
    const result = parseCompanies(
      wrap([
        stock('000001', '5', '1'),
        stock('000001', '17', 'OTCFUND'),
        stock('000001', '2', '6'),
        stock('600900', '1', '2'),
        stock('300750', '2', '80'),
        stock('688981', '25', '23'),
        stock('920002', '27', '81'),
        stock('510300', '8', '9'),
        stock('03750', '6', 'HK'),
      ]),
    )
    expect(result.companies.map(({ code, market }) => [code, market])).toEqual([
      ['000001', 'SZ'],
      ['600900', 'SH'],
      ['300750', 'SZ'],
      ['688981', 'SH'],
      ['920002', 'BJ'],
    ])
    expect(result.issues).toEqual([])
  })
  it('does not infer a market from code or prose and reports invalid identities', () => {
    const result = parseCompanies(
      wrap([
        { ...stock('600900', '1', 'unknown'), SecurityTypeName: '沪A' },
        stock('bad', '1', '2'),
        { Code: '600900', Name: 'Name' },
      ]),
    )
    expect(result.companies).toEqual([])
    expect(result.issues).toHaveLength(3)
  })
  it('deduplicates identical results but excludes conflicting identities', () => {
    const a = stock('000001', '2', '6')
    expect(parseCompanies(wrap([a, a])).companies).toHaveLength(1)
    expect(
      parseCompanies(wrap([a, stock('000001', '1', '2')])).companies,
    ).toEqual([])
  })
  it('accepts only source-declared empty search results', () => {
    expect(
      parseCompanies({
        QuotationCodeTable: { Status: 0, TotalCount: 0, Data: null },
      }).companies,
    ).toEqual([])
    expect(() =>
      parseCompanies({ QuotationCodeTable: { Status: 0, Data: null } }),
    ).toThrow()
    expect(() =>
      parseCompanies({ QuotationCodeTable: { Status: 1, Data: [] } }),
    ).toThrow()
  })
  it.each(['SH', 'SZ', 'BJ'] as const)(
    'matches %s in quotes and dividend records without prefix inference',
    async (market) => {
      const company = { code: '123456', market, name: 'Identity' }
      const text = quoteText(
        company.code,
        'QuoteName',
        '10',
        '20261019161456',
        market.toLowerCase(),
      )
      expect(
        parseQuotes(text, now.toISOString(), [company])[0].quote?.market,
      ).toBe(market)
      expect(
        parseQuotes(
          text.replace(`v_${market.toLowerCase()}`, 'v_hk'),
          now.toISOString(),
          [company],
        )[0].error?.code,
      ).toBe('QUOTE_UNAVAILABLE')
      const raw = {
        ...rows()[1],
        SECURITY_CODE: company.code,
        SECUCODE: `${company.code}.${market}`,
      }
      expect((await normalizeRecord(company, raw)).cashPerShare).toBe('0.2029')
      await expect(
        normalizeRecord(company, { ...raw, SECUCODE: `${company.code}.HK` }),
      ).rejects.toThrow()
    },
  )
})
