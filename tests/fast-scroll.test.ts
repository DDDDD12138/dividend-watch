import { describe, expect, it } from 'vitest'
import {
  currentItem,
  directoryPosition,
  directoryLayout,
  dragScroll,
  rowScrollTop,
  scrollProgress,
  scrollTrack,
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
  it('maps partial cards continuously, including different card heights', () => {
    const offsets = [300, 500, 800]
    expect(directoryPosition(offsets, 1000, 200)).toBe(0)
    expect(directoryPosition(offsets, 1000, 400)).toBe(20)
    expect(directoryPosition(offsets, 1000, 650)).toBe(60)
    expect(directoryPosition(offsets, 1000, 900)).toBe(100)
    expect(directoryPosition(offsets, 1000, 1200)).toBe(120)
    expect(directoryPosition([], 0, 200)).toBe(0)
    expect(directoryPosition([300], 500, 400)).toBe(20)
    for (const boundary of [500, 800]) {
      const before = directoryPosition(offsets, 1000, boundary - 1)
      const after = directoryPosition(offsets, 1000, boundary + 1)
      expect(after - before).toBeGreaterThan(0)
      expect(after - before).toBeLessThan(1)
    }
  })
  it('maps both viewport edges to the same positions in the full directory', () => {
    const offsets = Array.from({ length: 40 }, (_, index) => 300 + index * 200)
    const bottom = 8300
    for (const height of [568, 844, 932]) {
      const track = scrollTrack(height)
      for (const scrollY of [0, 400, 3500, bottom - height + 100]) {
        const center =
          track.top +
          scrollProgress(scrollY, bottom - height + 100) * track.travel +
          24
        const layout = directoryLayout(offsets, bottom, scrollY, height, center)
        expect(layout.windowTop).toBeGreaterThanOrEqual(0)
        expect(layout.windowTop + layout.windowHeight).toBeLessThanOrEqual(
          height,
        )
        expect(layout.windowTop + layout.windowHeight / 2).toBeCloseTo(center)
        expect(layout.windowTop - layout.listOffset).toBeCloseTo(
          directoryPosition(offsets, bottom, scrollY),
        )
        expect(
          layout.windowTop + layout.windowHeight - layout.listOffset,
        ).toBeCloseTo(directoryPosition(offsets, bottom, scrollY + height))
      }
    }
  })
  it('has no indicated range when the viewport contains no companies', () => {
    expect(directoryLayout([], 0, 0, 844, 200).windowHeight).toBe(0)
    expect(directoryLayout([1000], 1200, 0, 844, 200).windowHeight).toBe(0)
    expect(directoryLayout([300], 500, 600, 844, 200).windowHeight).toBe(0)
  })
})
