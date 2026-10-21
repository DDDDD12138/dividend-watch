import { useEffect } from 'react'
import type { QuoteItem } from '../../../shared/api'
import { metricsFor, recentYears } from './model'
import { percent, timeLabel } from '../../lib/format'
import { Link } from 'react-router'
import { useDividends } from '../../data/api'

interface Props {
  code: string
  name?: string
  quote?: QuoteItem
  quoteLoading: boolean
  quoteError?: string
  expectedYield: string
  revision: number
  onLoading: (code: string, revision: number, loading: boolean) => void
  onYield: (code: string, value: string | undefined) => void
}
export function StockRow({
  code,
  name,
  quote: item,
  quoteLoading,
  quoteError,
  expectedYield,
  revision,
  onYield,
  onLoading,
}: Props) {
  const history = useDividends(code, revision)
  useEffect(() => {
    onLoading(code, revision, history.loading)
  }, [code, revision, history.loading, onLoading])
  const data = history.response?.data
  const quote = item?.quote
  const metrics = metricsFor(data, quote, expectedYield)
  const referenceYield = metrics?.referenceYield
  useEffect(() => {
    onYield(code, referenceYield)
  }, [code, referenceYield, onYield])
  const years = data ? recentYears(data) : []
  const max = Math.max(...years.map((year) => Number(year.amount ?? 0)), 0)
  const reference = data?.referenceDividend
  const price = quote?.quoteTime ? quote.price : null
  const dividendStatus = history.error
    ? history.response
      ? '更新失败 · 保留旧数据'
      : '分红暂不可用'
    : data && !data.coverage.completeFetch
      ? '记录不完整'
      : data && !data.records.length
        ? '暂无分红记录'
        : data && !reference
          ? '暂无参考年度'
          : null
  const quoteStatus =
    !quoteError &&
    !quoteLoading &&
    (item?.error || (quote && (!quote.price || !quote.quoteTime)))
      ? '行情暂不可用'
      : null
  const dividendTitle = [
    reference ? `${reference.fiscalYear} 年税前每股分红` : '',
    history.response
      ? `获取于 ${timeLabel(history.response.meta.fetchedAt)}`
      : '',
    history.error ?? '',
  ]
    .filter(Boolean)
    .join('；')
  return (
    <tr>
      <th scope="row" className="company-cell">
        <strong>{quote?.name ?? name ?? data?.company.name ?? code}</strong>
        <span className="secondary">{code}</span>
      </th>
      <td className="trend-cell">
        <Link
          className="dividend-link"
          to={`/dividends/${code}`}
          aria-label={`查看 ${quote?.name ?? name ?? data?.company.name ?? code} 的分红记录`}
        >
          {years.length ? (
            <>
              <div
                className="trend"
                role="img"
                aria-label={years
                  .map(
                    ({ year, amount }) =>
                      `${year}年：${amount === null ? '未知' : `${amount}元每股`}`,
                  )
                  .join('；')}
              >
                {years.map(({ year, amount }) => (
                  <div
                    className="trend-track"
                    key={year}
                    title={`${year}：${amount === null ? '未知' : `${amount} 元/股`}`}
                  >
                    {amount === null ? (
                      <span className="trend-missing">—</span>
                    ) : amount === '0' ? (
                      <span className="trend-zero">0</span>
                    ) : (
                      <span
                        className="trend-bar"
                        style={{
                          height: `${max ? (Number(amount) / max) * 100 : 0}%`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <span className="secondary">
                {years[0].year} — {years[years.length - 1].year} · 明细
              </span>
            </>
          ) : (
            <span className="secondary">
              {history.loading ? '加载中…' : '暂无分红数据'}
            </span>
          )}
        </Link>
      </td>
      <td
        className="dividend-cell"
        data-label="参考年度分红"
        title={dividendTitle}
      >
        <strong className="money-value">
          {reference ? `¥${reference.cashPerShare}` : '—'}
        </strong>
        <span className="secondary">
          {reference
            ? `${reference.fiscalYear} · 每股 · 税前`
            : history.loading
              ? '加载中…'
              : null}
        </span>
        {dividendStatus && (
          <span className="row-status" role="status">
            {dividendStatus}
          </span>
        )}
      </td>
      <td
        className="price-cell"
        data-label="当前价"
        title={
          quote?.quoteTime
            ? `行情时间：${timeLabel(quote.quoteTime)}`
            : undefined
        }
      >
        <strong className="money-value">
          {price ? `¥${Number(price).toFixed(2)}` : '—'}
        </strong>
        {quoteStatus && <span className="row-status">{quoteStatus}</span>}
      </td>
      <td className="yield-cell" data-label="参考股息率">
        <strong className="yield-value">
          {metrics ? percent(metrics.referenceYield) : '—'}
        </strong>
      </td>
      <td data-label="目标价格" className="target-cell">
        <strong className="money-value">
          {metrics ? `¥${metrics.targetPrice}` : '—'}
        </strong>
      </td>
      <td data-label="距目标价格" className="gap-cell">
        {metrics ? (
          metrics.reached ? (
            <span className="status-badge">已达到</span>
          ) : (
            <>
              <span className="gap-label">需下跌 </span>
              <strong>{percent(metrics.requiredDrop, 1)}</strong>
            </>
          )
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}
