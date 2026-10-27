import { ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '../../components/Button'
import { Modal, type ModalHandle } from '../../components/Modal'
import type { AnnualDividend } from '../../../shared/api'
import { timeLabel } from '../../lib/format'
import { cash } from './model'
import { allocationAmount, type AllocationPoint } from './allocationModel'

export interface AllocationSelection {
  point: AllocationPoint
  fetchedAt: string
}
export function AllocationDialog({
  selection,
  dividend,
  onClose,
  onYear,
}: {
  selection: AllocationSelection
  dividend?: AnnualDividend
  onClose: () => void
  onYear?: (year: number) => void
}) {
  const modal = useRef<ModalHandle>(null)
  const { point, fetchedAt } = selection
  const row = point.record!
  return (
    <Modal
      ref={modal}
      title={`${point.year} 财年 · 分红比例`}
      className="allocation-dialog"
      onClose={onClose}
    >
      <div className="allocation-overview">
        <div className="allocation-hero">
          <p className="allocation-caption">现金分红比例</p>
          <div
            className={`allocation-ratio${point.ratio === null ? ' is-missing' : ''}`}
          >
            {point.ratio === null ? (
              '—'
            ) : (
              <>
                {point.ratio}
                <span>%</span>
              </>
            )}
          </div>
          <p className="allocation-context">
            {point.ratio !== null
              ? '同年已实施现金分红总额 / 归母净利润'
              : row.netProfit !== null && Number(row.netProfit) <= 0
                ? '归母净利润非正，不展示分红比例'
                : '计算所需的同口径金额未提供'}
          </p>
        </div>
        <div className="allocation-amounts">
          <div>
            <p className="allocation-caption">归母净利润</p>
            <strong
              title={row.netProfit === null ? undefined : `${row.netProfit} 元`}
            >
              {allocationAmount(row.netProfit)}
              {row.netProfit !== null && <small> 亿元</small>}
            </strong>
            <span className="allocation-change">
              {point.growth === null ? '同比 —' : `同比 ${point.growth}`}
            </span>
          </div>
          <div>
            <p className="allocation-caption">已实施现金分红总额</p>
            <strong
              title={
                row.cashDividend === null ? undefined : `${row.cashDividend} 元`
              }
            >
              {allocationAmount(row.cashDividend)}
              {row.cashDividend !== null && <small> 亿元</small>}
            </strong>
          </div>
        </div>
        {dividend && (
          <div className="allocation-per-share">
            <div>
              <p className="allocation-caption">年度每股现金分红</p>
              <span>
                共 {dividend.implementedRecordCount} 条实施记录 · 税前
              </span>
            </div>
            <strong>{cash(dividend.implementedTotal)}</strong>
          </div>
        )}
        <details className="allocation-basis">
          <summary>计算口径</summary>
          <p>
            利润和现金分红总额取自东方财富同一财年的年度统计，仅使用已实施金额，不计入预案。显示单位为亿元，比例按原始金额计算后四舍五入至一位小数。
          </p>
          <p>
            {row.netProfit !== null && row.cashDividend !== null
              ? `原始金额：现金分红 ${row.cashDividend} 元；归母净利润 ${row.netProfit} 元。`
              : '来源未提供的金额保持未知，不按零处理。'}
          </p>
          <p>
            每股金额独立按分红明细的已实施记录汇总。利润同比仅在相邻财年数据均可用、上年利润为正时展示。分红超过当年利润或当年亏损时，图中将两项金额分开绘制。
          </p>
          <p>
            现金分红可能使用历年积累，不能将柱内浅色区域解释为会计意义上的“未分配利润”。
          </p>
        </details>
        <div className="allocation-actions">
          <span>东方财富 · {timeLabel(fetchedAt)}</span>
          {onYear && (
            <Button
              onClick={() => {
                modal.current?.close()
                onYear(point.year)
              }}
            >
              查看当年分红记录
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
