import { describe, expect, it } from 'vitest'
import {
  currentItem,
  directoryWindow,
  dragScroll,
  rowScrollTop,
  scrollProgress,
  scrollTrack,
  FAST_SCROLL_ROW_HEIGHT,
} from '../src/components/fastScrollGeometry'

describe('fast scroll geometry', () => {
  it('maps one screen of pointer travel to the whole page and clamps overshoot', () => {
    const { top, travel } = scrollTrack(844)
    expect(dragScroll(top + 24, 24, top, travel, 10000)).toBe(0)
    expect(
      dragScroll(top + travel / 2 + 24, 24, top, travel, 10000),
    ).toBeCloseTo(5000)
    expect(dragScroll(top + travel + 24, 24, top, travel, 10000)).toBe(10000)
    expect(dragScroll(-100, 24, top, travel, 10000)).toBe(0)
    expect(dragScroll(2000, 24, top, travel, 10000)).toBe(10000)
    expect(dragScroll(0, 0, 0, 0, 10000)).toBe(0)
  })
  it('handles empty and non-scrollable pages without invalid progress', () => {
    expect(scrollProgress(20, 0)).toBe(0)
    expect(scrollProgress(-20, 100)).toBe(0)
    expect(scrollProgress(120, 100)).toBe(1)
    expect(currentItem([], 0, false)).toBe(-1)
    expect(scrollTrack(200).travel).toBe(0)
  })
  it('identifies visible headings, including the first and last company', () => {
    const positions = [300, 500, 720, 1000]
    expect(currentItem(positions, 0, false)).toBe(0)
    expect(currentItem(positions, 400, false)).toBe(1)
    expect(currentItem(positions, 510, false)).toBe(1)
    expect(currentItem(positions, 700, true)).toBe(3)
    expect(currentItem(positions, 1400, false)).toBe(3)
  })
  it('uses a consistent keyboard landing position within the page bounds', () => {
    const positions = [300, 500, 720, 1000]
    for (let index = 0; index < positions.length; index++) {
      const top = rowScrollTop(positions[index], 1200)
      expect(currentItem(positions, top, false)).toBe(index)
    }
    expect(rowScrollTop(0, 1200)).toBe(0)
    expect(rowScrollTop(1000, 800)).toBe(800)
  })
  it.each([568, 844, 932])(
    'fits as many complete directory rows as available at height %i',
    (height) => {
      for (const active of [0, 1, 19, 38, 39]) {
        const track = scrollTrack(height)
        const center = track.top + (active / 39) * track.travel + 24
        const window = directoryWindow(40, active, center, height)
        expect(window.start).toBeLessThanOrEqual(active)
        expect(window.end).toBeGreaterThan(active)
        expect(window.top).toBeGreaterThanOrEqual(16)
        const bottom =
          window.top + (window.end - window.start) * FAST_SCROLL_ROW_HEIGHT
        expect(bottom).toBeLessThanOrEqual(height - 16)
        expect(
          window.top + (active - window.start + 0.5) * FAST_SCROLL_ROW_HEIGHT,
        ).toBeCloseTo(center)
        if (window.start > 0)
          expect(window.top - FAST_SCROLL_ROW_HEIGHT).toBeLessThan(16)
        if (window.end < 40)
          expect(bottom + FAST_SCROLL_ROW_HEIGHT).toBeGreaterThan(height - 16)
      }
    },
  )
  it('does not cap a tall screen to five directory entries', () => {
    const window = directoryWindow(40, 20, 422, 844)
    expect(window.end - window.start).toBeGreaterThanOrEqual(19)
  })
})
