import { compareYields } from './model'

export interface StockRowResult {
  revision: number
  loading: boolean
  yield: string | undefined
}

export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((code, index) => code === b[index])
}

export function reconcileOrder(order: string[], codes: string[]): string[] {
  const followed = new Set(codes)
  const saved = new Set(order)
  return [
    ...order.filter((code) => followed.has(code)),
    ...codes.filter((code) => !saved.has(code)),
  ]
}

/** Sort the displayed values once every request in this refresh has settled. */
export function resolveOrder(
  order: string[],
  results: Partial<Record<string, StockRowResult>>,
  revision: number,
): { loading: boolean; order: string[] } {
  const yields = new Map<string, string | undefined>()
  for (const code of order) {
    const row = results[code]
    if (!row || row.revision !== revision || row.loading)
      return { loading: true, order }
    yields.set(code, row.yield)
  }
  const sorted = [...order].sort((a, b) =>
    compareYields(yields.get(a), yields.get(b)),
  )
  return { loading: false, order: sameOrder(order, sorted) ? order : sorted }
}
