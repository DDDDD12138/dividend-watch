import type { DividendNotice } from '../../../shared/api'

export const dividendNoticeContent = {
  SHARE_BASIS_CHANGED: {
    tone: 'info',
    short: '有送转',
    description: '该财年包含送股或转增，现金分红按原始每股金额汇总',
  },
  INVALID_SHARE_RATIO: {
    tone: 'error',
    short: '送转资料异常',
    description: '送转资料异常，不影响现金分红计算',
  },
} as const

export function dividendNoticeText(notice: DividendNotice) {
  return dividendNoticeContent[notice.code].short
}
