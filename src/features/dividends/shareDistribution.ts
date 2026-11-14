import { EASTMONEY_IMPLEMENTED_PROGRESS } from '../../../shared/api'
import { shareChanges } from '../../../shared/dividendNotices'
import type { YearGroup } from './model'

/** An illustration of shares granted by this fiscal year's implemented schemes.
 * The ratio is for chart geometry only; it is not cash or an investment return.
 */
export function annualShareDistribution(group: YearGroup) {
  if (group.summary?.implementedTotal == null) return null
  const implemented = group.records.filter(
    (record) => record.progress === EASTMONEY_IMPLEMENTED_PROGRESS,
  )
  if (
    implemented.some((record) =>
      record.issues.some(
        (issue) => issue.field === 'BONUS_RATIO' || issue.field === 'IT_RATIO',
      ),
    )
  )
    return null
  const records = implemented.filter((record) => shareChanges(record).length)
  if (!records.length) return null
  // Multiple schemes need distinct implementation dates to establish that
  // they are separate events. Never compound potentially duplicate schemes.
  if (
    records.length > 1 &&
    (records.some((record) => !record.exDate) ||
      new Set(records.map((record) => record.exDate)).size !== records.length)
  )
    return null
  const increase =
    records.reduce(
      (factor, record) =>
        factor *
        (1 +
          shareChanges(record).reduce(
            (sum, change) => sum + Number(change.ratio) / 10,
            0,
          )),
      1,
    ) - 1
  if (
    !Number.isFinite(increase) ||
    increase <= 0 ||
    !Number.isFinite(Number(group.summary.implementedTotal) * (1 + increase))
  )
    return null
  const label =
    records.length === 1
      ? `10${shareChanges(records[0])
          .map(
            (change) =>
              `${change.kind === 'bonus' ? '送' : '转'}${change.ratio}`,
          )
          .join('')}`
      : `${records.length}次送转`
  const text = `${group.year} 财年送转方案\n${records
    .map(
      (record) =>
        `每 10 股${shareChanges(record)
          .map(
            (change) =>
              `${change.kind === 'bonus' ? '送' : '转增'} ${change.ratio} 股`,
          )
          .join('、')}\n除权日：${record.exDate ?? '未提供'}`,
    )
    .join('\n')}\n阴影高度表示送转比例，不代表现金金额或收益率`
  return { records, increase, label, text }
}
