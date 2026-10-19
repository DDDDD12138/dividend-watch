import { describe, expect, it, vi } from 'vitest'
import { normalizeRecord, fetchDividends } from '../worker/providers/eastmoney'
import { parseQuotes } from '../worker/providers/tencent'
import { request } from '../worker/providers/http'
import { rows, now, quoteText } from './helpers'
describe('source facts', () => {
  it('preserves unknown progress without translating or inventing fields', async () => {
    const raw = {
      ...rows()[1],
      ASSIGN_PROGRESS: '来源新增状态：取消待定',
      IMPL_PLAN_PROFILE: '特别说明：不送2股',
    }
    const record = await normalizeRecord('601939', raw)
    expect(record.progress).toBe(raw.ASSIGN_PROGRESS)
    expect(record.raw).toEqual(raw)
    expect(record.payDate).toBeNull()
    expect(record.announcementUrl).toBeNull()
    expect(record).not.toHaveProperty('kind')
    expect(record).not.toHaveProperty('stage')
    expect(record).not.toHaveProperty('paymentStatus')
  })
  it('keeps distinct announcement dates and raw units', async () => {
    const record = await normalizeRecord('601939', rows()[1])
    expect(record.cashPerTenShares).toBe('2.029')
    expect(record.cashPerShare).toBe('0.2029')
    expect(record.planNoticeDate).toBe('2026-03-28')
    expect(record.latestNoticeDate).toBe('2026-07-07')
    expect(record.recordDate).toBe('2026-07-10')
    expect(record.exDate).toBe('2026-07-13')
  })
  it('preserves valid cash when optional date, text or ratio is malformed', async () => {
    const record = await normalizeRecord('601939', {
      ...rows()[1],
      NOTICE_DATE: '2026-02-30',
      BONUS_RATIO: 'broken',
      IMPL_PLAN_PROFILE: 42,
    })
    expect(record.cashPerShare).toBe('0.2029')
    expect(record.latestNoticeDate).toBeNull()
    expect(record.issues.map((i) => i.field)).toEqual(
      expect.arrayContaining([
        'NOTICE_DATE',
        'BONUS_RATIO',
        'IMPL_PLAN_PROFILE',
      ]),
    )
  })
  it('represents invalid required values instead of silently dropping them', async () => {
    const record = await normalizeRecord('601939', {
      ...rows()[1],
      REPORT_DATE: 'bad',
      PRETAX_BONUS_RMB: 'bad',
    })
    expect(record.fiscalYear).toBeNull()
    expect(record.cashPerShare).toBeNull()
    expect(record.issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(['REPORT_DATE', 'PRETAX_BONUS_RMB']),
    )
    await expect(
      normalizeRecord('601939', { ...rows()[1], SECUCODE: '601939.HK' }),
    ).rejects.toThrow()
  })
  it('normalizes raw numeric zero and small decimals without inventing missing amounts', async () => {
    expect(
      (await normalizeRecord('601939', { ...rows()[1], PRETAX_BONUS_RMB: 0 }))
        .cashPerShare,
    ).toBe('0')
    expect(
      (
        await normalizeRecord('601939', {
          ...rows()[1],
          PRETAX_BONUS_RMB: null,
        })
      ).cashPerShare,
    ).toBeNull()
    expect(
      (
        await normalizeRecord('601939', {
          ...rows()[1],
          BONUS_RATIO: 0.00000001,
        })
      ).bonusRatio,
    ).toBe('0.00000001')
  })
})
describe('pagination', () => {
  it('fetches every page and deduplicates identical rows ignoring JSON property order', async () => {
    const raw = rows()[1],
      reversed = Object.fromEntries(Object.entries(raw).reverse())
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const page = new URL(String(input)).searchParams.get('pageNumber')
      return Response.json({
        success: true,
        result: { pages: 2, count: 2, data: [page === '1' ? raw : reversed] },
      })
    })
    const result = await fetchDividends(fetcher, '601939', now)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.records).toHaveLength(1)
    expect(result.fetchedRecords).toBe(2)
    expect(result.completeFetch).toBe(true)
  })
  it('keeps fetched rows with incomplete coverage after a subsequent failure', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: { pages: 2, count: 2, data: [rows()[1]] },
        }),
      )
      .mockRejectedValueOnce(new Error('timeout'))
    const result = await fetchDividends(fetcher, '601939', now)
    expect(result.records).toHaveLength(1)
    expect(result.completeFetch).toBe(false)
    expect(result.issues).toContainEqual({ code: 'INCOMPLETE_PAGINATION' })
  })
  it('does not claim complete coverage after source identity or report-period failure', async () => {
    const data = [
      { ...rows()[1], SECURITY_CODE: '600000' },
      { ...rows()[2], REPORT_DATE: null },
    ]
    const result = await fetchDividends(
      async () =>
        Response.json({ success: true, result: { pages: 1, count: 2, data } }),
      '601939',
      now,
    )
    expect(result.records).toHaveLength(1)
    expect(result.records[0].reportDate).toBeNull()
    expect(result.completeFetch).toBe(false)
  })
  it('distinguishes source-declared empty results and rejected responses', async () => {
    const result = await fetchDividends(
      async () =>
        Response.json({
          success: true,
          result: { pages: 0, count: 0, data: [] },
        }),
      '601939',
      now,
    )
    expect(result.completeFetch).toBe(true)
    expect(result.records).toEqual([])
    await expect(
      fetchDividends(
        async () => Response.json({ success: false, result: null }),
        '601939',
        now,
      ),
    ).rejects.toThrow()
  })
  it('detects count and page changes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: { pages: 2, count: 2, data: [rows()[1]] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: { pages: 3, count: 3, data: [rows()[2]] },
        }),
      )
    expect((await fetchDividends(fetcher, '601939', now)).completeFetch).toBe(
      false,
    )
  })
})
describe('quotes and network', () => {
  it('uses source names without a hardcoded company-name check', () => {
    const result = parseQuotes(
      quoteText('601939', 'XD来源新名称'),
      now.toISOString(),
    )
    expect(result[0].quote?.name).toBe('XD来源新名称')
    expect(result[0].quote?.price).toBe('11.45')
    expect(result[1].error?.code).toBe('QUOTE_UNAVAILABLE')
  })
  it('keeps valid identity when quote price is invalid, and validates time', () => {
    const row = parseQuotes(
      quoteText('601939', '来源名称', '0', '20260230161456'),
      now.toISOString(),
    )[0]
    expect(row.quote?.name).toBe('来源名称')
    expect(row.quote?.price).toBeNull()
    expect(row.quote?.quoteTime).toBeNull()
    expect(
      parseQuotes(quoteText() + quoteText(), now.toISOString())[0].quote,
    ).toBeNull()
    expect(
      parseQuotes(
        quoteText('601939', '来源名称', '11', '20990101120000'),
        now.toISOString(),
      )[0].quote?.quoteTime,
    ).toBeNull()
  })
  it('rejects redirects and HTTP errors without retry', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.redirect).toBe('manual')
        return new Response(null, { status: 302 })
      },
    )
    await expect(
      request(fetcher, 'https://example.com', AbortSignal.timeout(1000), 1000),
    ).rejects.toThrow('302')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('aborts a hanging source request at its timeout', async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!
          if (signal.aborted) reject(signal.reason)
          else
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
        }),
    )
    await expect(
      request(fetcher, 'https://example.com', new AbortController().signal, 10),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
