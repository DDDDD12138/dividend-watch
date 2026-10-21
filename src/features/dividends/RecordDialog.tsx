import { useEffect, useId, useRef } from 'react'
import type { Company, EastmoneyDividend } from '../../../shared/api'
import { cash } from './model'
import { timeLabel } from '../../lib/format'

export function RecordDialog({
  record,
  company,
  fetchedAt,
  onClose,
}: {
  record: EastmoneyDividend
  company: Company
  fetchedAt: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const fields = [
    ['公司', `${company.name} · ${company.code}`],
    [
      '所属财年',
      record.fiscalYear == null ? '未提供' : `${record.fiscalYear} 年`,
    ],
    ['报告期', record.reportDate],
    ['来源进度', record.progress],
    ['每 10 股税前现金', cash(record.cashPerTenShares)],
    ['股权登记日', record.recordDate],
    ['除权除息日', record.exDate],
    ['预案公告日期', record.planNoticeDate],
    ['最新公告日期', record.latestNoticeDate],
    ['每 10 股送股', record.bonusRatio],
    ['每 10 股转增', record.transferRatio],
  ]
  return (
    <dialog
      className="record-dialog"
      ref={dialog}
      aria-labelledby={title}
      onCancel={onClose}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose()
      }}
    >
      <div className="record-dialog-heading">
        <h2 id={title}>分红记录</h2>
        <button
          className="history-button"
          onClick={onClose}
          aria-label="关闭分红记录"
        >
          关闭
        </button>
      </div>
      <div className="record-amount">
        <span>每股现金分红 · 税前</span>
        <strong>{cash(record.cashPerShare)}</strong>
      </div>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '未提供'}</dd>
          </div>
        ))}
      </dl>
      {record.description && (
        <section className="record-description">
          <h3>来源方案说明</h3>
          <p>{record.description}</p>
        </section>
      )}
      {!!record.issues.length && (
        <p className="history-warning">
          部分来源字段缺失或异常，未知值已保留为空。
        </p>
      )}
      <p className="history-muted">东方财富 · 获取于 {timeLabel(fetchedAt)}</p>
    </dialog>
  )
}
