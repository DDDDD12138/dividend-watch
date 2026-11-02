const SCALE = 100_000_000n
export class InvalidAmount extends Error {
  override name = 'InvalidAmount'
}
export function units(value: string): bigint {
  if (!/^(0|[1-9]\d{0,15})(\.\d{1,8})?$/.test(value))
    throw new InvalidAmount('Invalid decimal')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'))
}
export function decimal(value: bigint): string {
  if (value < 0n) throw new InvalidAmount('Negative amount')
  const fraction = (value % SCALE)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '')
  return `${value / SCALE}${fraction ? `.${fraction}` : ''}`
}
export function perShare(perTen: string): string {
  const value = units(perTen)
  if (value % 10n !== 0n)
    throw new InvalidAmount('Per-share precision exceeds 8 decimals')
  return decimal(value / 10n)
}
export function sumAmounts(values: (string | null)[]): string | null {
  if (!values.length || values.some((value) => value === null)) return null
  return decimal(values.reduce<bigint>((sum, value) => sum + units(value!), 0n))
}
function yieldUnits(value: string) {
  const y = units(value)
  if (y < 1_000_000n || y > 100n * SCALE)
    throw new Error('Yield must be between 0.01 and 100 percent')
  return y
}
function priceUnits(value: string) {
  const p = units(value)
  if (p === 0n || p % 1_000_000n !== 0n)
    throw new Error('Invalid A-share price')
  return p
}
function targetPrice(d: bigint, y: bigint) {
  const cents = (d * 10_000n) / y
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}
function referenceYield(d: bigint, p: bigint) {
  return decimal((d * SCALE) / p)
}
export function calculateTargetPrice(
  dividend: string | null,
  expectedYieldPercent: string,
) {
  const y = yieldUnits(expectedYieldPercent)
  if (dividend === null) return null
  return targetPrice(units(dividend), y)
}
export function calculateReferenceYield(
  dividend: string | null,
  price: string | null,
) {
  if (price === null) return null
  const p = priceUnits(price)
  return dividend === null ? null : referenceYield(units(dividend), p)
}
/** Yield input is a percentage; returned yield/drop are fractional ratios. */
export function calculateMetrics(
  dividend: string | null,
  price: string | null,
  expectedYieldPercent: string,
) {
  const y = yieldUnits(expectedYieldPercent)
  if (dividend === null || price === null) return null
  const d = units(dividend),
    p = priceUnits(price)
  const drop = p * y - d * 100n * SCALE
  return {
    referenceYield: referenceYield(d, p),
    targetPrice: targetPrice(d, y),
    requiredDrop: drop <= 0n ? '0' : decimal((drop * SCALE) / (p * y)),
    reached: drop <= 0n,
  }
}
