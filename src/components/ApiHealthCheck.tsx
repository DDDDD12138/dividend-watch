import { useState } from 'react'

export function ApiHealthCheck() {
  const [status, setStatus] = useState('尚未检查')
  const [pending, setPending] = useState(false)

  async function checkHealth() {
    setPending(true)
    setStatus('正在检查…')
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: unknown = await response.json()
      if (
        typeof data !== 'object' ||
        data === null ||
        !('status' in data) ||
        data.status !== 'ok' ||
        !('service' in data) ||
        data.service !== 'dividend-watch'
      ) {
        throw new Error('接口响应格式不正确')
      }
      setStatus('Worker API 已连接')
    } catch (error) {
      setStatus(
        error instanceof Error ? `连接失败：${error.message}` : '连接失败',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={checkHealth}>
        检查 API 连接
      </button>
      <p role="status">{status}</p>
    </div>
  )
}
