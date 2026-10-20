export interface ResponseCache {
  match(key: Request): Promise<Response | undefined>
  put(key: Request, value: Response): Promise<void>
}
export class SourceCache {
  private cache: ResponseCache | undefined
  private now: () => Date
  constructor(cache?: ResponseCache, now: () => Date = () => new Date()) {
    this.cache = cache
    this.now = now
  }
  async get<T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
    cacheable: (value: T) => boolean,
  ): Promise<{ value: T; hit: boolean }> {
    // Versioned contracts keep earlier source responses out of current caches.
    const request = new Request(
      `https://dividend-watch-cache.invalid/a-share-v2/${key}`,
    )
    try {
      const response = await this.cache?.match(request)
      if (response) {
        const entry = (await response.json()) as { expiresAt: number; value: T }
        if (entry.expiresAt > this.now().getTime())
          return { value: entry.value, hit: true }
      }
    } catch {
      /* Cache failure does not prevent a source request. */
    }
    const value = await load()
    if (cacheable(value)) {
      try {
        await this.cache?.put(
          request,
          Response.json(
            { expiresAt: this.now().getTime() + ttl * 1000, value },
            { headers: { 'Cache-Control': `public, max-age=${ttl}` } },
          ),
        )
      } catch {
        /* Non-durable optimization, not the data source. */
      }
    }
    return { value, hit: false }
  }
}
