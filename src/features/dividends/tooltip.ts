export interface TooltipAnchor {
  left: number
  right: number
  top: number
  bottom: number
}
/** Prefer above the target, flip below when needed, and stay inside the viewport. */
export function placeTooltip(
  anchor: TooltipAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8,
    gap = 12
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  const above = anchor.top - gap - size.height
  const below = anchor.bottom + gap
  const preferred =
    above >= margin
      ? above
      : below + size.height <= viewport.height - margin
        ? below
        : anchor.top > viewport.height - anchor.bottom
          ? above
          : below
  return {
    x: Math.min(
      maxX,
      Math.max(margin, (anchor.left + anchor.right - size.width) / 2),
    ),
    y: Math.min(maxY, Math.max(margin, preferred)),
  }
}
