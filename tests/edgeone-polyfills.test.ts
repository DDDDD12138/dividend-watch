import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anySignal,
  installEdgeOnePolyfills,
  jsonResponse,
  timeoutSignal,
  type PolyfillTarget,
} from '../functions/edgeone-polyfills'
import { fetchWithSignal } from '../functions/edgeone-fetch'

describe('EdgeOne polyfills', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('timeoutSignal aborts after the given delay with a reason', () => {
    const signal = timeoutSignal(500)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(499)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(signal.aborted).toBe(true)
    expect(String(signal.reason)).toContain('500ms')
  })
  it('anySignal aborts when any source aborts and forwards the reason', () => {
    const a = new AbortController(),
      b = new AbortController()
    const signal = anySignal([a.signal, b.signal])
    expect(signal.aborted).toBe(false)
    b.abort(new Error('budget'))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as Error).message).toBe('budget')
  })
  it('anySignal is aborted immediately when a source is already aborted', () => {
    const done = AbortSignal.abort('early')
    const signal = anySignal([new AbortController().signal, done])
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('early')
  })
  it('jsonResponse serialises the body and sets content-type unless given', async () => {
    const plain = jsonResponse({ ok: 1 })
    expect(plain.headers.get('content-type')).toBe('application/json')
    expect(await plain.json()).toEqual({ ok: 1 })
    const custom = jsonResponse([1], {
      status: 201,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-a': '1',
      },
    })
    expect(custom.status).toBe(201)
    expect(custom.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(custom.headers.get('x-a')).toBe('1')
  })
  it('installEdgeOnePolyfills fills only what is missing', () => {
    const native = () => new AbortController().signal
    const target: PolyfillTarget = {
      AbortSignal: { timeout: native },
      Response: {},
    }
    expect(installEdgeOnePolyfills(target)).toEqual([
      'AbortSignal.any',
      'Response.json',
    ])
    expect(target.AbortSignal.timeout).toBe(native)
    expect(target.AbortSignal.any).toBe(anySignal)
    expect(target.Response.json).toBe(jsonResponse)
    expect(installEdgeOnePolyfills(target)).toEqual([])
  })
})

describe('fetchWithSignal', () => {
  const pending = () => new Promise<Response>(() => {})
  it('passes through when no signal is given', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const response = await fetchWithSignal('https://example.test/')
    expect(await response.text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/', undefined)
    vi.unstubAllGlobals()
  })
  it('rejects with the abort reason when the signal fires first', async () => {
    vi.stubGlobal('fetch', vi.fn(pending))
    const controller = new AbortController()
    const request = fetchWithSignal('https://example.test/', {
      signal: controller.signal,
    })
    controller.abort(new Error('timed out'))
    await expect(request).rejects.toThrow('timed out')
    vi.unstubAllGlobals()
  })
  it('rejects immediately for an already aborted signal without fetching', async () => {
    const fetchMock = vi.fn(pending)
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      fetchWithSignal('https://example.test/', {
        signal: AbortSignal.abort('x'),
      }),
    ).rejects.toBe('x')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('resolves normally and detaches its abort listener afterwards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('done')),
    )
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    const response = await fetchWithSignal('https://example.test/', {
      signal: controller.signal,
    })
    expect(await response.text()).toBe('done')
    await Promise.resolve()
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    vi.unstubAllGlobals()
  })
})
