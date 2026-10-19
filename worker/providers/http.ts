export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>
export async function request(
  fetcher: Fetcher,
  url: string | URL,
  parent: AbortSignal,
  timeout: number,
): Promise<Response> {
  const response = await fetcher(url, {
    signal: AbortSignal.any([parent, AbortSignal.timeout(timeout)]),
    redirect: 'manual',
  })
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`)
  return response
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid upstream object')
  return value as Record<string, unknown>
}
export function date(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?: 00:00:00)?$/.test(value)
  )
    throw new Error('Invalid date')
  const result = value.slice(0, 10)
  if (new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result)
    throw new Error('Invalid date')
  return result
}
export function chinaYear(now: Date): number {
  return new Date(now.getTime() + 8 * 3600_000).getUTCFullYear()
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
