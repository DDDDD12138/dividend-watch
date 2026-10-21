import { useCallback, useEffect, useRef } from 'react'
import type { EastmoneyDividend } from '../../../shared/api'
import { cash, issueText, type YearGroup } from './model'

type YearSectionProps = {
  id: string
  currentYear: number
  title: string
  open: boolean
  onOpen: (id: string, open: boolean) => void
  reference: boolean
  onRecord: (record: EastmoneyDividend) => void
  register: (id: string, node: HTMLDivElement | null) => void
  synchronize: (node: HTMLDivElement) => void
} & (
  | { group: YearGroup; records?: never }
  | { group?: never; records: EastmoneyDividend[] }
)

export function YearSection({
  id,
  group,
  currentYear,
  records,
  title,
  open,
  onOpen,
  reference,
  onRecord,
  register,
  synchronize,
}: YearSectionProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const bind = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node
      register(id, node)
    },
    [id, register],
  )
  useEffect(() => {
    if (open && scroller.current) register(id, scroller.current)
  }, [id, open, register])
  const rows = group ? group.records : records
  const isCurrentYear = group?.year === currentYear
  const issues = group?.summary?.calculationIssues ?? []
  const notEnded = issues.some(
    (issue) => issue.code === 'FISCAL_YEAR_NOT_ENDED',
  )
  const noImplementation = issues.some(
    (issue) => issue.code === 'NO_IMPLEMENTED_RECORDS',
  )
  const problems = [
    ...new Set(
      issues
        .filter((issue) => {
          if (isCurrentYear && issue.code === 'FISCAL_YEAR_NOT_ENDED')
            return false
          if (notEnded && issue.code === 'NO_IMPLEMENTED_RECORDS') return false
          if (
            (notEnded || noImplementation) &&
            issue.code === 'NO_IMPLEMENTED_YEAR_END_REPORT'
          )
            return false
          return true
        })
        .map(issueText),
    ),
  ]
  return (
    <details
      id={id}
      className="dividend-year"
      open={open}
      onToggle={(event) => onOpen(id, event.currentTarget.open)}
    >
      <summary>
        <div>
          <strong>{title}</strong>
          <span className="history-muted">
            {isCurrentYear ? '年内累计' : `${rows.length} 条分红记录`}
          </span>
          {reference && <span className="reference-badge">首页参考</span>}
        </div>
        <span className="year-amount">
          已实施合计
          <span className="year-value">
            <b>{cash(group?.summary?.implementedTotal)}</b>
            <span>/ 股</span>
          </span>
        </span>
      </summary>
      <div
        className="dividend-table-scroll"
        ref={bind}
        onScroll={(event) => synchronize(event.currentTarget)}
        tabIndex={0}
        role="region"
        aria-label={`${title}分红明细，可横向滚动`}
      >
        <table className="dividend-table">
          <thead>
            <tr>
              <th scope="col">报告期</th>
              <th scope="col">每股金额 · 税前</th>
              <th scope="col">来源进度</th>
              <th scope="col">股权登记日</th>
              <th scope="col">除权除息日</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.recordId}>
                <th scope="row">
                  <button
                    className="record-link"
                    onClick={() => onRecord(record)}
                    aria-label={`查看报告期 ${record.reportDate ?? '未知'}、每股 ${record.cashPerShare ?? '未知'} 元的分红记录`}
                  >
                    {record.reportDate ?? '未提供'}
                  </button>
                </th>
                <td className="record-cash">{cash(record.cashPerShare)}</td>
                <td>
                  <span className="record-progress">
                    {record.progress ?? '未提供'}
                  </span>
                </td>
                <td>{record.recordDate ?? '—'}</td>
                <td>{record.exDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!problems.length && (
        <p className="year-problems">{problems.join('；')}。</p>
      )}
      {!group && (
        <p className="year-problems">报告期无法确认，记录未归入年度。</p>
      )}
    </details>
  )
}
