import type { ComponentProps } from 'react'
import { useDividends } from '../../data/api'
import { dividendStatusFor } from '../dividends/model'
import { quoteStatusFor } from '../watchlist/quotes'
import { useQuotes } from '../watchlist/useQuotes'
import { CompanyOverview } from './CompanyOverview'

type Props = Pick<
  ComponentProps<typeof CompanyOverview>,
  | 'code'
  | 'name'
  | 'expectedYield'
  | 'followed'
  | 'followLimitReached'
  | 'followError'
  | 'onFollow'
  | 'onUnfollow'
  | 'onClose'
>

// Requests and trial state live with the dialog, independently of list membership.
export function CompanyOverviewDialog({ code, name, ...props }: Props) {
  const history = useDividends(code, 0)
  const quotes = useQuotes([code], 0)
  const item = quotes.items[code]
  const quote = item?.quote
  return (
    <CompanyOverview
      code={code}
      name={quote?.name ?? name ?? history.response?.data.company.name}
      quote={quote ?? null}
      history={history}
      {...props}
      quoteLoading={quotes.loading}
      quoteStatus={quoteStatusFor(item, quotes.loading, quotes.error)}
      dividendStatus={dividendStatusFor(history)}
    />
  )
}
