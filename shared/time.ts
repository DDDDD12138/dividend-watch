/** Calendar year in Asia/Shanghai (UTC+8, no DST). */
export function chinaYear(now: Date): number {
  return new Date(now.getTime() + 8 * 3600_000).getUTCFullYear()
}
