export type HistoryRange = '5' | '10' | 'all'

/** Fixed calendar windows; missing source years never move the end of the range. */
export function historyYears(
  range: HistoryRange,
  sourceYears: number[],
  lastEndedYear: number,
): number[] {
  const last = lastEndedYear
  const ended = sourceYears.filter((year) => year <= last)
  if (range === 'all' && !ended.length) return []
  const first = range === 'all' ? Math.min(...ended) : last - Number(range) + 1
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}
