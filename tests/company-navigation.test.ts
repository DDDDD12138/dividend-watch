import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CompanyReturnLink } from '../src/features/company/CompanyReturnLink'
import { overviewReturnPath } from '../src/features/company/navigation'

describe('company overview return navigation', () => {
  it('keeps the company and other list query parameters in the return address', () => {
    expect(
      overviewReturnPath(
        { returnToOverview: '/?view=compact&company=600941' },
        '600941',
      ),
    ).toBe('/?view=compact&company=600941')
  })
  it.each([
    null,
    undefined,
    {},
    'bad',
    { returnToOverview: '/' },
    { returnToOverview: '/?company=600066' },
    { returnToOverview: '//example.com/?company=600941' },
    { returnToOverview: 'https://example.com/?company=600941' },
    { returnToOverview: '/dividends/600941?company=600941' },
  ])(
    'does not infer an overview origin from an unrelated state: %j',
    (state) => {
      expect(overviewReturnPath(state, '600941')).toBeNull()
    },
  )
  it.each([
    [
      { returnToOverview: '/?company=600941' },
      '/?company=600941',
      '返回公司概览',
    ],
    [null, '/', '返回关注列表'],
  ])(
    'renders the return destination and label for %j',
    (state, href, label) => {
      const html = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          {
            initialEntries: [{ pathname: '/dividends/600941', state }],
          },
          createElement(CompanyReturnLink, { code: '600941' }),
        ),
      )
      expect(html).toContain(`href="${href}"`)
      expect(html).toContain(label)
    },
  )
})
