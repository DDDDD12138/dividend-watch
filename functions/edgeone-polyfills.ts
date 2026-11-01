// EdgeOne 边缘运行时（实测 2026-11）缺少三个 Web 标准 API：
// AbortSignal.timeout、AbortSignal.any（DOM 标准）与 Response.json（Fetch 标准）。
// 这里按规范实现并以 polyfill 方式安装：原生存在时不触碰，仅补缺失项。
// 只在 EdgeOne 入口加载，worker/ 下的业务代码保持标准写法。

export function timeoutSignal(milliseconds: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(
    () =>
      controller.abort(new Error(`Signal timed out after ${milliseconds}ms`)),
    milliseconds,
  )
  return controller.signal
}

export function anySignal(signals: Iterable<AbortSignal>): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    })
  }
  return controller.signal
}

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(data), { ...init, headers })
}

type SignalStatics = {
  timeout?: (milliseconds: number) => AbortSignal
  any?: (signals: Iterable<AbortSignal>) => AbortSignal
}
type ResponseStatics = {
  json?: (data: unknown, init?: ResponseInit) => Response
}
export interface PolyfillTarget {
  AbortSignal: SignalStatics
  Response: ResponseStatics
}

/** 安装缺失的 API；返回实际安装了哪些，便于测试与排查。 */
export function installEdgeOnePolyfills(
  target: PolyfillTarget = globalThis as unknown as PolyfillTarget,
): string[] {
  const installed: string[] = []
  if (!target.AbortSignal.timeout) {
    target.AbortSignal.timeout = timeoutSignal
    installed.push('AbortSignal.timeout')
  }
  if (!target.AbortSignal.any) {
    target.AbortSignal.any = anySignal
    installed.push('AbortSignal.any')
  }
  if (!target.Response.json) {
    target.Response.json = jsonResponse
    installed.push('Response.json')
  }
  return installed
}

installEdgeOnePolyfills()
