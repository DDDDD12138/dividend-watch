import type { ReactNode } from 'react'

export interface ChartMetricInfo {
  controls?: ReactNode
  title: string
  basis?: string
  hint?: string
  status?: string
}

export function ChartMetricRegion({
  controls,
  title,
  basis,
  hint,
  status,
  children,
}: ChartMetricInfo & { children?: ReactNode }) {
  return (
    <section className="chart-metrics" aria-label={title}>
      <div className="chart-metric-heading">
        <div className="chart-metric-info">
          <div className="chart-metric-label">
            <h3 className="allocation-ratio-heading" title={hint}>
              {title}
            </h3>
            {basis && (
              <span className="chart-metric-basis" title={hint ?? basis}>
                <span aria-hidden="true">· </span>
                {basis}
              </span>
            )}
          </div>
          {status && (
            <span className="chart-metric-status" role="status" title={status}>
              {status}
            </span>
          )}
        </div>
        {controls}
      </div>
      <div className="chart-metric-values">{children}</div>
    </section>
  )
}
