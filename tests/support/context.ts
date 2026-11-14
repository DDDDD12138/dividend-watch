import type { Company, StockIdentity } from '../../shared/api'

export const now = new Date('2026-10-20T01:00:00Z')
export const bankCompanies: Company[] = [
  { code: '601939', name: '建设银行', market: 'SH' },
  { code: '601398', name: '工商银行', market: 'SH' },
  { code: '601988', name: '中国银行', market: 'SH' },
]
export function bankIdentity(code = '601939'): StockIdentity {
  return { code, market: 'SH' }
}
