import { expect, it } from 'vitest'
import { layoutAmountLabels } from '../src/features/dividends/amountLabels'
import { cash, dividendAmount } from '../src/features/dividends/model'
it('pads dividend amounts without rounding or losing decimal precision', () => {
  expect(dividendAmount('0.4')).toBe('0.400')
  expect(dividendAmount('0')).toBe('0.000')
  expect(dividendAmount('0.3887')).toBe('0.3887')
  expect(dividendAmount('0.00000001')).toBe('0.00000001')
  expect(dividendAmount('1000000000000000.00000001')).toBe(
    '1000000000000000.00000001',
  )
  expect(dividendAmount('1.23000000')).toBe('1.230')
  expect(dividendAmount(null)).toBe('—')
  expect(cash('0.4')).toBe('¥0.400')
})
it('shows all amounts when there is space and samples them on narrow charts', () => {
  expect(
    layoutAmountLabels([40, 40, 40, 40, 40], 0, 500).every(
      (label) => label.visible,
    ),
  ).toBe(true)
  expect(
    layoutAmountLabels([40, 40, 40, 40, 40], 0, 180).map(
      (label) => label.visible,
    ),
  ).toEqual([true, false, true, false, true])
})
it('reserves the latest amount, respects measured widths and stays within edges', () => {
  const widths = [42, 55, 40, 60, 105]
  const labels = layoutAmountLabels(widths, 42, 275)
  expect(labels.at(-1)?.visible).toBe(true)
  let previousRight = -Infinity
  labels.forEach((label, index) => {
    if (!label.visible) return
    const left = label.x - widths[index] / 2,
      right = label.x + widths[index] / 2
    expect(left).toBeGreaterThanOrEqual(42)
    expect(right).toBeLessThanOrEqual(275)
    expect(left - previousRight).toBeGreaterThanOrEqual(12)
    previousRight = right
  })
})
it('omits labels that cannot fit at all instead of truncating their value', () => {
  expect(layoutAmountLabels([300], 0, 200)[0].visible).toBe(false)
  expect(layoutAmountLabels([], 0, 200)).toEqual([])
  expect(layoutAmountLabels([40], 0, 0)[0].visible).toBe(false)
})
