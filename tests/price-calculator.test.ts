import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PriceCalculator } from '../src/features/company/PriceCalculator'

describe('price trial input states', () => {
  function render(expectedYield: string, dividend: string | null = '4.8') {
    return renderToStaticMarkup(
      createElement(PriceCalculator, {
        dividend,
        price: null,
        expectedYield,
      }),
    )
  }
  it('leaves an empty field uncalculated without reporting an error', () => {
    const html = render('')
    expect(html).toContain('aria-invalid="false"')
    expect(html).toMatch(/<output[^>]*>—<\/output>/)
    expect(html).not.toContain('请输入')
  })
  it('still rejects an entered zero', () => {
    const html = render('0')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('请输入 0.01–100 的股息率')
    expect(html).toMatch(/<output[^>]*>—<\/output>/)
  })
  it('accepts fractional yields independently of the adjustment interval', () => {
    const html = render('5.55')
    expect(html).toContain('step="any"')
    expect(html).toContain('aria-invalid="false"')
    expect(html).toContain('86.48')
  })
  it('does not turn missing dividends into a zero result or an input error', () => {
    const html = render('6', null)
    expect(html).toContain('aria-invalid="false"')
    expect(html).toMatch(/<output[^>]*>—<\/output>/)
  })
})
