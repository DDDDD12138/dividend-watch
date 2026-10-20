import { useCallback, useEffect, useRef, useState } from 'react'
import { compareYields, timeLabel, validYield } from './model'
import { StockRow } from './StockRow'
import { SortMenu } from './SortMenu'
import { useCompanies, usePreferences, useQuotes } from './useWatchlist'
import './watchlist.css'

export function WatchlistPage() {
  const { preferences, update, storageError } = usePreferences()
  const [revision, setRevision] = useState(0)
  const [dividendRequests, setDividendRequests] = useState<
    Record<string, { revision: number; loading: boolean }>
  >({})
  const onLoading = useCallback(
    (code: string, revision: number, loading: boolean) => {
      setDividendRequests((previous) => {
        if (
          previous[code]?.revision === revision &&
          previous[code]?.loading === loading
        )
          return previous
        return { ...previous, [code]: { revision, loading } }
      })
    },
    [],
  )
  const companies = useCompanies(revision)
  const quotes = useQuotes(preferences.codes, revision)
  const [yieldInput, setYieldInput] = useState(preferences.expectedYield)
  const [yields, setYields] = useState<Record<string, string | undefined>>({})
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const onYield = useCallback((code: string, value: string | undefined) => {
    setYields((previous) =>
      previous[code] === value ? previous : { ...previous, [code]: value },
    )
  }, [])
  useEffect(() => {
    if (!adding) return
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [adding])
  const refreshing =
    companies.loading ||
    quotes.loading ||
    preferences.codes.some(
      (code) =>
        dividendRequests[code]?.revision !== revision ||
        dividendRequests[code]?.loading,
    )
  const invalidYield = !validYield(yieldInput)
  const codes = [...preferences.codes]
  if (preferences.sort === 'yield')
    codes.sort((a, b) => compareYields(yields[a], yields[b]))
  const available = companies.response?.data ?? []
  const followed = preferences.codes
    .filter((code) => !available.some((company) => company.code === code))
    .map((code) => ({
      code,
      name:
        quotes.response?.data.find((item) => item.code === code)?.quote?.name ??
        code,
    }))
  const choices = [...available, ...followed].filter((company) =>
    `${company.name}${company.code}`.includes(search.trim()),
  )
  function remove(code: string) {
    update({
      ...preferences,
      codes: preferences.codes.filter((item) => item !== code),
    })
    setYields((previous) => {
      const next = { ...previous }
      delete next[code]
      return next
    })
    setNotice(
      `已移除 ${companies.response?.data.find((company) => company.code === code)?.name ?? code}`,
    )
  }
  return (
    <main className="watchlist-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR DIVIDEND WATCHLIST</p>
          <h1>我关注的公司</h1>
          <p className="secondary">看看分红是否稳定，再看看现在的价格。</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            setSearch('')
            setAdding(true)
          }}
        >
          ＋ 添加公司
        </button>
      </header>
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
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
            <button
              className="refresh-button"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={() => {
                setRevision((value) => value + 1)
                setNotice('已请求刷新，数据将分别更新')
              }}
            >
              <svg
                className={refreshing ? 'is-spinning' : undefined}
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5" />
              </svg>
              {refreshing ? '刷新中' : '刷新'}
            </button>
          </div>
        </div>
        {quotes.error && codes.length > 0 && (
          <p className="table-message error-text" role="status">
            行情{quotes.response ? '刷新失败，当前保留上次数据' : '加载失败'}
            。请重试。
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
                <th scope="col">近 5 年分红 · 年度合计</th>
                <th scope="col">参考年度分红</th>
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
                  name={
                    companies.response?.data.find(
                      (company) => company.code === code,
                    )?.name
                  }
                  quote={quotes.response?.data.find(
                    (item) => item.code === code,
                  )}
                  quoteLoading={quotes.loading}
                  quoteError={quotes.error}
                  expectedYield={preferences.expectedYield}
                  revision={revision}
                  onYield={onYield}
                  onLoading={onLoading}
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
            <button className="button" onClick={() => setAdding(true)}>
              添加关注
            </button>
          </div>
        )}
        <p className="table-footer">
          参考股息率与目标价格均按参考年度的税前每股现金分红计算。
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
        <dialog
          className="add-dialog"
          ref={dialog}
          aria-labelledby="add-title"
          onCancel={() => setAdding(false)}
          onClose={() => setAdding(false)}
        >
          <div className="dialog-heading">
            <h2 id="add-title">添加关注</h2>
            <button
              className="button"
              aria-label="关闭添加公司"
              onClick={() => setAdding(false)}
            >
              关闭
            </button>
          </div>
          <p className="secondary" id="company-scope">
            当前仅支持已接入的三家银行，可按名称或代码查找。
          </p>
          <label className="sr-only" htmlFor="company-search">
            公司名称或代码
          </label>
          <input
            id="company-search"
            className="company-search"
            placeholder="搜索公司名称或代码"
            maxLength={50}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="company-scope"
          />
          {companies.loading && <p role="status">正在获取公司列表…</p>}
          {companies.error && (
            <p className="error-text" role="alert">
              {companies.error}{' '}
              <button
                className="text-button"
                onClick={() => setRevision((value) => value + 1)}
              >
                重试
              </button>
            </p>
          )}
          {!!companies.response?.meta.issues.length && (
            <p className="error-text">部分公司资料暂不可用，请稍后刷新。</p>
          )}
          <ul className="company-choices">
            {choices.map((company) => {
              const added = preferences.codes.includes(company.code)
              return (
                <li key={company.code}>
                  <div>
                    <strong>{company.name}</strong>
                    <span className="secondary">{company.code}</span>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      if (added) {
                        remove(company.code)
                        return
                      }
                      update({
                        ...preferences,
                        codes: [...preferences.codes, company.code],
                      })
                      setNotice(`已添加 ${company.name}`)
                    }}
                  >
                    {added ? '移除关注' : '添加'}
                  </button>
                </li>
              )
            })}
          </ul>
          {!choices.length && !companies.loading && !companies.error && (
            <p className="secondary">没有匹配的公司</p>
          )}
        </dialog>
      )}
    </main>
  )
}
