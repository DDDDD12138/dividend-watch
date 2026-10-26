import { useMemo, useState } from 'react'
import type { AllocationHistory, DividendHistory } from '../../../shared/api'
import type { Resource } from '../../data/api'
import { ChartLegend } from './ChartLegend'
import { AllocationChart, type AllocationLayer } from './AllocationChart'
import { AllocationDialog, type AllocationSelection } from './AllocationDialog'
import { allocationView } from './allocationModel'
import type { HistoryRange } from '../../lib/historyYears'

export function AllocationPanel({
  resource,
  range,
  history,
  onYear,
  emphasis,
  onEmphasis,
  listingDate,
}: {
  resource: Resource<AllocationHistory>
  range: HistoryRange
  history?: DividendHistory
  onYear: (year: number) => void
  emphasis: AllocationLayer | null
  onEmphasis: (layer: AllocationLayer | null) => void
  listingDate?: string | null
}) {
  const data = resource.response?.data
  const points = useMemo(
    () => (data ? allocationView(data, range) : []),
    [data, range],
  )
  const [selected, setSelected] = useState<AllocationSelection | null>(null)
  const notice =
    data && !data.coverage.completeFetch
      ? '年度统计不完整，缺失年份保持未知'
      : null
  return (
    <>
      <div className="history-chart-toolbar">
        <ChartLegend
          label="分红比例观察重点"
          items={[
            { value: 'profit', label: '归母净利润', tone: 'total' },
            { value: 'cash', label: '现金分红', tone: 'record' },
          ]}
          value={emphasis}
          onChange={onEmphasis}
          disabled={!points.length}
        />
        {points.length > 0 && (
          <span className="history-range-dates">
            {points[0].year} — {points.at(-1)!.year}
          </span>
        )}
      </div>
      <AllocationChart
        listingDate={listingDate}
        points={points}
        emphasis={emphasis}
        emptyContent={
          resource.loading ? (
            <p role="status">正在加载年度盈利与分红统计…</p>
          ) : resource.error ? (
            <p className="history-warning" role="alert">
              {resource.error}
            </p>
          ) : (
            <p>来源暂无已结束财年的盈利与分红统计。</p>
          )
        }
        onSelect={(point) =>
          setSelected({
            point,
            fetchedAt: resource.response!.meta.fetchedAt,
          })
        }
      />
      {resource.error && resource.response && (
        <p className="allocation-notice history-warning" role="alert">
          年度统计更新失败
        </p>
      )}
      {notice && (
        <p className="allocation-notice history-warning" role="status">
          {notice}
        </p>
      )}
      {selected && (
        <AllocationDialog
          selection={selected}
          onClose={() => setSelected(null)}
          dividend={history?.annualSummaries.find(
            (row) => row.fiscalYear === selected.point.year,
          )}
          onYear={
            history?.records.some(
              (row) => row.fiscalYear === selected.point.year,
            )
              ? onYear
              : undefined
          }
        />
      )}
    </>
  )
}
