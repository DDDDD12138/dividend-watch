import {
  EASTMONEY_IMPLEMENTED_PROGRESS,
  type DividendNotice,
  type EastmoneyDividend,
} from './api'
import { units } from './money'

export function shareChanges(record: EastmoneyDividend) {
  const ratios = [
    { kind: 'bonus', ratio: record.bonusRatio },
    { kind: 'transfer', ratio: record.transferRatio },
  ] as const
  return ratios.filter(
    (change): change is typeof change & { ratio: string } =>
      change.ratio !== null && units(change.ratio) > 0n,
  )
}

export function dividendNotices(record: EastmoneyDividend): DividendNotice[] {
  if (record.progress !== EASTMONEY_IMPLEMENTED_PROGRESS) return []
  const notices: DividendNotice[] = []
  if (shareChanges(record).length) notices.push({ code: 'SHARE_BASIS_CHANGED' })
  if (
    record.issues.some(
      (issue) => issue.field === 'BONUS_RATIO' || issue.field === 'IT_RATIO',
    )
  )
    notices.push({ code: 'INVALID_SHARE_RATIO' })
  return notices
}

export function uniqueDividendNotices(
  notices: DividendNotice[],
): DividendNotice[] {
  return notices.filter(
    (notice, index) =>
      notices.findIndex((item) => item.code === notice.code) === index,
  )
}
