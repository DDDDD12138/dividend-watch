import { ArrowRight, Check, Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type {
  Company,
  CompanyProfile,
  DividendHistory,
  Quote,
} from '../../../shared/api'
import { calculateMetrics, calculateTargetPrice } from '../../../shared/money'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useResource, type Resource } from '../../data/api'
import { percent, timeLabel } from '../../lib/format'
import { marketNames } from '../dividends/model'
import { isUsableQuote } from '../watchlist/quotes'
import { PriceCalculator } from './PriceCalculator'
import './company.css'

interface Props {
  code: string
  name?: string
  quote: Quote | null
  history: Resource<DividendHistory>
  expectedYield: string
  quoteLoading: boolean
  quoteStatus: string | null
  dividendStatus: string | null
  followed: boolean
  followLimitReached: boolean
  followError: string
  onFollow: (company: Company) => void
  onUnfollow: () => void
  onClose: () => void
}

function MainBusiness({ text }: { text: string }) {
  const paragraph = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const element = paragraph.current!
    const measure = () =>
      setOverflows(
        element.scrollHeight >
          parseFloat(getComputedStyle(element).lineHeight) + 1,
      )
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [text])
  return (
    <div className="overview-business">
      <p ref={paragraph} className={expanded ? 'is-expanded' : undefined}>
        {text}
      </p>
      {overflows && (
        <Button
          variant="text"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '展开'}
        </Button>
      )}
    </div>
  )
}

export function CompanyOverview({
  code,
  name,
  quote,
  history,
  expectedYield,
  quoteLoading,
  quoteStatus,
  dividendStatus,
  followed,
  followLimitReached,
  followError,
  onFollow,
  onUnfollow,
  onClose,
}: Props) {
  const location = useLocation()
  const [revision, setRevision] = useState(0)
  const profile = useResource<CompanyProfile>(
    `/api/companies/${code}/profile`,
    revision,
  )
  const title = useRef<HTMLHeadingElement>(null)
  const data = profile.response?.data
  const company = data?.company ?? history.response?.data.company ?? quote
  const reference = history.response?.data.referenceDividend
  const dividend = reference?.cashPerShare ?? null
  const price = isUsableQuote(quote) ? quote.price : null
  const metrics = calculateMetrics(dividend, price, expectedYield)
  const target = metrics
    ? metrics.targetPrice
    : calculateTargetPrice(dividend, expectedYield)
  const referenceYield = metrics?.referenceYield ?? null

  return (
    <Modal
      title="公司概览"
      placement="side"
      className="company-overview"
      initialFocusRef={title}
      onClose={onClose}
    >
      <header className="overview-identity">
        <div className="overview-title">
          <h2 ref={title} tabIndex={-1}>
            {name ?? company?.name ?? code}
          </h2>
          <Button
            className="overview-follow"
            aria-label={followed ? '取消关注' : '关注'}
            disabled={!followed && (followLimitReached || !company)}
            onClick={() => {
              if (followed) onUnfollow()
              else if (company) onFollow(company)
            }}
          >
            {followed ? <Check /> : <Plus />}
            {followed ? '已关注' : '关注'}
          </Button>
        </div>
        <p className="overview-meta">
          {code}
          {company ? ` · ${marketNames[company.market]}` : ''}
          {data?.listingDate ? ` · A 股上市 ${data.listingDate}` : ''}
        </p>
        {followError && (
          <p className="error-text" role="alert">
            {followError}
          </p>
        )}
        {!followed && followLimitReached && (
          <p className="overview-follow-limit">最多关注 50 家公司</p>
        )}
        <div className="overview-profile" aria-busy={profile.loading}>
          {profile.loading && !data && (
            <p className="overview-profile-loading" role="status">
              公司资料加载中…
            </p>
          )}
          {profile.error && (
            <div className="overview-profile-error" role="status">
              <span>{data ? '公司资料更新失败' : '公司资料加载失败'}</span>
              <Button
                variant="text"
                loading={profile.loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                重试
              </Button>
            </div>
          )}
          {data?.mainBusiness && <MainBusiness text={data.mainBusiness} />}
          {profile.response?.meta.issues.some(
            (issue) => issue.code === 'INVALID_MAIN_BUSINESS',
          ) && (
            <p className="overview-meta" role="status">
              主营业务暂不可用
            </p>
          )}
        </div>
      </header>
      <section
        className="overview-quotes"
        aria-label="当前行情"
        aria-busy={quoteLoading}
      >
        <div>
          <span className="overview-label">当前价</span>
          <strong className="overview-number">
            {price === null ? (
              '—'
            ) : (
              <>
                <span className="overview-unit">¥</span>
                {Number(price).toFixed(2)}
              </>
            )}
          </strong>
        </div>
        <div>
          <span className="overview-label">参考股息率</span>
          <strong className="overview-number overview-yield">
            {referenceYield === null ? (
              '—'
            ) : (
              <>
                {percent(referenceYield).slice(0, -1)}
                <span className="overview-unit">%</span>
              </>
            )}
          </strong>
        </div>
      </section>
      <p className="overview-meta overview-quote-time">
        {quoteLoading
          ? '行情更新中…'
          : (quoteStatus ??
            (quote?.quoteTime
              ? `行情时间 ${timeLabel(quote.quoteTime)}`
              : '行情暂不可用'))}
      </p>
      <section className="overview-target" aria-label="期望价格">
        <div className="overview-target-heading">
          <span>
            期望股息率 {expectedYield}%
            <span className="overview-label">对应价格</span>
          </span>
          <strong className="overview-number">
            {target === null ? (
              '—'
            ) : (
              <>
                <span className="overview-unit">¥</span>
                {target}
              </>
            )}
          </strong>
        </div>
        {metrics && (
          <p className={metrics.reached ? 'is-reached' : undefined}>
            {metrics.reached ? (
              <b>已达到你的期望股息率</b>
            ) : (
              <>
                当前价还需下跌 <b>{percent(metrics.requiredDrop)}</b> 才达到
              </>
            )}
          </p>
        )}
      </section>
      <div className="overview-reference" aria-busy={history.loading}>
        <p>
          {reference ? (
            dividend === null ? (
              `${reference.fiscalYear} 财年每股分红暂不可用于计算`
            ) : (
              <>
                按 {reference.fiscalYear} 财年每股分红 <b>¥{dividend}</b> 试算 ·
                税前
              </>
            )
          ) : history.loading ? (
            '分红加载中…'
          ) : (
            '分红暂不可用'
          )}
          {dividendStatus && (
            <span className="overview-data-status" role="status">
              {dividendStatus}
            </span>
          )}
        </p>
        <Link
          to={`/dividends/${code}`}
          state={{ returnToOverview: location.pathname + location.search }}
        >
          分红记录 <ArrowRight />
        </Link>
      </div>
      <PriceCalculator
        dividend={dividend}
        price={price}
        expectedYield={expectedYield}
      />
      <p className="overview-source">行情：腾讯 · 公司资料与分红：东方财富</p>
    </Modal>
  )
}
