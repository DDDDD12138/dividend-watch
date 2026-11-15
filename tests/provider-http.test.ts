import { describe, expect, it, vi } from 'vitest'
import {
  date,
  object,
  readBytes,
  readJson,
  request,
} from '../worker/providers/http'
import { SourceDataError, SourceError } from '../worker/providers/errors'
import { failedResponse } from './support/providers'

describe('source I/O boundaries', () => {
  it.each([
    new Error('Network connection lost.'),
    new Error('internal error'),
    new TypeError('Failed to fetch'),
    new DOMException('cancelled', 'AbortError'),
    new DOMException('timeout', 'TimeoutError'),
    'transport rejected',
  ])('wraps request failures and retains their cause: %s', async (cause) => {
    const fetcher = vi.fn(async () => {
      throw cause
    })
    const failure = await request(
      fetcher,
      'https://example.com',
      new AbortController().signal,
      1000,
      'tencent',
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SourceError)
    expect(failure).toMatchObject({ source: 'tencent', cause })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not classify URL construction errors as source failures', async () => {
    const fetcher = vi.fn()
    const failure = await request(
      fetcher,
      'invalid URL',
      new AbortController().signal,
      1000,
      'tencent',
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(TypeError)
    expect(failure).not.toBeInstanceOf(SourceError)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('preserves an aborted parent signal reason without sending a request', async () => {
    const controller = new AbortController()
    const cause = new Error('cancelled')
    controller.abort(cause)
    const fetcher = vi.fn()
    await expect(
      request(
        fetcher,
        'https://example.com',
        controller.signal,
        1000,
        'tencent',
      ),
    ).rejects.toMatchObject({ cause, source: 'tencent' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    {
      name: 'JSON',
      read: (response: Response) => readJson(response, 'eastmoney'),
      source: 'eastmoney',
    },
    {
      name: 'bytes',
      read: (response: Response) => readBytes(response, 'tencent'),
      source: 'tencent',
    },
  ])(
    'wraps a broken $name response stream with its original cause',
    async ({ read, source }) => {
      const cause = new Error('Network connection lost.')
      const failure = await read(failedResponse(cause)).catch(
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(SourceError)
      expect(failure).not.toBeInstanceOf(SourceDataError)
      expect(failure).toMatchObject({ cause, source })
    },
  )
  it.each(['eastmoney', 'tencent', 'sina'] as const)(
    'keeps invalid JSON attributed to %s',
    async (source) => {
      const failure = await readJson(
        new Response('invalid JSON'),
        source,
      ).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(SourceDataError)
      expect(failure).toMatchObject({
        source,
        cause: expect.any(SyntaxError),
      })
    },
  )
  it.each(['eastmoney', 'tencent', 'sina'] as const)(
    'attributes object and date validation failures to %s',
    (source) => {
      for (const parse of [
        () => object(null, source),
        () => date('2026-02-30', source),
      ]) {
        expect(parse).toThrow(SourceDataError)
        try {
          parse()
        } catch (error) {
          expect(error).toMatchObject({ source })
        }
      }
    },
  )
})
