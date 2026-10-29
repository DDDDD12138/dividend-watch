import { ChevronsUpDown } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { useFastScroll } from './useFastScroll'
import {
  directoryWindow,
  FAST_SCROLL_ROW_HEIGHT,
  FAST_SCROLL_THUMB_HEIGHT,
} from './fastScrollGeometry'
import './fast-scroll.css'

export interface FastScrollItem {
  id: string
  label: string
  value: string
}
interface Props {
  label: string
  items: FastScrollItem[]
  getItemElement: (id: string) => HTMLElement | null
  disabled?: boolean
}

export function FastScroll({
  label,
  items,
  getItemElement,
  disabled = false,
}: Props) {
  // Only membership/order changes should reconnect geometry observers.
  const idsKey = JSON.stringify(items.map((item) => item.id))
  const ids = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey])
  const scroll = useFastScroll({ ids, getItemElement, disabled })
  if (!scroll.available || disabled) return null
  const active = items.findIndex((item) => item.id === scroll.activeId)
  const thumbTop = scroll.progress * scroll.travel
  const center = scroll.trackTop + thumbTop + FAST_SCROLL_THUMB_HEIGHT / 2
  const directory =
    active >= 0
      ? directoryWindow(items.length, active, center, scroll.viewportHeight)
      : null
  const current = items[active]
  return (
    <div
      className="fast-scroll"
      data-visible={scroll.visible}
      data-dragging={scroll.dragging && directory !== null}
      style={
        {
          top: scroll.viewportTop,
          height: scroll.viewportHeight,
          '--fast-scroll-thumb-height': `${FAST_SCROLL_THUMB_HEIGHT}px`,
          '--fast-scroll-row-height': `${FAST_SCROLL_ROW_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <div className="fast-scroll-scrim" aria-hidden="true" />
      {directory && (
        <div
          className="fast-scroll-directory"
          aria-hidden="true"
          style={{ top: directory.top }}
        >
          {items.slice(directory.start, directory.end).map((item) => (
            <div
              key={item.id}
              className="fast-scroll-item"
              data-current={item.id === scroll.activeId}
            >
              <span className="fast-scroll-name">{item.label}</span>
              <span className="fast-scroll-value">{item.value}</span>
            </div>
          ))}
        </div>
      )}
      <div
        className="fast-scroll-handle"
        style={{ top: scroll.trackTop + thumbTop }}
      >
        <div
          className="fast-scroll-thumb"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scroll.progress * 100)}
          aria-valuetext={
            current ? `${current.label}，${current.value}` : undefined
          }
          onPointerDown={scroll.onPointerDown}
          onPointerMove={scroll.onPointerMove}
          onPointerUp={scroll.onPointerEnd}
          onPointerCancel={scroll.onPointerEnd}
          onLostPointerCapture={scroll.onPointerEnd}
          onKeyDown={scroll.onKeyDown}
        >
          <ChevronsUpDown aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
