import { describe, expect, it } from 'vitest'
import { calculateMetrics, perShare, sumAmounts, units } from '../shared/money'
describe('exact money', () => {
  it('converts and sums decimals without float rounding', () => {
    expect(perShare('2.029')).toBe('0.2029')
    expect(sumAmounts(['0.1858', '0.2029'])).toBe('0.3887')
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.3')
    expect(sumAmounts([])).toBeNull()
    expect(sumAmounts(['0', null])).toBeNull()
    expect(sumAmounts(['0'])).toBe('0')
  })
  it('rejects invalid values and precision loss', () => {
    for (const value of ['', 'NaN', '-1', '1.000000001'])
      expect(() => units(value)).toThrow()
    expect(() => perShare('0.00000001')).toThrow()
  })
  it('floors target price and compares the true threshold', () => {
    expect(calculateMetrics('0.3887', '7.07', '5.5')!.targetPrice).toBe('7.06')
    expect(calculateMetrics('0.3887', '7.07', '5.5')!.reached).toBe(false)
    expect(calculateMetrics('0.3887', '7.06', '5.5')!.reached).toBe(true)
    expect(calculateMetrics('0.55', '10', '5.5')).toEqual({
      referenceYield: '0.055',
      targetPrice: '10.00',
      requiredDrop: '0',
      reached: true,
    })
  })
  it('keeps unknown inputs unknown and validates user yield', () => {
    expect(calculateMetrics(null, '10', '5.5')).toBeNull()
    expect(calculateMetrics('1', null, '5.5')).toBeNull()
    expect(calculateMetrics('0', '10', '5.5')!.requiredDrop).toBe('1')
    for (const y of ['0', '0.001', '101'])
      expect(() => calculateMetrics('1', '10', y)).toThrow()
    expect(() => calculateMetrics('1', '0', '5.5')).toThrow()
  })
})
