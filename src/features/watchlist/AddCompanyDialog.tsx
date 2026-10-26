import { useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import type { Company } from '../../../shared/api'
import { useCompanySearch } from './useWatchlist'

const marketNames = { SH: '沪市', SZ: '深市', BJ: '北交所' }
export function AddCompanyDialog({
  codes,
  names,
  onAdd,
  onRemove,
  onClose,
}: {
  codes: string[]
  names: Record<string, string>
  onAdd: (company: Company) => void
  onRemove: (code: string) => void
  onClose: () => void
}) {
  const searchInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const search = useCompanySearch(query, composing, revision)
  const full = codes.length >= 50
  return (
    <Modal
      title="添加关注"
      className="add-dialog"
      initialFocusRef={searchInput}
      onClose={onClose}
    >
      <p className="secondary" id="company-scope">
        搜索沪、深、北交易所 A 股
      </p>
      <label className="sr-only" htmlFor="company-search">
        公司名称或代码
      </label>
      <input
        ref={searchInput}
        id="company-search"
        className="company-search"
        placeholder="输入公司名称或代码"
        maxLength={50}
        value={query}
        autoComplete="off"
        aria-describedby="company-scope"
        onChange={(event) => setQuery(event.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setQuery(event.currentTarget.value)
          setComposing(false)
        }}
      />
      {full && (
        <p className="error-text">最多关注 50 家公司，请先移除部分关注。</p>
      )}
      <div className="search-status" role="status">
        {search.loading ? (
          '正在搜索…'
        ) : search.error ? (
          <>
            {search.error}{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              重试
            </button>
          </>
        ) : query.trim() && !composing && search.response?.data.length === 0 ? (
          '没有匹配的 A 股公司'
        ) : (
          notice
        )}
      </div>
      {!!search.response?.meta.issues.length && (
        <p className="error-text">部分搜索结果无法确认身份，已省略。</p>
      )}
      {!!search.response?.data.length && (
        <ul className="company-choices" aria-label="搜索结果">
          {search.response.data.map((company) => {
            const added = codes.includes(company.code)
            return (
              <li key={company.code}>
                <div>
                  <strong>{company.name}</strong>
                  <span className="secondary">
                    {company.code} · {marketNames[company.market]}
                  </span>
                </div>
                <button
                  type="button"
                  className="button"
                  disabled={added || full}
                  onClick={() => {
                    onAdd(company)
                    setNotice(`已添加 ${company.name}`)
                  }}
                >
                  {added ? '已关注' : '添加'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {codes.length > 0 && (
        <section className="followed-companies" aria-label="已关注公司">
          <h3>
            已关注 <span className="secondary">{codes.length} 家</span>
          </h3>
          <ul className="company-choices">
            {codes.map((code) => (
              <li key={code}>
                <div>
                  <strong>{names[code] ?? code}</strong>
                  {names[code] && <span className="secondary">{code}</span>}
                </div>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`移除 ${names[code] ?? code}`}
                  onClick={() => {
                    onRemove(code)
                    setNotice(`已移除 ${names[code] ?? code}`)
                  }}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  )
}
