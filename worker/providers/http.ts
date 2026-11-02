import type { DataSource } from '../../shared/api'
import { SourceDataError, SourceError } from './errors'

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>
export async function request(
  fetcher: Fetcher,
  url: string | URL,
  parent: AbortSignal,
  timeout: number,
  source: DataSource,
): Promise<Response> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(timeout)])
  const requestUrl = new URL(url)
  let response: Response
  // Classify failures at the I/O boundary, not by runtime-specific error types.
  try {
    signal.throwIfAborted()
    response = await fetcher(requestUrl, { signal, redirect: 'manual' })
  } catch (error) {
    throw new SourceError(source, 'Source request failed', { cause: error })
  }
  if (!response.ok)
    throw new SourceError(source, `Upstream HTTP ${response.status}`)
  return response
}

export async function readJson(
  response: Response,
  source: DataSource,
): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new SourceDataError(source, 'Invalid JSON', { cause: error })
    throw new SourceError(source, 'Source body unavailable', {
      cause: error,
    })
  }
}

export async function readBytes(
  response: Response,
  source: DataSource,
): Promise<ArrayBuffer> {
  try {
    return await response.arrayBuffer()
  } catch (error) {
    throw new SourceError(source, 'Source body unavailable', { cause: error })
  }
}

export function object(
  value: unknown,
  source: DataSource,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SourceDataError(source, 'Invalid upstream object')
  return value as Record<string, unknown>
}
export function date(value: unknown, source: DataSource): string | null {
  if (value === null || value === undefined || value === '') return null
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?: 00:00:00)?$/.test(value)
  )
    throw new SourceDataError(source, 'Invalid date')
  const result = value.slice(0, 10)
  const parsed = new Date(`${result}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    throw new SourceDataError(source, 'Invalid date')
  return result
}
export async function fingerprint(
  raw: Record<string, unknown>,
): Promise<string> {
  // Source rows are flat JSON objects. Key order is not record identity.
  const canonical = Object.fromEntries(
    Object.keys(raw)
      .sort()
      .map((key) => [key, raw[key]]),
  )
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonical)),
  )
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
