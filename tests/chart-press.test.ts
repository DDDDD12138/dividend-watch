import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChartPress } from '../src/features/dividends/chartPress'

const pointer = { pointerId: 1, clientX: 100, clientY: 100 }

describe('chart press lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('leaves a short press to the native click and clears its timer', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    vi.advanceTimersByTime(399)
    expect(preview).not.toHaveBeenCalled()
    expect(press.end(1)).toBe(true)
    vi.runAllTimers()
    expect(preview).not.toHaveBeenCalled()
    expect(press.blocksClick).toBe(false)
  })

  it('previews at 400ms and retains the blocked click after release', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    vi.advanceTimersByTime(400)
    expect(preview).toHaveBeenCalledExactlyOnceWith('2025')
    expect(press.blocksClick).toBe(true)
    press.end(1)
    expect(press.session?.down).toBe(false)
    expect(press.session?.selection).toBe('2025')
    expect(press.blocksClick).toBe(true)
  })

  it.each([100, 500])(
    'cancellation at %dms blocks release even after repeated cancellation',
    (elapsed) => {
      const preview = vi.fn()
      const press = createChartPress(preview)
      press.start(pointer, '2025')
      vi.advanceTimersByTime(elapsed)
      press.cancel()
      press.cancel()
      expect(press.session?.down).toBe(true)
      expect(press.blocksClick).toBe(true)
      press.end(1)
      press.cancel()
      vi.runAllTimers()
      expect(preview).toHaveBeenCalledTimes(elapsed >= 400 ? 1 : 0)
      expect(press.blocksClick).toBe(true)
    },
  )

  it('allows small movements but cancels beyond 10 CSS pixels', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    expect(press.move({ ...pointer, clientX: 106, clientY: 108 })).toBe(false)
    expect(press.move({ ...pointer, clientX: 111 })).toBe(true)
    expect(press.move({ ...pointer, clientX: 120 })).toBe(false)
    vi.runAllTimers()
    expect(preview).not.toHaveBeenCalled()
    press.end(1)
    expect(press.blocksClick).toBe(true)
  })

  it('does not end or move the first press with a different pointer', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    expect(press.move({ ...pointer, pointerId: 2, clientX: 200 })).toBe(false)
    expect(press.end(2)).toBe(false)
    vi.advanceTimersByTime(400)
    expect(preview).toHaveBeenCalledExactlyOnceWith('2025')
  })

  it('blocks a native pointer cancellation without requiring preview', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    press.end(1, true)
    expect(press.blocksClick).toBe(true)
    expect(press.end(1)).toBe(false)
    vi.runAllTimers()
    expect(preview).not.toHaveBeenCalled()
  })

  it('starts the next press independently of a cancelled one', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2024')
    press.cancel()
    press.end(1)
    press.start({ ...pointer, pointerId: 2 }, '2025')
    expect(press.blocksClick).toBe(false)
    vi.advanceTimersByTime(400)
    expect(preview).toHaveBeenCalledExactlyOnceWith('2025')
  })

  it('disposes pending work on reset', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    press.reset()
    vi.runAllTimers()
    expect(press.session).toBeNull()
    expect(press.blocksClick).toBe(false)
    expect(preview).not.toHaveBeenCalled()
  })

  it('stops pending preview without swallowing a valid tap', () => {
    const preview = vi.fn()
    const press = createChartPress(preview)
    press.start(pointer, '2025')
    vi.advanceTimersByTime(100)
    press.stopPreview()
    vi.runAllTimers()
    expect(preview).not.toHaveBeenCalled()
    press.end(1)
    expect(press.blocksClick).toBe(false)
  })

  it('keeps a completed long press blocked when its preview is dismissed', () => {
    const press = createChartPress(vi.fn())
    press.start(pointer, '2025')
    vi.advanceTimersByTime(400)
    press.stopPreview()
    press.end(1)
    expect(press.blocksClick).toBe(true)
  })

  it('still cancels actual movement after preview has stopped', () => {
    const press = createChartPress(vi.fn())
    press.start(pointer, '2025')
    press.stopPreview()
    expect(press.move({ ...pointer, clientX: 120 })).toBe(true)
    press.stopPreview()
    press.end(1)
    expect(press.blocksClick).toBe(true)
  })
})
