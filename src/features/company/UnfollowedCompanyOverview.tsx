import { useDividends } from '../../data/api'
import { dividendStatusFor } from '../dividends/model'
import { isUsableQuote, quoteStatusFor } from '../watchlist/quotes'
import { useQuotes } from '../watchlist/useWatchlist'
import { CompanyOverview } from './CompanyOverview'

// Direct links work without adding a company to the user's watchlist.
// Followed companies continue to supply their existing row resources instead.
export function UnfollowedCompanyOverview({
  code,
  expectedYield,
  onClose,
}: {
  code: string
  expectedYield: string
  onClose: () => void
}) {
  const history = useDividends(code, 0)
  const quotes = useQuotes([code], 0)
  const item = quotes.items[code]
  const quote = item?.quote
  return (
    <CompanyOverview
      code={code}
      name={quote?.name ?? history.response?.data.company.name}
      quote={isUsableQuote(quote) ? quote : null}
      history={history}
      expectedYield={expectedYield}
      quoteLoading={quotes.loading}
      quoteStatus={quoteStatusFor(item, quotes.loading, quotes.error)}
      dividendStatus={dividendStatusFor(history)}
      onClose={onClose}
    />
  )
}
