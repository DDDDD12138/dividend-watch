/** Use a uniform interval, then reserve space for the latest label and both edges. */
export function layoutAmountLabels(
  widths: number[],
  left: number,
  right: number,
  gap = 12,
) {
  const available = Math.max(0, right - left)
  const step = available / Math.max(1, widths.length)
  const widest = Math.max(0, ...widths.filter((width) => width <= available))
  const stride = step > 0 ? Math.max(1, Math.ceil((widest + gap) / step)) : 1
  const labels = widths.map((width, index) => ({
    x: Math.min(
      right - width / 2,
      Math.max(left + width / 2, left + step * (index + 0.5)),
    ),
    visible: false,
  }))
  let nextLeft = Infinity
  for (let index = widths.length - 1; index >= 0; index--) {
    if (index !== widths.length - 1 && index % stride !== 0) continue
    const width = widths[index],
      label = labels[index]
    if (
      width > available ||
      available === 0 ||
      label.x + width / 2 + gap > nextLeft
    )
      continue
    label.visible = true
    nextLeft = label.x - width / 2
  }
  return labels
}

/** Place occasional event captions at their original year, preferring recent
 * events when space is tight. Missing captions consume no horizontal space.
 */
export function layoutEventLabels(
  widths: (number | null)[],
  left: number,
  right: number,
  gap = 8,
) {
  const available = Math.max(0, right - left)
  const step = available / Math.max(1, widths.length)
  let nextLeft = Infinity
  const labels = widths.map((width, index) => ({
    x: Math.min(
      right - (width ?? 0) / 2,
      Math.max(left + (width ?? 0) / 2, left + step * (index + 0.5)),
    ),
    visible: false,
  }))
  for (let index = widths.length - 1; index >= 0; index--) {
    const width = widths[index]
    const label = labels[index]
    if (
      width === null ||
      width > available ||
      available === 0 ||
      label.x + width / 2 + gap > nextLeft
    )
      continue
    label.visible = true
    nextLeft = label.x - width / 2
  }
  return labels
}
