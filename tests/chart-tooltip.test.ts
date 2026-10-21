import { expect, it } from 'vitest'
import { placeTooltip } from '../src/features/dividends/tooltip'
const size = { width: 220, height: 100 },
  viewport = { width: 800, height: 600 }
it('centers above the selected bar bounds', () => {
  expect(
    placeTooltip(
      { left: 300, right: 400, top: 240, bottom: 480 },
      size,
      viewport,
    ),
  ).toEqual({ x: 240, y: 128 })
  expect(
    placeTooltip(
      { left: 320, right: 344, top: 340, bottom: 480 },
      size,
      viewport,
    ),
  ).toEqual({ x: 222, y: 228 })
})
it('flips below near the viewport top and avoids horizontal overflow', () => {
  expect(
    placeTooltip({ left: 2, right: 26, top: 20, bottom: 80 }, size, viewport),
  ).toEqual({ x: 8, y: 92 })
  expect(
    placeTooltip(
      { left: 740, right: 790, top: 400, bottom: 590 },
      size,
      viewport,
    ),
  ).toEqual({ x: 572, y: 288 })
})
it('keeps the tooltip visible when neither side has enough room', () => {
  expect(
    placeTooltip({ left: 200, right: 260, top: 40, bottom: 160 }, size, {
      width: 320,
      height: 180,
    }),
  ).toEqual({ x: 92, y: 8 })
})
