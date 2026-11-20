import { afterEach, expect, it, vi } from 'vitest'
import { observeChartTypography } from '../src/features/dividends/chartHooks'

afterEach(() => vi.unstubAllGlobals())

function environment() {
  const breakpoint = new EventTarget()
  const viewport = Object.assign(new EventTarget(), {
    matchMedia: vi.fn(() => breakpoint),
  })
  let finishFonts!: () => void
  const fonts = Object.assign(new EventTarget(), {
    ready: new Promise<void>((resolve) => {
      finishFonts = resolve
    }),
  })
  vi.stubGlobal('window', viewport)
  vi.stubGlobal('document', { fonts })
  return { viewport, breakpoint, fonts, finishFonts }
}

it('remeasures for the typography breakpoint and loaded fonts, not ordinary resizing', async () => {
  const { viewport, breakpoint, fonts, finishFonts } = environment()
  const measure = vi.fn()
  const dispose = observeChartTypography(measure)
  expect(viewport.matchMedia).toHaveBeenCalledWith('(max-width: 650px)')
  expect(measure).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 5; i++) viewport.dispatchEvent(new Event('resize'))
  expect(measure).toHaveBeenCalledTimes(1)
  breakpoint.dispatchEvent(new Event('change'))
  expect(measure).toHaveBeenCalledTimes(2)
  fonts.dispatchEvent(new Event('loadingdone'))
  expect(measure).toHaveBeenCalledTimes(3)
  finishFonts()
  await fonts.ready
  expect(measure).toHaveBeenCalledTimes(4)
  dispose()
})

it('ignores pending font completion and removes listeners after the chart is detached', async () => {
  const { breakpoint, fonts, finishFonts } = environment()
  const measure = vi.fn()
  const dispose = observeChartTypography(measure)
  dispose()
  breakpoint.dispatchEvent(new Event('change'))
  fonts.dispatchEvent(new Event('loadingdone'))
  finishFonts()
  await fonts.ready
  expect(measure).toHaveBeenCalledTimes(1)
})
