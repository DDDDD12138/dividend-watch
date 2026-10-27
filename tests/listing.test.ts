import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreListingBand } from '../src/features/dividends/PreListingBand'
import { describe, expect, it } from 'vitest'

describe('independent pre-listing background', () => {
  function render(years: number[], listingDate?: string | null) {
    return renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(PreListingBand, {
          years,
          listingDate,
          step: 100,
          x: 40,
          y: 24,
          height: 240,
        }),
      ),
    )
  }
  it('covers 2021 for a 2022 listing, independent of fiscal-year dividend records', () => {
    const html = render(
      [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
      '2022-01-05',
    )
    expect(html).toContain('width="600" height="240"')
    expect(html).toContain('未上市')
    // The same 2021 column stays shaded in the five-year range.
    expect(render([2021, 2022, 2023, 2024, 2025], '2022-01-05')).toContain(
      'width="100" height="240"',
    )
  })
  it.each([null, undefined, '2010-01-01', '2021-01-01'])(
    'does not shade unknown dates or years starting with/after listing: %s',
    (date) =>
      expect(render([2021, 2022, 2023, 2024, 2025], date)).not.toContain(
        'pre-listing-band',
      ),
  )
})
