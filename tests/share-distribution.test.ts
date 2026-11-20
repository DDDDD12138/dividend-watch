import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DividendHistory, EastmoneyDividend } from '../shared/api'
import {
  dividendRecord,
  dividendHistory,
  annualDividend,
} from './support/domain'
import { historyView, type YearGroup } from '../src/features/dividends/model'
import { annualShareDistribution } from '../src/features/dividends/shareDistribution'
import { AnnualChart } from '../src/features/dividends/AnnualChart'
import { dividendAxis } from '../src/features/dividends/axis'

vi.mock('../src/features/dividends/chartHooks', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../src/features/dividends/chartHooks')
  >()),
  useChartSize: () => ({
    size: { width: 800, height: 400 },
    measure: () => {},
  }),
  useChartHeight: () => ({ height: 400, measure: () => {} }),
}))

let history: DividendHistory
let groups: YearGroup[]
let original: EastmoneyDividend
beforeAll(() => {
  const company = { code: '601229', name: '上海银行', market: 'SH' as const }
  // Only the values required for the fiscal-year and share-ratio regression.
  const cases = [
    [2016, '5', '0.5', '3', '2017-07-20'],
    [2017, '5', '0.5', '4', '2018-07-17'],
    [2018, '4.5', '0.45', '3', '2019-07-03'],
    [2019, '4', '0.4', null, '2020-07-08'],
    [2020, '4', '0.4', null, '2021-07-06'],
  ] as const
  const records = cases.map(([year, cash, perShare, transfer, exDate]) =>
    dividendRecord({
      recordId: `year-${year}`,
      code: company.code,
      sourceName: company.name,
      reportDate: `${year}-12-31`,
      fiscalYear: year,
      cashPerTenShares: cash,
      cashPerShare: perShare,
      transferRatio: transfer,
      exDate,
      recordDate: new Date(Date.parse(exDate) - 86_400_000)
        .toISOString()
        .slice(0, 10),
    }),
  )
  history = dividendHistory({
    company,
    code: company.code,
    records,
    annualSummaries: cases.map(([year, , perShare, transfer]) =>
      annualDividend({
        fiscalYear: year,
        implementedTotal: perShare,
        implementedRecordCount: 1,
        notices: transfer ? [{ code: 'SHARE_BASIS_CHANGED' }] : [],
      }),
    ),
    referenceDividend: {
      fiscalYear: 2020,
      cashPerShare: '0.4',
      basis: 'eastmoney_implemented_sum',
      issues: [],
      notices: [],
    },
    coverage: {
      fetchedRecords: records.length,
      returnedRecords: records.length,
      pagesRead: 1,
      completeFetch: true,
    },
  })
  groups = historyView(history, '5').chart
  original = groups.find((group) => group.year === 2018)!.records[0]
})

function group(
  records: EastmoneyDividend[],
  amount: string | null = '0.45',
): YearGroup {
  return {
    year: 2018,
    records,
    summary: {
      fiscalYear: 2018,
      implementedTotal: amount,
      implementedRecordCount: records.length,
      calculationIssues: [],
      notices: [],
    },
  }
}

describe('fiscal-year share distribution illustrations', () => {
  it('uses per-ten-share ratios without carrying them into later years', () => {
    const before = JSON.stringify(history)
    expect(
      groups.map((item) => annualShareDistribution(item)?.label ?? null),
    ).toEqual(['10转3', '10转4', '10转3', null, null])
    const value = annualShareDistribution(groups[2])!
    expect(value.increase).toBeCloseTo(0.3)
    expect(value.text).toContain('2018 财年送转方案')
    expect(value.text).toContain('除权日：2019-07-03')
    expect(value.text).toContain('不代表现金金额或收益率')
    expect(groups.map((item) => item.summary?.implementedTotal)).toEqual([
      '0.5',
      '0.5',
      '0.45',
      '0.4',
      '0.4',
    ])
    expect(JSON.stringify(history)).toBe(before)
    expect(
      annualShareDistribution(
        historyView(history, 'all').chart.find((item) => item.year === 2018)!,
      )?.increase,
    ).toBeCloseTo(value.increase)
  })

  it('combines bonus and transfer shares within one scheme', () => {
    const value = annualShareDistribution(
      group([{ ...original, bonusRatio: '2', transferRatio: '3' }]),
    )!
    expect(value.increase).toBeCloseTo(0.5)
    expect(value.label).toBe('10送2转3')
    expect(value.text).toContain('每 10 股送 2 股、转增 3 股')
  })

  it('uses distinct implementation events for multiple distributions in one fiscal year', () => {
    const second = {
      ...original,
      recordId: 'second',
      transferRatio: '4',
      exDate: '2019-09-01',
    }
    const value = annualShareDistribution(group([original, second]))!
    expect(value.increase).toBeCloseTo(0.82)
    expect(value.label).toBe('2次送转')
    expect(value.records).toHaveLength(2)
    expect(value.text).toContain('2019-07-03')
    expect(value.text).toContain('2019-09-01')
  })

  it.each([null, '2019-07-03'])(
    'does not compound events with missing or repeated ex-dates: %s',
    (exDate) =>
      expect(
        annualShareDistribution(
          group([original, { ...original, recordId: 'second', exDate }]),
        ),
      ).toBeNull(),
  )

  it.each(['董事会决议通过', '股东大会通过', '停止实施', null])(
    'does not display non-implemented schemes: %s',
    (progress) => {
      expect(
        annualShareDistribution(group([{ ...original, progress }])),
      ).toBeNull()
    },
  )

  it('does not let an invalid proposal erase an independently implemented scheme', () => {
    const proposal = {
      ...original,
      recordId: 'proposal',
      progress: '董事会决议通过',
      issues: [{ code: 'INVALID_FIELD', field: 'IT_RATIO' }],
    }
    expect(
      annualShareDistribution(group([original, proposal]))?.increase,
    ).toBeCloseTo(0.3)
  })

  it.each(['IT_RATIO', 'BONUS_RATIO'])(
    'omits partial share ratios when %s is invalid',
    (field) => {
      expect(
        annualShareDistribution(
          group([{ ...original, issues: [{ code: 'INVALID_FIELD', field }] }]),
        ),
      ).toBeNull()
    },
  )

  it('keeps unrelated source issues and a missing single ex-date informational', () => {
    const value = annualShareDistribution(
      group([
        {
          ...original,
          exDate: null,
          issues: [{ code: 'INVALID_FIELD', field: 'NOTICE_DATE' }],
        },
      ]),
    )!
    expect(value.label).toBe('10转3')
    expect(value.text).toContain('除权日：未提供')
  })

  it('keeps absent, zero and fractional share distributions distinct', () => {
    for (const ratio of [null, '0'])
      expect(
        annualShareDistribution(group([{ ...original, transferRatio: ratio }])),
      ).toBeNull()
    const fractional = annualShareDistribution(
      group([{ ...original, transferRatio: '0.15' }]),
    )!
    expect(fractional.increase).toBeCloseTo(0.015)
    expect(fractional.label).toBe('10转0.15')
  })

  it('does not create cash for a cash-free scheme or fabricate a missing annual amount', () => {
    expect(annualShareDistribution(group([original], '0'))?.label).toBe('10转3')
    expect(annualShareDistribution(group([original], null))).toBeNull()
    expect(
      annualShareDistribution({ year: 2018, records: [original] }),
    ).toBeNull()
  })
})

function render(items: YearGroup[], emphasis: 'year' | 'record' | null = null) {
  return renderToStaticMarkup(
    createElement(AnnualChart, {
      groups: items,
      summaries: items.flatMap((item) => (item.summary ? [item.summary] : [])),
      yieldValues: new Map(),
      yieldBasis: 'current',
      metric: { title: '参考股息率', basis: '按当前价折算' },
      emptyContent: null,
      emphasis,
      onYear: () => {},
      onRecord: () => {},
    }),
  )
}

describe('share distribution chart integration', () => {
  it('extends only affected fiscal years, keeping the original cash scale and amounts', () => {
    const html = render(groups)
    expect(html.match(/class="chart-transfer-target"/g)).toHaveLength(3)
    expect(html).toContain('data-transfer-year="2018"')
    expect(html).not.toContain('data-transfer-year="2019"')
    const segment = html.match(/class="chart-transfer"[^>]*height="([^"]+)"/g)!
    const cash = html.match(/class="chart-total"[^>]*height="([^"]+)"/g)!
    const height = (text: string) => Number(text.match(/height="([^"]+)"/)![1])
    expect(height(segment[2]) / height(cash[2])).toBeCloseTo(0.3)
    const ceiling = dividendAxis(0.5 * 1.4).ceiling
    expect(height(cash[2])).toBeCloseTo((0.45 / ceiling) * (400 - 42 - 24))
    expect(html).toContain('fill-opacity="0.05"')
    expect(html).toContain('stroke-opacity="0.6"')
    expect(html).toContain('阴影高度表示送转比例')
  })

  it('keeps zero-cash events available without inventing a quantitative bar', () => {
    const html = render([group([original], '0')])
    expect(html).toContain('data-transfer-year="2018"')
    expect(html).toContain('10转3')
    expect(html).not.toContain('class="chart-transfer"')
    expect(html).not.toContain('NaN')
  })

  it('treats the shadow and caption as part of the annual visual layer', () => {
    const html = render(groups, 'record')
    expect(html).toContain('data-mode="record"')
    expect(
      html.match(/class="chart-year-visual chart-transfer-visual"/g),
    ).toHaveLength(3)
    expect(html).not.toContain('data-chart-target="transfer"')
    expect(html).not.toContain('type="checkbox"')
  })
})
