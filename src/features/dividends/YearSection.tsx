import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
} from 'react'
import type { EastmoneyDividend } from '../../../shared/api'
import { Button } from '../../components/Button'
import { cash, issueText, type YearGroup } from './model'

export type YearSectionHandle = {
  reveal: () => void
  clearHighlight: () => void
  setScrollProgress: (progress: number) => void
}

type YearSectionProps = {
  ref?: Ref<YearSectionHandle>
  id: string
  currentYear: number
  title: string
  open: boolean
  onOpen: (id: string, open: boolean) => void
  reference: boolean
  onRecord: (record: EastmoneyDividend) => void
  onScrollProgress: (id: string, progress: number) => void
} & (
  | { group: YearGroup; records?: never }
  | { group?: never; records: EastmoneyDividend[] }
)

export function YearSection({
  ref,
  id,
  group,
  currentYear,
  records,
  title,
  open,
  onOpen,
  reference,
  onRecord,
  onScrollProgress,
}: YearSectionProps) {
  const section = useRef<HTMLDetailsElement>(null)
  const heading = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const highlight = useRef<Animation | null>(null)
  useEffect(() => () => highlight.current?.cancel(), [])
  const setScrollProgress = useCallback((ratio: number) => {
    progress.current = ratio
    const node = scroller.current
    if (node && node.clientWidth > 0)
      node.scrollLeft = ratio * Math.max(0, node.scrollWidth - node.clientWidth)
  }, [])
  useImperativeHandle(
    ref,
    () => ({
      reveal() {
        const node = section.current
        if (!node) return
        highlight.current?.cancel()
        const reducedMotion = matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches
        node.scrollIntoView({
          behavior: reducedMotion ? 'instant' : 'smooth',
          block: 'start',
        })
        heading.current?.focus({ preventScroll: true })
        highlight.current = node.animate(
          [
            { borderColor: 'var(--color-dividend-record)', offset: 0 },
            { borderColor: 'var(--color-dividend-record)', offset: 0.92 },
            { borderColor: 'var(--color-border)', offset: 1 },
          ],
          {
            duration: 2500,
            easing: reducedMotion ? 'steps(1, end)' : 'linear',
          },
        )
      },
      clearHighlight() {
        highlight.current?.cancel()
      },
      setScrollProgress,
    }),
    [setScrollProgress],
  )
  useLayoutEffect(() => {
    const restore = () => setScrollProgress(progress.current)
    restore()
    const observer = new ResizeObserver(restore)
    if (scroller.current) observer.observe(scroller.current)
    return () => observer.disconnect()
  }, [open, setScrollProgress])
  function onScroll() {
    const node = scroller.current!
    const width = node.scrollWidth - node.clientWidth
    if (width <= 0 || node.clientWidth === 0) return
    const ratio = node.scrollLeft / width
    if (Math.abs(ratio - progress.current) < 0.002) return
    progress.current = ratio
    onScrollProgress(id, ratio)
  }
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
      ref={section}
      id={id}
      className="dividend-year"
      data-current-year={isCurrentYear}
      open={open}
      onToggle={(event) => onOpen(id, event.currentTarget.open)}
    >
      <summary ref={heading}>
        <span className="year-chevron" aria-hidden="true" />
        <div className="year-title">
          <strong>{title}</strong>
          <span className="history-muted">
            {isCurrentYear
              ? `年内累计 · ${rows.length} 条记录`
              : `${rows.length} 条分红记录`}
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
        ref={scroller}
        onScroll={onScroll}
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
                  <Button
                    variant="text"
                    className="record-link"
                    onClick={() => onRecord(record)}
                    aria-label={`查看报告期 ${record.reportDate ?? '未知'}、每股 ${record.cashPerShare ?? '未知'} 元的分红记录`}
                  >
                    {record.reportDate ?? '未提供'}
                  </Button>
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
