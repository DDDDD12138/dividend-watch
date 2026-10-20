import { useEffect, useState } from 'react'
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

interface Resource<T> {
  response?: ApiResponse<T>
  loading: boolean
  error?: string
}
async function request<T>(
  path: string,
  signal: AbortSignal,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  })
  if (!response.ok) {
    if (response.status === 404) throw new Error('暂不支持该公司')
    throw new Error('数据暂不可用，请稍后重试')
  }
  return response.json() as Promise<ApiResponse<T>>
}
// 每个接口独立保留上次成功响应；切换参数或卸载时取消旧请求。
function useResource<T>(path: string | null, revision: number): Resource<T> {
  const key = `${path}:${revision}`
  const [state, setState] = useState<
    Omit<Resource<T>, 'loading'> & { key?: string }
  >({})
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    void request<T>(path, controller.signal).then(
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
  }, [path, key])
  const loading = path !== null && state.key !== key
  return {
    response: state.response,
    loading,
    error: loading ? undefined : state.error,
  }
}
export function useCompanies(revision: number) {
  return useResource<Company[]>('/api/companies', revision)
}
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
