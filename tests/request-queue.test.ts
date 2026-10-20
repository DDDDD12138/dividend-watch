import { expect, it } from 'vitest'
import { createRequestQueue } from '../src/features/watchlist/requestQueue'
it('limits concurrent work and discards cancelled queued requests', async () => {
  const queue = createRequestQueue(2)
  let active = 0,
    peak = 0
  const started: number[] = [],
    releases: (() => void)[] = []
  const controllers = Array.from({ length: 5 }, () => new AbortController())
  const pending = controllers.map((controller, index) =>
    queue(async () => {
      started.push(index)
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active--
      return index
    }, controller.signal),
  )
  const results = Promise.allSettled(pending)
  controllers[2].abort()
  await Promise.resolve()
  expect(started).toEqual([0, 1])
  while (releases.length) {
    releases.shift()!()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(peak).toBe(2)
  expect(started).toEqual([0, 1, 3, 4])
  expect((await results)[2].status).toBe('rejected')
})
it('releases capacity after failure and does not start already aborted work', async () => {
  const queue = createRequestQueue(1),
    controller = new AbortController()
  controller.abort()
  let started = false
  await expect(
    queue(async () => {
      started = true
    }, controller.signal),
  ).rejects.toThrow()
  expect(started).toBe(false)
  await expect(
    queue(async () => {
      throw new Error('failed')
    }, new AbortController().signal),
  ).rejects.toThrow('failed')
  expect(await queue(async () => 42, new AbortController().signal)).toBe(42)
})
