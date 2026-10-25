import { reconcileOrder } from './order'

export const YIELD_ORDER_KEY = 'dividend-watch.yield-order'

export function readYieldOrder(codes: string[]) {
  try {
    const text = localStorage.getItem(YIELD_ORDER_KEY)
    const saved: unknown = text === null ? [] : JSON.parse(text)
    if (
      !Array.isArray(saved) ||
      !saved.every(
        (code) => typeof code === 'string' && /^\d{6}$/.test(code),
      ) ||
      new Set(saved).size !== saved.length
    )
      throw new Error('Invalid saved order')
    return { order: reconcileOrder(saved, codes), error: '' }
  } catch {
    return { order: [...codes], error: '排序记录读取失败' }
  }
}

export function writeYieldOrder(order: string[]): string {
  try {
    const text = JSON.stringify(order)
    if (localStorage.getItem(YIELD_ORDER_KEY) !== text)
      localStorage.setItem(YIELD_ORDER_KEY, text)
    return ''
  } catch {
    return '排序记录保存失败'
  }
}
