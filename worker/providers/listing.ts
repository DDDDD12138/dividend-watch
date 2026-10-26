import type { CompanyListing, StockIdentity } from '../../shared/api'
import { eastmoneyUrl } from './eastmoney'
import { date, object, request, type Fetcher } from './http'

export async function fetchListing(
  fetcher: Fetcher,
  identity: StockIdentity,
  now: Date,
) {
  const secucode = `${identity.code}.${identity.market}`
  const url = new URL(eastmoneyUrl)
  url.search = new URLSearchParams({
    reportName: 'RPT_F10_BASIC_ORGINFO',
    columns: 'SECUCODE,SECURITY_CODE,LISTING_DATE',
    filter: `(SECUCODE="${secucode}")`,
  }).toString()
  const response = await request(fetcher, url, AbortSignal.timeout(6000), 5000)
  const body = object(await response.json())
  if (body.success === false && body.code === 9201 && body.result === null)
    return { listingDate: null, fetchedAt: now.toISOString() }
  if (body.success !== true) throw new Error('Listing source unavailable')
  const result = object(body.result)
  if (!Array.isArray(result.data) || result.data.length !== 1)
    throw new Error('Ambiguous listing identity')
  const row = object(result.data[0])
  if (row.SECUCODE !== secucode || row.SECURITY_CODE !== identity.code)
    throw new Error('Invalid listing identity')
  const data: CompanyListing = { listingDate: date(row.LISTING_DATE) }
  return { ...data, fetchedAt: now.toISOString() }
}
