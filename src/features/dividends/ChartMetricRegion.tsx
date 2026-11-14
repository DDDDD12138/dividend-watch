import type { ReactNode } from 'react'

export interface ChartMetricInfo {
  title: string
  basis?: string
  hint?: string
  status?: string
}

export function ChartMetricRegion({
  title,
  basis,
  hint,
  status,
  children,
}: ChartMetricInfo & { children?: ReactNode }) {
  return (
    <section className="chart-metrics" aria-label={title}>
      <div className="chart-metric-heading">
        <h3 className="allocation-ratio-heading">{title}</h3>
        {basis && (
          <span className="chart-metric-basis" title={hint ?? basis}>
            {basis}
          </span>
        )}
        {status && (
          <span className="chart-metric-status" role="status">
            {status}
          </span>
        )}
      </div>
      <div className="chart-metric-values">{children}</div>
    </section>
  )
}
