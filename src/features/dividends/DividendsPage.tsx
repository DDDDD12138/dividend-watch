import { ArrowLeft } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '../../components/Button'
import { RefreshButton } from '../../components/RefreshButton'
import { Link, useParams } from 'react-router'
import type {
  AllocationHistory,
  CompanyListing,
  EastmoneyDividend,
} from '../../../shared/api'
import { useDividends, useResource } from '../../data/api'
import { timeLabel } from '../../lib/format'
import type { HistoryRange } from '../../lib/historyYears'
import { AnnualChart } from './AnnualChart'
import { ChartLegend } from './ChartLegend'
import { HistoryRanges } from './HistoryRanges'
import { AllocationPanel } from './AllocationPanel'
import type { AllocationLayer } from './AllocationChart'
import { RecordDialog } from './RecordDialog'
import { YearSection, type YearSectionHandle } from './YearSection'
import {
  historyView,
  marketNames,
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
          <ArrowLeft />
          返回关注列表
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
  const listing = useResource<CompanyListing>(
    `/api/companies/${code}/listing`,
    revision,
  )
  const listingDate = listing.response?.data.listingDate
  const [range, setRange] = useState<HistoryRange>('5')
  const [chartView, setChartView] = useState<'dividend' | 'allocation'>(
    'dividend',
  )
  const [allocationRequested, setAllocationRequested] = useState(false)
  const allocations = useResource<AllocationHistory>(
    allocationRequested ? `/api/companies/${code}/allocations` : null,
    revision,
  )
  const refreshing =
    chartView === 'dividend' ? resource.loading : allocations.loading
  const company = history?.company ?? allocations.response?.data.company
  const [emphasis, setEmphasis] = useState<ChartLayer | null>(null)
  const [allocationEmphasis, setAllocationEmphasis] =
    useState<AllocationLayer | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [navigation, setNavigation] = useState<{ year: number } | null>(null)
  const [selected, setSelected] = useState<{
    record: EastmoneyDividend
    fetchedAt: string
  } | null>(null)
  const sections = useRef(new Map<string, YearSectionHandle>())
  const progress = useRef(0)
  useEffect(() => {
    if (!navigation) return
    // Run after the year is rendered/expanded and any dialog has closed.
    const section = sections.current.get(`year-${navigation.year}`)
    section?.reveal()
    return () => section?.clearHighlight()
  }, [navigation])
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  useEffect(() => {
    document.title = `${company?.name ?? code} · 分红记录`
    return () => {
      document.title = '股息观察'
    }
  }, [code, company])
  const register = useCallback(
    (id: string, section: YearSectionHandle | null) => {
      if (!section) return
      sections.current.set(id, section)
      section.setScrollProgress(progress.current)
      return () => {
        sections.current.delete(id)
      }
    },
    [],
  )
  const synchronize = useCallback((source: string, ratio: number) => {
    if (Math.abs(ratio - progress.current) < 0.002) return
    progress.current = ratio
    for (const [id, section] of sections.current)
      if (id !== source) section.setScrollProgress(ratio)
  }, [])
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
    if (!ids.includes(id)) {
      if (!history?.records.some((record) => record.fiscalYear === year)) return
      setRange('all')
    }
    onOpen(id, true)
    setNavigation({ year })
  }
  function section(group: YearGroup) {
    const id = `year-${group.year}`
    return (
      <YearSection
        key={id}
        ref={(section) => register(id, section)}
        id={id}
        group={group}
        currentYear={view!.currentYear}
        title={`${group.year} 财年`}
        open={expanded[id] ?? true}
        onOpen={onOpen}
        reference={
          history?.referenceDividend.cashPerShare != null &&
          history.referenceDividend.fiscalYear === group.year
        }
        onRecord={openRecord}
        onScrollProgress={synchronize}
      />
    )
  }
  return (
    <main className="history-page">
      <Link className="history-back" to="/">
        <ArrowLeft />
        返回关注列表
      </Link>
      <header className="history-heading">
        <div>
          <p className="history-eyebrow">DIVIDEND HISTORY</p>
          <h1>
            {company?.name ?? code}
            <span>分红记录</span>
          </h1>
          <p className="history-muted">
            {code}
            {company ? ` · ${marketNames[company.market]}` : ''} · 人民币 · 税前
          </p>
        </div>
        <RefreshButton
          refreshing={refreshing}
          onRefresh={() => setRevision((value) => value + 1)}
        />
      </header>
      <section className="history-panel" aria-label="历年分红与盈利图表">
        <div className="history-section-heading">
          <div
            className="history-view-switch"
            role="group"
            aria-label="图表内容"
          >
            <button
              type="button"
              aria-pressed={chartView === 'dividend'}
              onClick={() => setChartView('dividend')}
            >
              每股分红
            </button>
            <button
              type="button"
              aria-pressed={chartView === 'allocation'}
              onClick={() => {
                setAllocationRequested(true)
                setChartView('allocation')
              }}
            >
              分红比例
            </button>
          </div>
          <HistoryRanges value={range} onChange={setRange} />
        </div>
        {chartView === 'allocation' ? (
          <AllocationPanel
            listingDate={listingDate}
            resource={allocations}
            range={range}
            history={history}
            onYear={focusYear}
            emphasis={allocationEmphasis}
            onEmphasis={setAllocationEmphasis}
          />
        ) : !history ? (
          <div className="annual-chart">
            <div className="chart-empty">
              {resource.loading ? (
                <p role="status">正在加载分红记录…</p>
              ) : (
                <p className="history-warning" role="alert">
                  分红记录加载失败。{resource.error}
                </p>
              )}
            </div>
          </div>
        ) : view!.chart.length ? (
          <>
            <div className="history-chart-toolbar">
              <ChartLegend
                label="图表观察重点"
                items={[
                  { value: 'year', label: '年度已实施合计', tone: 'total' },
                  { value: 'record', label: '单次实施记录', tone: 'record' },
                ]}
                value={emphasis}
                onChange={setEmphasis}
              />
              <span className="history-range-dates">
                {view!.chart[0].year} — {view!.chart.at(-1)!.year}
              </span>
            </div>
            <AnnualChart
              listingDate={listingDate}
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
      {!listing.loading && (listing.error || listingDate === null) && (
        <p className="history-muted" role="status">
          {listing.error
            ? listingDate
              ? '上市日期更新失败'
              : '上市日期加载失败'
            : '来源未提供上市日期'}
        </p>
      )}
      {resource.error && (history || chartView === 'allocation') && (
        <p className="history-warning" role="alert">
          {resource.response
            ? '分红记录更新失败'
            : `分红记录加载失败。${resource.error}`}
        </p>
      )}
      {history && !history.coverage.completeFetch && (
        <p className="history-warning">
          部分分红明细未能获取，每股分红合计暂不可用。
        </p>
      )}
      {!history && chartView === 'allocation' && resource.loading && (
        <p className="history-muted" role="status">
          分红明细加载中…
        </p>
      )}
      {history && (
        <>
          {history.records.length ? (
            <section
              className="history-records"
              aria-labelledby="records-title"
            >
              <div className="history-section-heading">
                <h2 id="records-title">每一次分红</h2>
                <Button
                  variant="text"
                  onClick={() =>
                    setExpanded((previous) => ({
                      ...previous,
                      ...Object.fromEntries(ids.map((id) => [id, !allOpen])),
                    }))
                  }
                >
                  {allOpen ? '收起全部' : '展开全部'}
                </Button>
              </div>
              <div>
                {view!.recent.map(section)}
                {view!.historical.map(section)}
                {view!.unassigned.length > 0 && (
                  <YearSection
                    ref={(section) => register('year-unassigned', section)}
                    id="year-unassigned"
                    currentYear={view!.currentYear}
                    title="报告期待确认"
                    records={view!.unassigned}
                    open={expanded['year-unassigned'] ?? true}
                    onOpen={onOpen}
                    reference={false}
                    onRecord={openRecord}
                    onScrollProgress={synchronize}
                  />
                )}
              </div>
            </section>
          ) : (
            <div className="history-empty history-records">
              <h2>暂无分红记录</h2>
              <p className="history-muted">来源暂未提供这家公司的分红记录。</p>
            </div>
          )}
          <footer className="history-footer">
            <span>
              东方财富 · 获取于 {timeLabel(resource.response!.meta.fetchedAt)}
            </span>
            <details>
              <summary>数据说明</summary>
              <p>
                按报告期归属财年，仅统计已实施的现金分红，不表示款项已到账。金额未知显示“—”，明确为零才显示零。
              </p>
              <p>图表展示原始每股金额，不做复权。</p>
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
