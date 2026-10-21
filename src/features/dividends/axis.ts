/** Nice ticks affect chart geometry only; original dividend amounts remain unchanged. */
export function dividendAxis(maximum: number) {
  const target = maximum > 0 ? maximum * 1.1 : 1
  const exponent = Math.floor(Math.log10(target / 5))
  const power = 10 ** exponent
  const candidates = [1, 2, 2.5, 5, 10]
    .map((factor) => {
      const step = factor * power
      const count = Math.ceil(target / step)
      return { step, count, factor, ceiling: count * step }
    })
    .filter(({ count }) => count >= 3 && count <= 6)
  const selected = candidates.sort(
    (a, b) =>
      Math.abs(a.count - 5) +
      a.ceiling / target -
      (Math.abs(b.count - 5) + b.ceiling / target),
  )[0]
  const digits = Math.max(3, -exponent + (selected.factor === 2.5 ? 1 : 0))
  return {
    ceiling: selected.ceiling,
    ticks: Array.from({ length: selected.count + 1 }, (_, index) => {
      const value = Number((index * selected.step).toPrecision(12))
      return { value, label: value.toFixed(digits) }
    }),
  }
}
