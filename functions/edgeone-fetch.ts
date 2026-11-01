import type { Fetcher } from '../worker/providers/http'

// EdgeOne 运行时的 fetch 会忽略 RequestInit.signal（实测：abort 后请求仍跑满）。
// 这里在等待侧实现 signal 语义：信号中止时立即以 reason 拒绝，上游请求本身不会被取消，
// 但调用方的超时预算、错误处理与 Cloudflare 上一致。
export const fetchWithSignal: Fetcher = (input, init) => {
  const signal = init?.signal
  if (!signal) return fetch(input, init)
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error('aborted'))
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    fetch(input, init)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}
