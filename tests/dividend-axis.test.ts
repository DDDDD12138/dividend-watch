import { expect, it } from 'vitest'
import { dividendAxis } from '../src/features/dividends/axis'
it('uses readable decimal steps instead of dividing an arbitrary maximum', () => {
  expect(dividendAxis(0.403).ticks.map((tick) => tick.label)).toEqual([
    '0.000',
    '0.100',
    '0.200',
    '0.300',
    '0.400',
    '0.500',
  ])
  expect(dividendAxis(0.719).ticks.map((tick) => tick.label)).toEqual([
    '0.000',
    '0.200',
    '0.400',
    '0.600',
    '0.800',
  ])
})
it('keeps room above the highest bar without excessive rounding', () => {
  for (const maximum of [
    0.00000001, 0.0003, 0.403, 0.719, 1, 2.3, 8.12, 1000, 1e15,
  ]) {
    const axis = dividendAxis(maximum)
    expect(axis.ceiling).toBeGreaterThanOrEqual(maximum * 1.1 - maximum * 1e-12)
    expect(axis.ceiling).toBeLessThan(maximum * 1.6)
    expect(axis.ticks.length).toBeGreaterThanOrEqual(4)
    expect(axis.ticks.length).toBeLessThanOrEqual(7)
    expect(axis.ticks[0].value).toBe(0)
    expect(new Set(axis.ticks.map((tick) => tick.label)).size).toBe(
      axis.ticks.length,
    )
    expect(axis.ticks.every((tick) => !/[eE]/.test(tick.label))).toBe(true)
  }
})
it('has a finite zero-based axis for all-zero or unavailable totals', () => {
  const axis = dividendAxis(0)
  expect(axis.ceiling).toBe(1)
  expect(axis.ticks[0].label).toBe('0.000')
  expect(axis.ticks.every((tick) => Number.isFinite(tick.value))).toBe(true)
})
