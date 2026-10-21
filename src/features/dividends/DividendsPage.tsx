import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router'
import type { EastmoneyDividend } from '../../../shared/api'
import { useDividends } from '../../data/api'
import { timeLabel } from '../../lib/format'
import { AnnualChart } from './AnnualChart'
import { RecordDialog } from './RecordDialog'
import { YearSection } from './YearSection'
import {
  historyView,
  marketNames,
  type HistoryRange,
  type ChartLayer,
  type YearGroup,
} from './model'
import './dividends.css'

export function DividendsPage() {
  const { code = '' } = useParams()
  if (!/^\d{6}$/.test(code))
    return (
      <main className="history-page">
        <Link className="history-back" to="/">
          ← 返回关注列表
        </Link>
        <h1>股票代码无效</h1>
      </main>
    )
  return <CompanyDividends key={code} code={code} />
}
function CompanyDividends({ code }: { code: string }) {
  const [revision, setRevision] = useState(0)
  const resource = useDividends(code, revision)
  const history = resource.response?.data
  const [range, setRange] = useState<HistoryRange>('5')
  const [emphasis, setEmphasis] = useState<ChartLayer | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<{
    record: EastmoneyDividend
    fetchedAt: string
  } | null>(null)
  const scrollers = useRef(new Map<string, HTMLDivElement>())
  const progress = useRef(0)
  const groupsRoot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  useEffect(() => {
    document.title = history
      ? `${history.company.name} · 分红记录`
      : `${code} · 分红记录`
    return () => {
      document.title = '股息观察'
    }
  }, [code, history])
  const register = useCallback((id: string, node: HTMLDivElement | null) => {
    if (!node) {
      scrollers.current.delete(id)
      return
    }
    scrollers.current.set(id, node)
    node.scrollLeft =
      progress.current * Math.max(0, node.scrollWidth - node.clientWidth)
  }, [])
  const synchronize = useCallback((source: HTMLDivElement) => {
    const width = source.scrollWidth - source.clientWidth
    if (width <= 0 || source.clientWidth === 0) return
    const ratio = source.scrollLeft / width
    if (Math.abs(ratio - progress.current) < 0.002) return
    progress.current = ratio
    for (const node of scrollers.current.values())
      if (node !== source && node.clientWidth > 0)
        node.scrollLeft = ratio * (node.scrollWidth - node.clientWidth)
  }, [])
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      for (const [id, node] of scrollers.current) register(id, node)
    })
    if (groupsRoot.current) observer.observe(groupsRoot.current)
    return () => observer.disconnect()
  }, [history, register])
  const onOpen = useCallback(
    (id: string, open: boolean) =>
      setExpanded((previous) =>
        (previous[id] ?? true) === open
          ? previous
          : { ...previous, [id]: open },
      ),
    [],
  )
  const view = useMemo(
    () => (history ? historyView(history, range) : null),
    [history, range],
  )
  const allGroups = view ? [...view.recent, ...view.historical] : []
  const ids = [
    ...allGroups.map((group) => `year-${group.year}`),
    ...(view?.unassigned.length ? ['year-unassigned'] : []),
  ]
  const allOpen = ids.every((id) => expanded[id] ?? true)
  function openRecord(record: EastmoneyDividend) {
    if (resource.response)
      setSelected({ record, fetchedAt: resource.response.meta.fetchedAt })
  }
  function focusYear(year: number) {
    const id = `year-${year}`
    if (!ids.includes(id)) return
    onOpen(id, true)
    requestAnimationFrame(() => {
      const element = document.getElementById(id)
      element?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      })
      element?.querySelector('summary')?.focus({ preventScroll: true })
    })
  }
  function section(group: YearGroup) {
    const id = `year-${group.year}`
    return (
      <YearSection
        key={id}
        id={id}
        group={group}
        currentYear={view!.currentYear}
        title={`${group.year} 财年`}
        open={expanded[id] ?? true}
        onOpen={onOpen}
        reference={history?.referenceDividend?.fiscalYear === group.year}
        onRecord={openRecord}
        register={register}
        synchronize={synchronize}
      />
    )
  }
  return (
    <main className="history-page">
      <Link className="history-back" to="/">
        ← 返回关注列表
      </Link>
      <header className="history-heading">
        <div>
          <p className="history-eyebrow">DIVIDEND HISTORY</p>
          <h1>
            {history?.company.name ?? code}
            <span>分红记录</span>
          </h1>
          <p className="history-muted">
            {code}
            {history ? ` · ${marketNames[history.company.market]}` : ''} ·
            人民币 / 股 · 税前
          </p>
        </div>
        <button
          className="history-button history-refresh"
          disabled={resource.loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          {resource.loading ? '加载中…' : '刷新'}
        </button>
      </header>
      {resource.error && (
        <p className="history-warning" role="alert">
          {history ? '刷新失败，当前保留上次数据。' : ''}
          {resource.error}
        </p>
      )}
      {!history && resource.loading && (
        <div className="history-empty" role="status">
          正在加载分红记录…
        </div>
      )}
      {history && (
        <>
          {!history.coverage.completeFetch && (
            <p className="history-warning">
              部分分红记录未能获取，年度合计暂不可用。
            </p>
          )}
          {!history.records.length ? (
            <div className="history-empty">
              <h2>暂无分红记录</h2>
              <p className="history-muted">来源暂未提供这家公司的分红记录。</p>
            </div>
          ) : (
            <>
              <section className="history-panel" aria-labelledby="annual-title">
                <div className="history-section-heading">
                  <h2 id="annual-title">历年分红</h2>
                  <div className="history-range-tools">
                    {!!view!.chart.length && (
                      <span className="history-range-dates">
                        {view!.chart[0].year} — {view!.chart.at(-1)!.year}
                      </span>
                    )}
                    <div
                      className="history-ranges"
                      role="group"
                      aria-label="分红时间范围"
                    >
                      {(['5', '10', 'all'] as const).map((value) => (
                        <button
                          key={value}
                          aria-pressed={range === value}
                          onClick={() => setRange(value)}
                        >
                          {value === 'all' ? '全部' : `近 ${value} 年`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {view!.chart.length ? (
                  <>
                    <div
                      className="chart-legend"
                      role="group"
                      aria-label="图表观察重点"
                    >
                      <button
                        type="button"
                        aria-pressed={emphasis === 'year'}
                        onClick={() =>
                          setEmphasis((previous) =>
                            previous === 'year' ? null : 'year',
                          )
                        }
                      >
                        <i className="legend-total" aria-hidden="true" />
                        年度已实施合计
                      </button>
                      <button
                        type="button"
                        aria-pressed={emphasis === 'record'}
                        onClick={() =>
                          setEmphasis((previous) =>
                            previous === 'record' ? null : 'record',
                          )
                        }
                      >
                        <i className="legend-record" aria-hidden="true" />
                        单次实施记录
                      </button>
                    </div>
                    <AnnualChart
                      emphasis={emphasis}
                      groups={view!.chart}
                      summaries={history.annualSummaries}
                      onYear={focusYear}
                      onRecord={openRecord}
                    />
                  </>
                ) : (
                  <p className="history-muted">
                    暂无已结束财年的分红数据，已公布记录见下方。
                  </p>
                )}
              </section>
              <section
                className="history-records"
                aria-labelledby="records-title"
              >
                <div className="history-section-heading">
                  <h2 id="records-title">每一次分红</h2>
                  <button
                    className="history-button"
                    onClick={() =>
                      setExpanded((previous) => ({
                        ...previous,
                        ...Object.fromEntries(ids.map((id) => [id, !allOpen])),
                      }))
                    }
                  >
                    {allOpen ? '收起全部' : '展开全部'}
                  </button>
                </div>
                <div ref={groupsRoot}>
                  {view!.recent.map(section)}
                  {view!.historical.map(section)}
                  {view!.unassigned.length > 0 && (
                    <YearSection
                      id="year-unassigned"
                      currentYear={view!.currentYear}
                      title="报告期待确认"
                      records={view!.unassigned}
                      open={expanded['year-unassigned'] ?? true}
                      onOpen={onOpen}
                      reference={false}
                      onRecord={openRecord}
                      register={register}
                      synchronize={synchronize}
                    />
                  )}
                </div>
              </section>
            </>
          )}
          <footer className="history-footer">
            <span>
              东方财富 · 获取于 {timeLabel(resource.response!.meta.fetchedAt)}
            </span>
            <details>
              <summary>数据说明</summary>
              <p>
                按报告期归属财年，仅来源进度为“实施分配”的记录计入合计，不表示款项已到账。记录按除权除息日排序，缺失日期置后；未结束财年保留在明细中。金额未知显示“—”，明确为零才显示零。
              </p>
              <p>
                图表展示原始每股金额，不做复权。存在已知送转问题的年度不展示同比，也不作为首页目标价参考。来源未提供派息日和公告原文链接。
              </p>
            </details>
          </footer>
        </>
      )}
      {selected && history && (
        <RecordDialog
          record={selected.record}
          company={history.company}
          fetchedAt={selected.fetchedAt}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}
