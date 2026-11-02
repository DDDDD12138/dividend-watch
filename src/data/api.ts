import { useEffect, useState } from 'react'
import {
  MAX_WATCHLIST_SIZE,
  type ApiErrorCode,
  type ApiResponse,
  type DividendHistory,
} from '../../shared/api'

const unavailableMessage = '数据暂不可用，请稍后重试'
const errorMessages: Record<ApiErrorCode, string> = {
  INVALID_QUERY: '请输入 1–50 字符的公司名称或代码',
  INVALID_CODES: `请提供最多 ${MAX_WATCHLIST_SIZE} 个六位股票代码`,
  INVALID_CODE: '股票代码必须为六位数字',
  UNSUPPORTED_COMPANY: '暂不支持该公司',
  NOT_FOUND: '接口不存在，请刷新页面后重试',
  UPSTREAM_UNAVAILABLE: unavailableMessage,
  INTERNAL_ERROR: '服务出现异常，请稍后重试',
}

function apiErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object' || !('error' in body))
    return unavailableMessage
  const error = body.error
  if (!error || typeof error !== 'object' || !('code' in error))
    return unavailableMessage
  const code = error.code
  return typeof code === 'string' && Object.hasOwn(errorMessages, code)
    ? errorMessages[code as ApiErrorCode]
    : unavailableMessage
}

export interface Resource<T> {
  response?: ApiResponse<T>
  loading: boolean
  error?: string
}
export function requestError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError')
    return '请求超时，请重试'
  if (error instanceof TypeError) return '网络连接失败，请重试'
  return error instanceof Error ? error.message : '请求失败，请重试'
}
export async function request<T>(
  path: string,
  signal: AbortSignal,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
    throw new Error(apiErrorMessage(body))
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
            error: requestError(error),
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
export function useDividends(code: string, revision: number) {
  return useResource<DividendHistory>(
    `/api/companies/${code}/dividends`,
    revision,
  )
}
