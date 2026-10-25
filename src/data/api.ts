import { useEffect, useState } from 'react'
import type { ApiResponse, DividendHistory } from '../../shared/api'
import { createRequestQueue } from './requestQueue'

export interface Resource<T> {
  response?: ApiResponse<T>
  loading: boolean
  error?: string
}
export async function request<T>(
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
// Refreshes retain the last successful response for this path, never for a different resource.
export function useResource<T>(
  path: string | null,
  revision: number,
  load: typeof request<T> = request<T>,
): Resource<T> {
  const [state, setState] = useState<
    Resource<T> & { path: string | null; revision: number }
  >({
    path,
    revision,
    loading: path !== null,
  })
  if (state.path !== path || state.revision !== revision)
    setState({
      path,
      revision,
      response: state.path === path ? state.response : undefined,
      loading: path !== null,
    })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    void load(path, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted)
          setState({ response, path, revision, loading: false })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
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
  }, [path, revision, load])
  return {
    response: state.response,
    loading: state.loading,
    error: state.error,
  }
}
const dividendQueue = createRequestQueue(4)
const loadDividends = (path: string, signal: AbortSignal) =>
  dividendQueue(() => request<DividendHistory>(path, signal), signal)
export function useDividends(code: string, revision: number) {
  return useResource<DividendHistory>(
    `/api/companies/${code}/dividends`,
    revision,
    loadDividends,
  )
}
