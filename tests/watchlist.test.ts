import { describe, expect, it } from 'vitest'
import type { DividendHistory, Quote } from '../shared/api'
import {
  compareYields,
  defaultPreferences,
  metricsFor,
  parsePreferences,
  recentYears,
  validYield,
} from '../src/features/watchlist/model'

describe('watchlist settings and derived data', () => {
  it('validates saved settings and preserves an intentionally empty list', () => {
    expect(parsePreferences(JSON.stringify(defaultPreferences))).toEqual(
      defaultPreferences,
    )
    for (const changed of [
      { codes: ['601939', '601939'] },
      { codes: ['not-a-code'] },
      { version: 2 },
      { expectedYield: '0' },
      { sort: 'other' },
    ]) {
      expect(() =>
        parsePreferences(JSON.stringify({ ...defaultPreferences, ...changed })),
      ).toThrow()
    }
  })
  it('rejects incomplete or out of range input without changing the saved yield', () => {
    for (const value of ['', '.', '5.', '-1', '0', '100.01', '1e1'])
      expect(validYield(value)).toBe(false)
    for (const value of ['0.01', '5.5', '100'])
      expect(validYield(value)).toBe(true)
  })
  it('sorts unknown yields last while keeping equal values stable', () => {
    expect(['0', undefined, '0.055', '0.04'].sort(compareYields)).toEqual([
      '0.055',
      '0.04',
      '0',
      undefined,
    ])
    expect(compareYields('0.05', '0.050')).toBe(0)
    expect(compareYields(undefined, '0')).toBe(1)
  })
  it('does not calculate with an undated quote', () => {
    const history = {
      referenceDividend: { cashPerShare: '0.4' },
    } as DividendHistory
    const quote = { price: '8', quoteTime: null } as Quote
    expect(metricsFor(history, quote, '5.5')).toBeNull()
    expect(
      metricsFor(
        history,
        { ...quote, quoteTime: '2026-10-20T15:00:00+08:00' },
        '5.5',
      )?.targetPrice,
    ).toBe('7.27')
  })
  it('keeps missing calendar years distinct from explicit zero', () => {
    const history = {
      annualSummaries: [
        { fiscalYear: 2025, implementedTotal: '0' },
        { fiscalYear: 2023, implementedTotal: '0.4' },
      ],
    } as DividendHistory
    expect(recentYears(history, new Date('2026-10-21T00:00:00Z'))).toEqual([
      { year: 2021, amount: null },
      { year: 2022, amount: null },
      { year: 2023, amount: '0.4' },
      { year: 2024, amount: null },
      { year: 2025, amount: '0' },
    ])
  })
  it('ends the trend at the reference year instead of the latest partial year', () => {
    const history = {
      referenceDividend: { fiscalYear: 2025, cashPerShare: '0.4' },
      annualSummaries: [
        { fiscalYear: 2026, implementedTotal: '0.1' },
        { fiscalYear: 2025, implementedTotal: '0.4' },
      ],
    } as DividendHistory
    const now = new Date('2026-10-21T00:00:00Z')
    expect(recentYears(history, now).map((item) => item.year)).toEqual([
      2021, 2022, 2023, 2024, 2025,
    ])
    expect(
      recentYears({ ...history, referenceDividend: null }, now).at(-1)?.year,
    ).toBe(2025)
    expect(
      recentYears(
        {
          ...history,
          referenceDividend: null,
          annualSummaries: [history.annualSummaries[0]],
        },
        now,
      ),
    ).toEqual([])
  })
})
