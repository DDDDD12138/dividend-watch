import { useId } from 'react'
import { isPreListing } from './listing'

export function PreListingBand({
  x,
  y,
  years,
  listingDate,
  step,
  height,
}: {
  x: number
  y: number
  years: number[]
  listingDate?: string | null
  step: number
  height: number
}) {
  const pattern = useId()
  const width =
    step * years.filter((year) => isPreListing(year, listingDate)).length
  if (width <= 0) return null
  return (
    <g className="pre-listing-band" role="img" aria-label="这些财年尚未上市">
      <defs>
        <pattern
          id={pattern}
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
        >
          <path d="M-2 2 2 -2 M0 10 10 0 M8 12 12 8" />
        </pattern>
      </defs>
      <rect
        className="pre-listing-background"
        x={x}
        y={y}
        width={width}
        height={height}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={`url(#${pattern})`}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ writingMode: width < 42 ? 'vertical-rl' : undefined }}
      >
        未上市
      </text>
    </g>
  )
}
