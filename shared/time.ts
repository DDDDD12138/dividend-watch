/** Calendar year in Asia/Shanghai (UTC+8, no DST). */
export function chinaYear(now: Date): number {
  return new Date(now.getTime() + 8 * 3600_000).getUTCFullYear()
}

/** Calendar date (YYYY-MM-DD) in Asia/Shanghai. */
export function chinaDate(now: Date): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}
