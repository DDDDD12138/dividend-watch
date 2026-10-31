import { describe, expect, it } from 'vitest'
import { fetchDividends, normalizeRecord } from '../worker/providers/eastmoney'
import { buildHistory } from '../worker/services/history'
import { calculateMetrics } from '../shared/money'
import { historyView, yearChange } from '../src/features/dividends/model'
import {
  fixtureFetcher,
  now,
  rows,
  bankIdentity,
  bankCompanies,
} from './helpers'
async function input(code = '601939') {
  return fetchDividends(fixtureFetcher, bankIdentity(code), now)
}
describe('application calculations from source records', () => {
  it('uses cash dividends for valuation and annual comparison without adjusting for transfers', async () => {
    const data = await input()
    data.records = data.records.filter(
      (record) =>
        record.fiscalYear === 2025 || record.reportDate === '2024-12-31',
    )
    for (const record of data.records) {
      record.cashPerShare =
        record.fiscalYear === 2024
          ? '0.25'
          : record.reportDate === '2025-06-30'
            ? '0.15'
            : '0.12'
      record.transferRatio = record.reportDate === '2025-12-31' ? '1' : null
    }
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.cashPerShare).toBe('0.27')
    expect(history.referenceDividend.issues).toEqual([])
    expect(history.referenceDividend.notices).toEqual([
      { code: 'SHARE_BASIS_CHANGED' },
    ])
    expect(
      calculateMetrics(history.referenceDividend.cashPerShare, '6', '5'),
    ).toEqual({
      referenceYield: '0.045',
      targetPrice: '5.40',
      requiredDrop: '0.1',
      reached: false,
    })
    expect(
      yearChange(
        historyView(history, '5').chart.at(-1)!,
        history.annualSummaries,
      ),
    ).toBe('+8.00%')
  })
  it.each(['BONUS_RATIO', 'IT_RATIO'])(
    'keeps cash calculations available when %s is malformed',
    async (field) => {
      const data = await input()
      data.records[1] = await normalizeRecord(bankIdentity(), {
        ...rows()[1],
        [field]: 'invalid',
      })
      const history = buildHistory(bankCompanies[0], data, now)
      expect(history.referenceDividend.cashPerShare).toBe('0.3887')
      expect(history.referenceDividend.issues).toEqual([])
      expect(history.referenceDividend.notices).toEqual([
        { code: 'INVALID_SHARE_RATIO' },
      ])
      expect(history.records[1].issues).toContainEqual(
        expect.objectContaining({ field, code: 'INVALID_FIELD' }),
      )
      expect(
        yearChange(
          historyView(history, '5').chart.at(-1)!,
          history.annualSummaries,
        ),
      ).toBe('−3.55%')
    },
  )
  it('only reports implemented share changes in the reference window, without duplicate notices', async () => {
    const data = await input()
    for (const record of data.records) record.transferRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.notices).toEqual([
      { code: 'SHARE_BASIS_CHANGED' },
    ])
    expect(
      history.annualSummaries.find((year) => year.fiscalYear === 2026)!.notices,
    ).toEqual([])
    for (const record of data.records.filter(
      (record) => record.fiscalYear! >= 2025,
    ))
      record.transferRatio = null
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.notices,
    ).toEqual([])
  })
  it.each([true, false])(
    'reports incomplete fetching exactly once with reference-year records present=%s',
    async (present) => {
      const data = await input()
      if (!present)
        data.records = data.records.filter(
          (record) => record.fiscalYear !== 2025,
        )
      data.completeFetch = false
      const reference = buildHistory(
        bankCompanies[0],
        data,
        now,
      ).referenceDividend
      expect(reference.cashPerShare).toBeNull()
      expect(
        reference.issues.filter((issue) => issue.code === 'INCOMPLETE_FETCH'),
      ).toHaveLength(1)
      expect(
        reference.issues.some(
          (issue) => issue.code === 'MISSING_REFERENCE_YEAR',
        ),
      ).toBe(!present)
    },
  )
  it('does not treat a non-implemented revision as a duplicate implemented payment', async () => {
    const data = await input()
    data.records.push(
      await normalizeRecord(bankIdentity(), {
        ...rows()[1],
        ASSIGN_PROGRESS: '停止实施',
        PRETAX_BONUS_RMB: null,
      }),
    )
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.cashPerShare).toBe('0.3887')
    expect(history.referenceDividend.issues).toEqual([])
    expect(history.records).toHaveLength(data.records.length)
  })
  it.each([2024, 2022, 2010])(
    'never substitutes older dividends when the latest available year is %s',
    async (latest) => {
      const data = await input()
      data.records = data.records.filter(
        (record) => record.fiscalYear !== null && record.fiscalYear <= latest,
      )
      const history = buildHistory(bankCompanies[0], data, now)
      expect(history.referenceDividend).toEqual({
        fiscalYear: 2025,
        cashPerShare: null,
        basis: 'eastmoney_implemented_sum',
        notices: [],
        issues: [{ code: 'MISSING_REFERENCE_YEAR' }],
      })
      expect(
        history.annualSummaries.some((year) => year.implementedTotal !== null),
      ).toBe(true)
    },
  )
  it('moves the reference year at the Shanghai year boundary even when the new year has no records', async () => {
    const data = await input()
    data.records = data.records.filter((record) => record.fiscalYear !== 2026)
    expect(
      buildHistory(bankCompanies[0], data, new Date('2026-12-31T15:59:59Z'))
        .referenceDividend.cashPerShare,
    ).toBe('0.3887')
    expect(
      buildHistory(bankCompanies[0], data, new Date('2026-12-31T16:00:00Z'))
        .referenceDividend,
    ).toMatchObject({
      fiscalYear: 2026,
      cashPerShare: null,
    })
  })
  it.each(['董事会决议通过', '停止实施', '未识别的新进度'])(
    'excludes progress %s from sums without blocking implemented dividends',
    async (progress) => {
      const data = await input()
      data.records.find(
        (record) => record.reportDate === '2025-06-30',
      )!.progress = progress
      const history = buildHistory(bankCompanies[0], data, now)
      expect(history.referenceDividend.cashPerShare).toBe('0.2029')
      expect(history.referenceDividend.issues).toEqual([])
      expect(
        history.annualSummaries.find((year) => year.fiscalYear === 2025)
          ?.implementedTotal,
      ).toBe('0.2029')
      expect(
        history.records.find((record) => record.reportDate === '2025-06-30')
          ?.progress,
      ).toBe(progress)
    },
  )
  it('keeps previous-year cash usable after a later implemented share change', async () => {
    const data = await input()
    const current = data.records.find((record) => record.fiscalYear === 2026)!
    current.progress = '实施分配'
    current.transferRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend).toMatchObject({
      fiscalYear: 2025,
      cashPerShare: '0.3887',
    })
    expect(history.referenceDividend.notices).toContainEqual({
      code: 'SHARE_BASIS_CHANGED',
    })
    expect(
      history.annualSummaries.find((year) => year.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.3887')
  })
  it.each([
    ['601939', '0.3887'],
    ['601398', '0.3103'],
    ['601988', '0.2263'],
  ])('sums %s without an annual evidence table', async (code, total) => {
    const history = buildHistory(
      bankCompanies.find((company) => company.code === code)!,
      await input(code),
      now,
    )
    expect(history.referenceDividend).toEqual({
      fiscalYear: 2025,
      cashPerShare: total,
      basis: 'eastmoney_implemented_sum',
      notices: [],
      issues: [],
    })
    expect(history.records.every((r) => r.payDate === null)).toBe(true)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2020)
        ?.calculationIssues,
    ).toEqual([])
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2026)
        ?.calculationIssues,
    ).toContainEqual({ code: 'FISCAL_YEAR_NOT_ENDED' })
  })
  it('automatically selects a newly ended year, never inferring payout', async () => {
    const data = await input()
    data.records = data.records.filter((r) => r.fiscalYear === 2025)
    for (const row of data.records) {
      row.fiscalYear = 2026
      row.reportDate = row.reportDate!.replace('2025', '2026')
      row.cashPerShare = '0.3'
      row.recordDate = '2027-07-01'
      row.exDate = '2027-07-02'
    }
    expect(
      buildHistory(bankCompanies[0], data, new Date('2027-02-01T00:00:00Z'))
        .referenceDividend.cashPerShare,
    ).toBe('0.6')
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBeNull()
  })
  it('excludes proposals and unknown progress without rewriting the text', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.progress =
      '新进度值'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.cashPerShare).toBeNull()
    expect(
      history.records.find((r) => r.reportDate === '2025-12-31')!.progress,
    ).toBe('新进度值')
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.1858')
  })
  it('supports multiple genuinely separate distributions in the same report period', async () => {
    const data = await input()
    const extra = await normalizeRecord(bankIdentity(), {
      ...rows()[1],
      EQUITY_RECORD_DATE: '2026-09-01',
      EX_DIVIDEND_DATE: '2026-09-02',
      PRETAX_BONUS_RMB: 1,
    })
    data.records.push(extra)
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBe('0.4887')
  })
  it.each([true, false])(
    'does not guess record identity when ambiguous (missing dates=%s)',
    async (missing) => {
      const data = await input()
      const extra = await normalizeRecord(bankIdentity(), {
        ...rows()[1],
        PRETAX_BONUS_RMB: 3,
        ...(missing
          ? { EQUITY_RECORD_DATE: null, EX_DIVIDEND_DATE: null }
          : {}),
      })
      data.records.push(extra)
      const history = buildHistory(bankCompanies[0], data, now)
      expect(
        history.annualSummaries.find((y) => y.fiscalYear === 2025)
          ?.implementedTotal,
      ).toBeNull()
      expect(history.referenceDividend.cashPerShare).toBeNull()
    },
  )
  it('does not let malformed optional announcement data destroy valid sums', async () => {
    const data = await input()
    data.records[1] = await normalizeRecord(bankIdentity(), {
      ...rows()[1],
      NOTICE_DATE: 'invalid',
    })
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBe('0.3887')
  })
  it('uses original cash totals for valuation despite share distributions', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.bonusRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.3887')
    expect(history.referenceDividend.cashPerShare).toBe('0.3887')
    expect(history.referenceDividend.issues).toEqual([])
    expect(history.referenceDividend.notices).toEqual([
      { code: 'SHARE_BASIS_CHANGED' },
    ])
  })
  it('does not silently omit unknown cash or incomplete pages', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.cashPerShare = null
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBeNull()
    data.completeFetch = false
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.cashPerShare).toBeNull()
    expect(
      history.annualSummaries.every((y) => y.implementedTotal === null),
    ).toBe(true)
  })
  it('distinguishes no implementation from an explicit implemented zero', async () => {
    const data = await input()
    data.records = data.records.filter((r) => r.reportDate === '2025-12-31')
    data.records[0].cashPerShare = '0'
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBe('0')
    data.records[0].progress = '董事会决议通过'
    expect(
      buildHistory(bankCompanies[0], data, now).annualSummaries[0]
        .implementedTotal,
    ).toBeNull()
  })
})
