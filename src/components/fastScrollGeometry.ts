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

/** Map document pixels to fractional directory rows, not discrete companies. */
export function directoryPosition(
  offsets: number[],
  bottom: number,
  pageY: number,
) {
  if (!offsets.length || pageY <= offsets[0]) return 0
  if (pageY >= bottom) return offsets.length * FAST_SCROLL_ROW_HEIGHT
  const next = offsets.findIndex((offset) => offset > pageY)
  const index = next === -1 ? offsets.length - 1 : next - 1
  const end = offsets[index + 1] ?? bottom
  return (
    (index + (pageY - offsets[index]) / (end - offsets[index])) *
    FAST_SCROLL_ROW_HEIGHT
  )
}

export function directoryLayout(
  offsets: number[],
  bottom: number,
  scrollY: number,
  viewportHeight: number,
  thumbCenter: number,
) {
  const first = directoryPosition(offsets, bottom, scrollY)
  const last = directoryPosition(offsets, bottom, scrollY + viewportHeight)
  const windowHeight = last - first
  const center = clamp(
    thumbCenter,
    windowHeight / 2,
    viewportHeight - windowHeight / 2,
  )
  return {
    listOffset: center - (first + last) / 2,
    windowTop: center - windowHeight / 2,
    windowHeight,
  }
}
