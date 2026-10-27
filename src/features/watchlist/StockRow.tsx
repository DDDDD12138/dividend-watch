import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { metricsFor, recentYears } from './model'
import { percent, timeLabel } from '../../lib/format'
import { Link } from 'react-router'
import { useDividends } from '../../data/api'
import { issueText } from '../dividends/model'
import type { StockRowResult } from './order'
import { isUsableQuote, type WatchlistQuote } from './quotes'

interface Props {
  code: string
  name?: string
  item?: WatchlistQuote
  quoteLoading: boolean
  quoteError?: string
  expectedYield: string
  revision: number
  onResult: (code: string, result: StockRowResult) => void
}
export function StockRow({
  code,
  name,
  item,
  quoteLoading,
  quoteError,
  expectedYield,
  revision,
  onResult,
}: Props) {
  const history = useDividends(code, revision)
  const data = history.response?.data
  const quote = item?.quote
  const metrics = metricsFor(data, quote, expectedYield)
  const referenceYield = metrics?.referenceYield
  const loading = history.loading || quoteLoading
  useEffect(() => {
    onResult(code, { revision, loading, yield: referenceYield })
  }, [code, revision, loading, referenceYield, onResult])
  const years = data ? recentYears(data) : []
  const max = Math.max(...years.map((year) => Number(year.amount ?? 0)), 0)
  const reference = data?.referenceDividend
  const price = isUsableQuote(quote) ? quote.price : null
  const dividendStatus = history.error
    ? history.response
      ? '更新失败'
      : '分红加载失败'
    : reference?.issues[0]
      ? issueText(reference.issues[0])
      : null
  const quoteStatus =
    !quoteLoading && (quoteError || item?.failed || !quote)
      ? isUsableQuote(quote)
        ? '更新失败'
        : '行情暂不可用'
      : null
  const dividendTitle = [
    reference ? `${reference.fiscalYear} 财年税前每股已实施分红` : '',
    ...(reference?.issues.map(issueText) ?? []),
    history.response
      ? `获取于 ${timeLabel(history.response.meta.fetchedAt)}`
      : '',
    history.error ?? '',
  ]
    .filter(Boolean)
    .join('；')
  return (
    <tr aria-busy={loading}>
      <th scope="row" className="company-cell">
        <strong>
          <Link className="company-name-link" to={`/dividends/${code}`}>
            {quote?.name ?? name ?? data?.company.name ?? code}
          </Link>
        </strong>
        <span className="secondary company-meta">
          {code}
          <span className="row-refresh">
            {loading && (
              <LoaderCircle
                className="is-spinning"
                role="img"
                aria-label="更新中"
              >
                <title>更新中</title>
              </LoaderCircle>
            )}
          </span>
        </span>
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
            <>
              <div className="trend" aria-hidden="true" />
              <span className="secondary">
                {history.loading ? '加载中…' : '分红加载失败'}
              </span>
            </>
          )}
        </Link>
      </td>
      <td
        className="dividend-cell"
        data-label="上一财年分红"
        title={dividendTitle}
      >
        <strong className="money-value">
          {reference?.cashPerShare != null ? `¥${reference.cashPerShare}` : '—'}
        </strong>
        <span className="secondary">
          {reference ? '每股 · 税前' : history.loading ? '加载中…' : null}
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
