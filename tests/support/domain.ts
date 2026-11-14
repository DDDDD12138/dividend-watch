import type {
  AnnualDividend,
  DividendHistory,
  EastmoneyDividend,
} from '../../shared/api'
import type { EastmoneyResult } from '../../worker/providers/eastmoney'
import { bankCompanies, now } from './context'

// Synthetic application data. Never load a captured response or run a provider here.
export function dividendRecord(
  overrides: Partial<EastmoneyDividend> = {},
): EastmoneyDividend {
  return {
    recordId: 'year-end-2025',
    code: '601939',
    sourceName: '建设银行',
    reportDate: '2025-12-31',
    fiscalYear: 2025,
    progress: '实施分配',
    cashPerTenShares: '2',
    cashPerShare: '0.2',
    planNoticeDate: null,
    latestNoticeDate: null,
    recordDate: '2026-07-01',
    exDate: '2026-07-02',
    payDate: null,
    announcementUrl: null,
    bonusRatio: null,
    transferRatio: null,
    description: null,
    issues: [],
    raw: {},
    ...overrides,
  }
}

export function dividendRecords(): EastmoneyDividend[] {
  return [
    dividendRecord({
      recordId: 'proposal-2026',
      reportDate: '2026-06-30',
      fiscalYear: 2026,
      progress: '董事会决议通过',
      recordDate: null,
      exDate: null,
    }),
    dividendRecord(),
    dividendRecord({
      recordId: 'interim-2025',
      reportDate: '2025-06-30',
      cashPerTenShares: '1',
      cashPerShare: '0.1',
      recordDate: '2025-12-10',
      exDate: '2025-12-11',
    }),
    dividendRecord({
      recordId: 'year-end-2024',
      reportDate: '2024-12-31',
      fiscalYear: 2024,
      cashPerTenShares: '4',
      cashPerShare: '0.4',
      recordDate: '2025-07-01',
      exDate: '2025-07-02',
    }),
  ]
}

export function dividendInput(
  records = dividendRecords(),
  overrides: Partial<EastmoneyResult> = {},
): EastmoneyResult {
  return {
    records,
    fetchedAt: now.toISOString(),
    fetchedRecords: records.length,
    pagesRead: 1,
    completeFetch: true,
    issues: [],
    ...overrides,
  }
}

export function annualDividend(
  overrides: Partial<AnnualDividend> = {},
): AnnualDividend {
  return {
    fiscalYear: 2025,
    implementedTotal: '0.3',
    implementedRecordCount: 2,
    calculationIssues: [],
    notices: [],
    ...overrides,
  }
}

// Explicit API output for rendering tests: no business calculations in test setup.
export function dividendHistory(
  overrides: Partial<DividendHistory> = {},
): DividendHistory {
  const records = dividendRecords()
  return {
    company: { ...bankCompanies[0] },
    code: '601939',
    source: 'eastmoney',
    sourceUrl: 'https://example.test/dividends',
    records,
    annualSummaries: [
      annualDividend({
        fiscalYear: 2026,
        implementedTotal: null,
        implementedRecordCount: 0,
        calculationIssues: [
          { code: 'NO_IMPLEMENTED_RECORDS' },
          { code: 'NO_IMPLEMENTED_YEAR_END_REPORT' },
          { code: 'FISCAL_YEAR_NOT_ENDED' },
        ],
      }),
      annualDividend(),
      annualDividend({
        fiscalYear: 2024,
        implementedTotal: '0.4',
        implementedRecordCount: 1,
      }),
    ],
    referenceDividend: {
      fiscalYear: 2025,
      cashPerShare: '0.3',
      basis: 'eastmoney_implemented_sum',
      issues: [],
      notices: [],
    },
    coverage: {
      fetchedRecords: records.length,
      returnedRecords: records.length,
      pagesRead: 1,
      completeFetch: true,
    },
    ...overrides,
  }
}
