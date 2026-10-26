import './chart-legend.css'

interface Props<T extends string> {
  label: string
  items: readonly { value: T; label: string; tone: 'total' | 'record' }[]
  value: T | null
  onChange: (value: T | null) => void
  disabled?: boolean
}

export function ChartLegend<T extends string>({
  label,
  items,
  value,
  onChange,
  disabled = false,
}: Props<T>) {
  return (
    <div className="chart-legend" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === item.value}
          onClick={() => onChange(value === item.value ? null : item.value)}
        >
          <i className={`legend-${item.tone}`} aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
