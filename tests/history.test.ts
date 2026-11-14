import { describe, expect, it } from 'vitest'
import { dividendInput, dividendRecord } from './support/domain'
import { buildHistory } from '../worker/services/history'
import { calculateMetrics } from '../shared/money'
import { historyView, yearChange } from '../src/features/dividends/model'
import { now, bankCompanies } from './support/context'
const input = dividendInput
describe('application calculations from normalized records', () => {
  it('returns company identity even when there are no dividend records', () => {
    const result = buildHistory(bankCompanies[0], dividendInput([]), now)
    expect(result.company).toEqual(bankCompanies[0])
    expect(result.records).toEqual([])
    expect(result.referenceDividend).toMatchObject({
      cashPerShare: null,
      issues: [{ code: 'MISSING_REFERENCE_YEAR' }],
    })
  })
  it('uses cash dividends for valuation and annual comparison without adjusting for transfers', () => {
    const data = input()
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
    (field) => {
      const data = input()
      data.records[1] = dividendRecord({
        issues: [{ code: 'INVALID_FIELD', field }],
      })
      const history = buildHistory(bankCompanies[0], data, now)
      expect(history.referenceDividend.cashPerShare).toBe('0.3')
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
      ).toBe('−25.00%')
    },
  )
  it('only reports implemented share changes in the reference window, without duplicate notices', () => {
    const data = input()
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
    (present) => {
      const data = input()
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
  it('does not treat a non-implemented revision as a duplicate implemented payment', () => {
    const data = input()
    data.records.push(
      dividendRecord({
        recordId: 'revision',
        progress: '停止实施',
        cashPerTenShares: null,
        cashPerShare: null,
      }),
    )
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend.cashPerShare).toBe('0.3')
    expect(history.referenceDividend.issues).toEqual([])
    expect(history.records).toHaveLength(data.records.length)
  })
  it.each([2024, 2022, 2010])(
    'never substitutes older dividends when the latest available year is %s',
    (latest) => {
      const data = dividendInput([
        dividendRecord({
          recordId: 'older',
          fiscalYear: latest,
          reportDate: `${latest}-12-31`,
        }),
      ])
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
  it('moves the reference year at the Shanghai year boundary even when the new year has no records', () => {
    const data = input()
    data.records = data.records.filter((record) => record.fiscalYear !== 2026)
    expect(
      buildHistory(bankCompanies[0], data, new Date('2026-12-31T15:59:59Z'))
        .referenceDividend.cashPerShare,
    ).toBe('0.3')
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
    (progress) => {
      const data = input()
      data.records.find(
        (record) => record.reportDate === '2025-06-30',
      )!.progress = progress
      const history = buildHistory(bankCompanies[0], data, now)
      expect(history.referenceDividend.cashPerShare).toBe('0.2')
      expect(history.referenceDividend.issues).toEqual([])
      expect(
        history.annualSummaries.find((year) => year.fiscalYear === 2025)
          ?.implementedTotal,
      ).toBe('0.2')
      expect(
        history.records.find((record) => record.reportDate === '2025-06-30')
          ?.progress,
      ).toBe(progress)
    },
  )
  it('keeps previous-year cash usable after a later implemented share change', () => {
    const data = input()
    const current = data.records.find((record) => record.fiscalYear === 2026)!
    current.progress = '实施分配'
    current.transferRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend).toMatchObject({
      fiscalYear: 2025,
      cashPerShare: '0.3',
    })
    expect(history.referenceDividend.notices).toContainEqual({
      code: 'SHARE_BASIS_CHANGED',
    })
    expect(
      history.annualSummaries.find((year) => year.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.3')
  })
  it('automatically selects a newly ended year, never inferring payout', () => {
    const data = input()
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
  it('excludes proposals and unknown progress without rewriting the text', () => {
    const data = input()
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
    ).toBe('0.1')
  })
  it('supports multiple genuinely separate distributions in the same report period', () => {
    const data = input()
    const extra = dividendRecord({
      recordId: 'extra',
      recordDate: '2026-09-01',
      exDate: '2026-09-02',
      cashPerTenShares: '1',
      cashPerShare: '0.1',
    })
    data.records.push(extra)
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBe('0.4')
  })
  it.each([true, false])(
    'does not guess record identity when ambiguous (missing dates=%s)',
    (missing) => {
      const data = input()
      const extra = dividendRecord({
        recordId: 'ambiguous',
        cashPerTenShares: '3',
        cashPerShare: '0.3',
        ...(missing ? { recordDate: null, exDate: null } : {}),
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
  it('does not let malformed optional announcement data destroy valid sums', () => {
    const data = input()
    data.records[1] = dividendRecord({
      latestNoticeDate: null,
      issues: [{ code: 'INVALID_FIELD', field: 'NOTICE_DATE' }],
    })
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend.cashPerShare,
    ).toBe('0.3')
  })
  it('uses original cash totals for valuation despite share distributions', () => {
    const data = input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.bonusRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.3')
    expect(history.referenceDividend.cashPerShare).toBe('0.3')
    expect(history.referenceDividend.issues).toEqual([])
    expect(history.referenceDividend.notices).toEqual([
      { code: 'SHARE_BASIS_CHANGED' },
    ])
  })
  it('does not silently omit unknown cash or incomplete pages', () => {
    const data = input()
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
  it('distinguishes no implementation from an explicit implemented zero', () => {
    const data = input()
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
