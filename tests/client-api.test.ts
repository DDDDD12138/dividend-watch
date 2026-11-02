import { afterEach, describe, expect, it, vi } from 'vitest'
import { request, requestError } from '../src/data/api'

afterEach(() => vi.unstubAllGlobals())

function fail(body: unknown, status = 404) {
  vi.stubGlobal('fetch', async () => Response.json(body, { status }))
  return request('/api/test', new AbortController().signal)
}

describe('client error presentation', () => {
  it('distinguishes an unsupported company from a missing endpoint with the same HTTP status', async () => {
    await expect(
      fail({ error: { code: 'UNSUPPORTED_COMPANY' } }),
    ).rejects.toThrow('暂不支持该公司')
    await expect(fail({ error: { code: 'NOT_FOUND' } })).rejects.toThrow(
      '接口不存在，请刷新页面后重试',
    )
  })
  it('uses the typed error code for validation and internal errors', async () => {
    await expect(
      fail({ error: { code: 'INVALID_CODE' } }, 400),
    ).rejects.toThrow('股票代码必须为六位数字')
    await expect(
      fail({ error: { code: 'INTERNAL_ERROR' } }, 500),
    ).rejects.toThrow('服务出现异常，请稍后重试')
  })
  it.each([
    null,
    {},
    { error: null },
    { error: { code: 'NEW_CODE' } },
    { error: { code: 'toString' } },
  ])(
    'uses a generic message for unrecognized error bodies: %j',
    async (body) => {
      await expect(fail(body)).rejects.toThrow('数据暂不可用，请稍后重试')
    },
  )
  it('does not infer unsupported companies from non-JSON 404 responses', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('<h1>Not found</h1>', { status: 404 }),
    )
    await expect(
      request('/api/test', new AbortController().signal),
    ).rejects.toThrow('数据暂不可用，请稍后重试')
  })
  it.each([
    [new DOMException('timeout', 'TimeoutError'), '请求超时，请重试'],
    [new TypeError('Failed to fetch'), '网络连接失败，请重试'],
  ])('preserves network and timeout feedback', async (error, message) => {
    vi.stubGlobal('fetch', async () => {
      throw error
    })
    const caught = await request(
      '/api/test',
      new AbortController().signal,
    ).catch((error: unknown) => error)
    expect(requestError(caught)).toBe(message)
  })
  it('keeps successful responses intact', async () => {
    const response = {
      data: [],
      meta: {
        source: 'eastmoney',
        fetchedAt: '2026-10-20T01:00:00Z',
        cache: 'miss',
        issues: [],
      },
    }
    vi.stubGlobal('fetch', async () => Response.json(response))
    expect(
      await request('/api/companies?q=银行', new AbortController().signal),
    ).toEqual(response)
  })
})
