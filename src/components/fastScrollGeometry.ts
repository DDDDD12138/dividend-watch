export const FAST_SCROLL_THUMB_HEIGHT = 48
export const FAST_SCROLL_ROW_HEIGHT = 40
const EDGE_SPACE = 16
/** Keep the handle clear of browser chrome and system gesture zones. */
const TRACK_TOP = { min: 112, ratio: 0.18 }
const TRACK_BOTTOM = { min: 100, ratio: 0.16 }

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function scrollProgress(scrollY: number, maxScroll: number) {
  return maxScroll > 0 ? clamp(scrollY / maxScroll, 0, 1) : 0
}

export function rowScrollTop(offset: number, maxScroll: number) {
  return clamp(offset - EDGE_SPACE, 0, maxScroll)
}

export function scrollTrack(viewportHeight: number) {
  const top = Math.max(TRACK_TOP.min, viewportHeight * TRACK_TOP.ratio)
  const bottom = Math.max(TRACK_BOTTOM.min, viewportHeight * TRACK_BOTTOM.ratio)
  return {
    top,
    travel: Math.max(
      0,
      viewportHeight - top - bottom - FAST_SCROLL_THUMB_HEIGHT,
    ),
  }
}

export function dragScroll(
  pointerY: number,
  grabOffset: number,
  trackTop: number,
  travel: number,
  maxScroll: number,
) {
  return travel > 0
    ? clamp((pointerY - grabOffset - trackTop) / travel, 0, 1) * maxScroll
    : 0
}

/** Prefer a visible heading over the clipped remainder of the preceding row. */
export function currentItem(
  offsets: number[],
  visibleTop: number,
  atEnd: boolean,
) {
  if (!offsets.length) return -1
  if (atEnd) return offsets.length - 1
  const index = offsets.findIndex((offset) => offset >= visibleTop - EDGE_SPACE)
  return index === -1 ? offsets.length - 1 : index
}

export function directoryWindow(
  count: number,
  active: number,
  center: number,
  viewportHeight: number,
) {
  const half = FAST_SCROLL_ROW_HEIGHT / 2
  const above = Math.max(
    0,
    Math.floor((center - EDGE_SPACE - half) / FAST_SCROLL_ROW_HEIGHT),
  )
  const below = Math.max(
    0,
    Math.floor(
      (viewportHeight - EDGE_SPACE - center - half) / FAST_SCROLL_ROW_HEIGHT,
    ),
  )
  const start = Math.max(0, active - above)
  const end = Math.min(count, active + below + 1)
  return {
    start,
    end,
    top: center - (active - start) * FAST_SCROLL_ROW_HEIGHT - half,
  }
}
