import { ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'
import {
  calculateMetrics,
  calculateReferenceYield,
  calculateTargetPrice,
  decimal,
  units,
} from '../../../shared/money'
import { Button } from '../../components/Button'
import { percent } from '../../lib/format'

interface Props {
  dividend: string | null
  price: string | null
  expectedYield: string
}

export function PriceCalculator({ dividend, price, expectedYield }: Props) {
  const id = useId()
  const [mode, setMode] = useState<'yield' | 'price'>('yield')
  const [inputs, setInputs] = useState<
    Partial<Record<'yield' | 'price', { value: string; badInput: boolean }>>
  >({})
  const isYield = mode === 'yield'
  const input = inputs[mode]
  const value = input?.value ?? (isYield ? expectedYield : (price ?? ''))
  let result: string | null = null
  let metrics: ReturnType<typeof calculateMetrics> = null
  let feedback = ''
  let invalid = input?.badInput ?? false
  if (value !== '' && !invalid) {
    try {
      if (isYield) {
        if (price === null) {
          result = calculateTargetPrice(dividend, value)
        } else {
          metrics = calculateMetrics(dividend, price, value)
          result = metrics?.targetPrice ?? null
        }
      } else {
        result = calculateReferenceYield(dividend, value)
      }
    } catch {
      invalid = true
    }
  }
  if (invalid) {
    feedback = isYield
      ? '请输入 0.01–100 的股息率'
      : '请输入大于零、最多两位小数的价格'
  }
  if (metrics) {
    feedback = metrics.reached
      ? '按当前价计算，已达到这一期望股息率。'
      : `距当前价 ¥${Number(price).toFixed(2)}，还需下跌 ${percent(metrics.requiredDrop)}。`
  } else if (!invalid && result !== null && !isYield && price !== null) {
    const currentYield = calculateReferenceYield(dividend, price)
    if (currentYield !== null) {
      const difference = units(result) - units(currentYield)
      const gap = decimal(difference < 0n ? -difference : difference)
      const points = Number(gap) * 100
      feedback =
        points < 0.005
          ? '与当前价对应的参考股息率相同。'
          : `比当前参考股息率${difference > 0n ? '高' : '低'} ${points.toFixed(2)} 个百分点。`
    }
  }
  const p = price === null ? null : units(price)
  const presets = isYield
    ? ['4', '5', '6', '7'].map((value) => ({ value, label: `${value}%` }))
    : p === null
      ? []
      : [80n, 90n, 100n]
          .map((ratio, index) => ({
            // Prices are floored to cents, using the same precision as target prices.
            value: decimal(((p * ratio) / 100n / 1_000_000n) * 1_000_000n),
            label: ['现价八折', '现价九折', '当前价'][index],
          }))
          .filter(({ value }) => units(value) > 0n)

  function edit(value: string, badInput = false) {
    setInputs((previous) => ({ ...previous, [mode]: { value, badInput } }))
  }
  function adjust(direction: bigint) {
    if (input?.badInput) return
    try {
      const next =
        units(value || '0') + direction * units(isYield ? '0.1' : '1')
      if (next <= 0n || (isYield && next > units('100'))) return
      edit(decimal(next))
    } catch {
      // Leave malformed input for the user to correct; don't replace it.
    }
  }

  return (
    <section className="price-calculator" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>换个价格，算一算</h3>
      <div className="calculator-modes" role="group" aria-label="试算方式">
        {(['yield', 'price'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
          >
            {item === 'yield' ? '按期望股息率' : '按买入价'}
          </button>
        ))}
      </div>
      <div className="calculator-fields">
        <label htmlFor={`${id}-input`}>
          <span className="overview-label">
            {isYield ? '期望股息率' : '假设买入价'}
          </span>
          <span className="calculator-input">
            <input
              id={`${id}-input`}
              type="number"
              inputMode="decimal"
              min="0"
              max={isYield ? '100' : undefined}
              step="any"
              value={value}
              onInput={(event) =>
                edit(
                  event.currentTarget.value,
                  event.currentTarget.validity.badInput,
                )
              }
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                event.preventDefault()
                adjust(event.key === 'ArrowUp' ? 1n : -1n)
              }}
              aria-invalid={invalid}
              aria-describedby={`${id}-feedback`}
            />
            <span>{isYield ? '%' : '元'}</span>
          </span>
        </label>
        <ArrowRight className="calculator-arrow" aria-hidden="true" />
        <div>
          <span className="overview-label">
            {isYield ? '对应价格' : '参考股息率'}
          </span>
          <output
            className="overview-number calculator-result"
            htmlFor={`${id}-input`}
          >
            {result === null ? (
              '—'
            ) : isYield ? (
              <>
                <span className="overview-unit">¥</span>
                {result}
              </>
            ) : (
              <>
                {percent(result).slice(0, -1)}
                <span className="overview-unit">%</span>
              </>
            )}
          </output>
        </div>
      </div>
      <div className="calculator-presets">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            aria-pressed={
              value !== '' && !invalid && Number(value) === Number(preset.value)
            }
            onClick={() => edit(preset.value)}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          variant="text"
          className="calculator-reset"
          onClick={() =>
            setInputs((previous) => ({ ...previous, [mode]: undefined }))
          }
        >
          重置
        </Button>
      </div>
      <p
        id={`${id}-feedback`}
        className={`calculator-feedback${invalid ? ' error-text' : ''}`}
        aria-live="polite"
      >
        {feedback}
      </p>
    </section>
  )
}
