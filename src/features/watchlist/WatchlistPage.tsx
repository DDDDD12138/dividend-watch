import { useState } from 'react'
import { Button } from '../../components/Button'
import { RefreshButton } from '../../components/RefreshButton'
import { validYield } from './model'
import { StockRow } from './StockRow'
import { SortMenu } from './SortMenu'
import { usePreferences, useQuotes } from './useWatchlist'
import { useWatchlistPosition } from './useWatchlistPosition'
import { useWatchlistOrder } from './useWatchlistOrder'
import { AddCompanyDialog } from './AddCompanyDialog'
import type { Company } from '../../../shared/api'
import { timeLabel } from '../../lib/format'
import './watchlist.css'

export function WatchlistPage() {
  useWatchlistPosition()
  const { preferences, update, storageError } = usePreferences()
  const [revision, setRevision] = useState(0)
  const ranking = useWatchlistOrder(preferences.codes, revision)
  const quotes = useQuotes(preferences.codes, revision)
  const [yieldInput, setYieldInput] = useState(preferences.expectedYield)
  const [addedNames, setAddedNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const refreshing = quotes.loading || ranking.loading
  const invalidYield = !validYield(yieldInput)
  const codes = preferences.sort === 'yield' ? ranking.order : preferences.codes
  const names = {
    ...addedNames,
    ...Object.fromEntries(
      (quotes.response?.data ?? []).flatMap((item) =>
        item.quote ? [[item.code, item.quote.name]] : [],
      ),
    ),
  }
  function add(company: Company) {
    if (
      preferences.codes.includes(company.code) ||
      preferences.codes.length >= 50
    )
      return
    setAddedNames((previous) => ({ ...previous, [company.code]: company.name }))
    const codes = [...preferences.codes, company.code]
    ranking.changeCompanies(codes)
    update({ ...preferences, codes })
    setNotice(`已添加 ${company.name}`)
  }
  function remove(code: string) {
    const codes = preferences.codes.filter((item) => item !== code)
    ranking.changeCompanies(codes)
    update({ ...preferences, codes })
    setNotice(`已移除 ${names[code] ?? code}`)
  }
  return (
    <main className="watchlist-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR DIVIDEND WATCHLIST</p>
          <h1>我关注的公司</h1>
          <p className="secondary">看看分红是否稳定，再看看现在的价格。</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setAdding(true)
          }}
        >
          ＋ 添加公司
        </Button>
      </header>
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
        </p>
      )}
      {ranking.error && (
        <p className="error-text" role="status">
          {ranking.error}
        </p>
      )}
      <section className="watchlist-surface" aria-label="自选公司">
        <div className="watchlist-toolbar">
          <h2 className="list-heading">
            关注列表 <span>{codes.length} 家</span>
          </h2>
          <div className="toolbar-actions">
            <div className="yield-control">
              <label htmlFor="expected-yield">期望股息率</label>
              <div className="yield-input">
                <input
                  id="expected-yield"
                  type="number"
                  min="0.01"
                  max="100"
                  step="any"
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  value={yieldInput}
                  aria-invalid={invalidYield}
                  aria-describedby={invalidYield ? 'yield-error' : undefined}
                  onChange={(event) => {
                    const value = event.target.value
                    setYieldInput(value)
                    if (validYield(value))
                      update({ ...preferences, expectedYield: value })
                  }}
                />
                <span>%</span>
              </div>
              {invalidYield && (
                <span id="yield-error" className="error-text">
                  请输入 0.01–100，当前按 {preferences.expectedYield}% 计算
                </span>
              )}
            </div>

            <SortMenu
              value={preferences.sort}
              onChange={(sort) => update({ ...preferences, sort })}
            />
            <RefreshButton
              refreshing={refreshing}
              onRefresh={() => {
                setRevision((value) => value + 1)
                setNotice('已请求刷新，数据将分别更新')
              }}
            />
          </div>
        </div>
        {quotes.error && codes.length > 0 && (
          <p className="table-message error-text" role="status">
            {quotes.response ? '行情更新失败' : '行情加载失败'}
          </p>
        )}
        {codes.length ? (
          <table className="stock-table">
            <colgroup>
              <col className="col-company" />
              <col className="col-trend" />
              <col className="col-dividend" />
              <col />
              <col />
              <col className="col-target" />
              <col className="col-gap" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">公司</th>
                <th scope="col">近 5 年分红 · 已实施合计</th>
                <th scope="col">上一财年分红</th>
                <th scope="col">当前价</th>
                <th scope="col">参考股息率</th>
                <th scope="col" className="target-cell">
                  目标价格
                </th>
                <th scope="col">距目标价格</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <StockRow
                  key={code}
                  code={code}
                  name={names[code]}
                  quote={quotes.response?.data.find(
                    (item) => item.code === code,
                  )}
                  quoteLoading={quotes.loading}
                  quoteError={quotes.error}
                  expectedYield={preferences.expectedYield}
                  revision={revision}
                  onResult={ranking.onResult}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              ＋
            </span>
            <h2>从第一家公司开始</h2>
            <p className="secondary">
              添加你关注的公司，查看历史分红与目标价格。
            </p>
            <Button onClick={() => setAdding(true)}>添加关注</Button>
          </div>
        )}
        <p className="table-footer">
          股息率与目标价格按上一财年税前每股已实施分红计算；数据不可用时不计算，不使用更早年份替代。
        </p>
      </section>
      <footer className="page-footer">
        <details className="data-info">
          <summary>数据说明</summary>
          <div>
            <p>
              行情来自腾讯，分红来自东方财富。打开页面或手动刷新时获取数据。
            </p>
            {quotes.response && (
              <p>行情获取时间：{timeLabel(quotes.response.meta.fetchedAt)}</p>
            )}
            <p>
              各公司行情时间见价格提示；“—”表示数据不可用，并非零分红。自选与设置保存在本浏览器。
            </p>
          </div>
        </details>
      </footer>
      <p className="sr-only" role="status">
        {notice}
      </p>
      {adding && (
        <AddCompanyDialog
          codes={preferences.codes}
          names={names}
          onAdd={add}
          onRemove={remove}
          onClose={() => setAdding(false)}
        />
      )}
    </main>
  )
}
