import { useEffect, useState } from 'react'
import { createRequestQueue } from './requestQueue'
import type {
  ApiResponse,
  Company,
  DividendHistory,
  QuoteItem,
} from '../../../shared/api'
import {
  defaultPreferences,
  parsePreferences,
  STORAGE_KEY,
  type Preferences,
} from './model'

export interface Resource<T> {
  response?: ApiResponse<T>
  loading: boolean
  error?: string
}
async function request<T>(
  path: string,
  signal: AbortSignal,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!response.ok) {
    if (response.status === 404) throw new Error('暂不支持该公司')
    throw new Error('数据暂不可用，请稍后重试')
  }
  return response.json() as Promise<ApiResponse<T>>
}
// 每个接口独立保留上次成功响应；切换参数或卸载时取消旧请求。
function useResource<T>(
  path: string | null,
  revision: number,
  load: typeof request<T> = request<T>,
): Resource<T> {
  const key = `${path}:${revision}`
  const [state, setState] = useState<
    Omit<Resource<T>, 'loading'> & { key?: string }
  >({})
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    void load(path, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted) setState({ response, key })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            key,
            error:
              error instanceof Error && error.name === 'TimeoutError'
                ? '请求超时，请重试'
                : error instanceof TypeError
                  ? '网络连接失败，请重试'
                  : error instanceof Error
                    ? error.message
                    : '请求失败，请重试',
          }))
      },
    )
    return () => controller.abort()
  }, [path, key, load])
  const loading = path !== null && state.key !== key
  return {
    response: state.response,
    loading,
    error: loading ? undefined : state.error,
  }
}
export function useCompanySearch(
  query: string,
  composing: boolean,
  revision: number,
) {
  const text = query.trim()
  const key = `${text}:${revision}`
  const [state, setState] = useState<{
    key: string
    response?: ApiResponse<Company[]>
    error?: string
  }>()
  useEffect(() => {
    if (!text || composing) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void request<Company[]>(
        `/api/companies?q=${encodeURIComponent(text)}`,
        controller.signal,
      ).then(
        (response) => {
          if (!controller.signal.aborted) setState({ key, response })
        },
        () => {
          if (!controller.signal.aborted)
            setState({ key, error: '搜索暂不可用，请重试' })
        },
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, key, composing])
  const current = !composing && text && state?.key === key ? state : undefined
  return {
    response: current?.response,
    error: current?.error,
    loading: !!text && !composing && !current,
  }
}
const dividendQueue = createRequestQueue(4)
const loadDividends = (path: string, signal: AbortSignal) =>
  dividendQueue(() => request<DividendHistory>(path, signal), signal)
export function useQuotes(codes: string[], revision: number) {
  return useResource<QuoteItem[]>(
    codes.length ? `/api/quotes?codes=${codes.join(',')}` : null,
    revision,
  )
}
export function useDividends(code: string, revision: number) {
  return useResource<DividendHistory>(
    `/api/companies/${code}/dividends`,
    revision,
    loadDividends,
  )
}
export function usePreferences() {
  const [initial] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return {
        preferences: saved ? parsePreferences(saved) : defaultPreferences,
        error: '',
      }
    } catch {
      return {
        preferences: defaultPreferences,
        error: '无法读取本地设置，当前使用默认设置；原记录未被覆盖。',
      }
    }
  })
  const [preferences, setPreferences] = useState(initial.preferences)
  const [storageError, setStorageError] = useState(initial.error)
  function update(next: Preferences) {
    setPreferences(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
    } catch {
      setStorageError('本地保存失败，本次修改仅在当前页面有效。')
    }
  }
  return { preferences, update, storageError }
}
