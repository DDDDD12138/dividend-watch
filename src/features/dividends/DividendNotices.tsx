import { Fragment } from 'react'
import type { DividendNotice, EastmoneyDividend } from '../../../shared/api'
import { dividendNotices, shareChanges } from '../../../shared/dividendNotices'
import { dividendNoticeContent as content } from './dividendNoticeContent'
import './dividend-notices.css'

type Props =
  | { mode: 'compact' | 'annual'; notices: DividendNotice[] }
  | { mode: 'records'; records: EastmoneyDividend[] }

export function DividendNotices(props: Props) {
  const messages =
    props.mode === 'records'
      ? props.records.flatMap((record) =>
          dividendNotices(record).map(({ code }) => {
            const text =
              code === 'SHARE_BASIS_CHANGED'
                ? `每 10 股${shareChanges(record)
                    .map(
                      ({ kind, ratio }) =>
                        `${kind === 'bonus' ? '送' : '转增'} ${ratio} 股`,
                    )
                    .join('、')}`
                : content[code].description
            return {
              key: `${record.recordId}/${code}`,
              code,
              text,
            }
          }),
        )
      : props.notices.map(({ code }) => ({
          key: code,
          code,
          text:
            props.mode === 'compact'
              ? content[code].short
              : `${content[code].description}。`,
        }))
  if (!messages.length) return null
  if (props.mode === 'compact') {
    return (
      <span className="dividend-notices dividend-notices--compact">
        {messages.map(({ key, code, text }) => (
          <Fragment key={key}>
            <span className="dividend-notices-separator"> · </span>
            <span
              className={`dividend-notice dividend-notice--${content[code].tone}`}
            >
              {text}
            </span>
          </Fragment>
        ))}
      </span>
    )
  }
  return (
    <div className={`dividend-notices dividend-notices--${props.mode}`}>
      {messages.map(({ key, code, text }) => (
        <p
          key={key}
          className={`dividend-notice dividend-notice--${content[code].tone}`}
        >
          {text}
        </p>
      ))}
    </div>
  )
}
