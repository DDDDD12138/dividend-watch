const SCALE = 100_000_000n
export function units(value: string): bigint {
  if (!/^(0|[1-9]\d{0,15})(\.\d{1,8})?$/.test(value))
    throw new Error('Invalid decimal')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'))
}
export function decimal(value: bigint): string {
  if (value < 0n) throw new Error('Negative amount')
  const fraction = (value % SCALE)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '')
  return `${value / SCALE}${fraction ? `.${fraction}` : ''}`
}
export function perShare(perTen: string): string {
  const value = units(perTen)
  if (value % 10n !== 0n)
    throw new Error('Per-share precision exceeds 8 decimals')
  return decimal(value / 10n)
}
export function sumAmounts(values: (string | null)[]): string | null {
  if (!values.length || values.some((value) => value === null)) return null
  return decimal(values.reduce<bigint>((sum, value) => sum + units(value!), 0n))
}
/** Yield input is a percentage; returned yield/drop are fractional ratios. */
export function calculateMetrics(
  dividend: string | null,
  price: string | null,
  expectedYieldPercent: string,
) {
  const y = units(expectedYieldPercent)
  if (y < 1_000_000n || y > 100n * SCALE)
    throw new Error('Yield must be between 0.01 and 100 percent')
  if (dividend === null || price === null) return null
  const d = units(dividend),
    p = units(price)
  if (p === 0n || p % 1_000_000n !== 0n)
    throw new Error('Invalid A-share price')
  const cents = (d * 10_000n) / y
  const drop = p * y - d * 100n * SCALE
  return {
    referenceYield: decimal((d * SCALE) / p),
    targetPrice: `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`,
    requiredDrop: drop <= 0n ? '0' : decimal((drop * SCALE) / (p * y)),
    reached: drop <= 0n,
  }
}
