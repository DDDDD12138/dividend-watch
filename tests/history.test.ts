import { describe, expect, it } from 'vitest'
import { fetchDividends, normalizeRecord } from '../worker/providers/eastmoney'
import { buildHistory } from '../worker/services/history'
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
    })
    expect(history.records.every((r) => r.payDate === null)).toBe(true)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2020)
        ?.referenceEligible,
    ).toBe(true)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2026)
        ?.referenceEligible,
    ).toBe(false)
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
        .referenceDividend?.cashPerShare,
    ).toBe('0.6')
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend,
    ).toBeNull()
  })
  it('excludes proposals and unknown progress without rewriting the text', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.progress =
      '新进度值'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend?.fiscalYear).toBe(2024)
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
      buildHistory(bankCompanies[0], data, now).referenceDividend?.cashPerShare,
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
      expect(history.referenceDividend?.fiscalYear).toBe(2024)
    },
  )
  it('does not let malformed optional announcement data destroy valid sums', async () => {
    const data = await input()
    data.records[1] = await normalizeRecord(bankIdentity(), {
      ...rows()[1],
      NOTICE_DATE: 'invalid',
    })
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend?.cashPerShare,
    ).toBe('0.3887')
  })
  it('blocks a wrong-share-basis target without erasing the original cash total', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.bonusRatio = '1'
    const history = buildHistory(bankCompanies[0], data, now)
    expect(
      history.annualSummaries.find((y) => y.fiscalYear === 2025)
        ?.implementedTotal,
    ).toBe('0.3887')
    expect(history.referenceDividend?.fiscalYear).toBe(2024)
  })
  it('does not silently omit unknown cash or incomplete pages', async () => {
    const data = await input()
    data.records.find((r) => r.reportDate === '2025-12-31')!.cashPerShare = null
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend?.fiscalYear,
    ).toBe(2024)
    data.completeFetch = false
    const history = buildHistory(bankCompanies[0], data, now)
    expect(history.referenceDividend).toBeNull()
    expect(
      history.annualSummaries.every((y) => y.implementedTotal === null),
    ).toBe(true)
  })
  it('distinguishes no implementation from an explicit implemented zero', async () => {
    const data = await input()
    data.records = data.records.filter((r) => r.reportDate === '2025-12-31')
    data.records[0].cashPerShare = '0'
    expect(
      buildHistory(bankCompanies[0], data, now).referenceDividend?.cashPerShare,
    ).toBe('0')
    data.records[0].progress = '董事会决议通过'
    expect(
      buildHistory(bankCompanies[0], data, now).annualSummaries[0]
        .implementedTotal,
    ).toBeNull()
  })
})
