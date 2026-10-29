import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { flushSync } from 'react-dom'
import {
  clamp,
  currentItem,
  dragScroll,
  rowScrollTop,
  scrollProgress,
  scrollTrack,
} from './fastScrollGeometry'

const HIDE_DELAY = 1200
/** Mobile toolbars keep resizing the viewport for a few frames after a fling. */
const SETTLE_DELAY = 150

interface Geometry {
  ids: string[]
  offsets: number[]
  maxScroll: number
  viewportHeight: number
  trackTop: number
  travel: number
}
interface View {
  available: boolean
  progress: number
  activeId?: string
  viewportHeight: number
  trackTop: number
  travel: number
}
interface Props {
  ids: string[]
  getItemElement: (id: string) => HTMLElement | null
  disabled: boolean
}

export function useFastScroll({ ids, getItemElement, disabled }: Props) {
  const [view, setView] = useState<View>({
    available: false,
    progress: 0,
    viewportHeight: 0,
    trackTop: 0,
    travel: 0,
  })
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const geometry = useRef<Geometry | null>(null)
  const enabled = useRef(false)
  const scrolling = useRef(false)
  const measurePending = useRef(false)
  const pointer = useRef<{
    id: number
    offset: number
    element: HTMLElement
  } | null>(null)
  // Sized in svh by CSS, which JS cannot compute. The browser draws the handle
  // along this track from the scroll position; JS only mirrors its geometry.
  const track = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const frame = useRef(0)
  const observer = useRef<ResizeObserver | null>(null)

  function show() {
    clearTimeout(hideTimer.current)
    setVisible(true)
    if (!pointer.current)
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY)
  }

  function releasePointer() {
    const held = pointer.current
    pointer.current = null
    if (held?.element.hasPointerCapture(held.id))
      held.element.releasePointerCapture(held.id)
    setDragging(false)
  }

  // React learns the scroll position only while the directory is open
  // (dragging), after a measurement, or after a key press.
  function publish() {
    const g = geometry.current
    if (!g) return
    const scrollY = window.scrollY
    const active = currentItem(g.offsets, scrollY, g.maxScroll - scrollY <= 1)
    const next: View = {
      available:
        enabled.current && g.maxScroll > 0 && g.travel > 0 && g.ids.length > 0,
      progress: scrollProgress(scrollY, g.maxScroll),
      activeId: g.ids[active],
      viewportHeight: g.viewportHeight,
      trackTop: g.trackTop,
      travel: g.travel,
    }
    setView((previous) =>
      Object.keys(next).every(
        (key) => previous[key as keyof View] === next[key as keyof View],
      )
        ? previous
        : next,
    )
  }

  const measure = useEffectEvent(() => {
    if (!enabled.current) return
    // Viewport resizes during a fling would re-layout every row each frame.
    // A drag needs fresh geometry, so only touch-driven scrolling waits.
    if (scrolling.current && !pointer.current) {
      measurePending.current = true
      return
    }
    measurePending.current = false
    const elements = ids.flatMap((id) => {
      const element = getItemElement(id)
      return element ? [{ id, element }] : []
    })
    const range = scrollTrack(track.current?.offsetHeight ?? 0)
    track.current?.style.setProperty(
      '--fast-scroll-track-top',
      `${range.top}px`,
    )
    track.current?.style.setProperty(
      '--fast-scroll-travel',
      `${range.travel}px`,
    )
    geometry.current = {
      ids: elements.map((item) => item.id),
      offsets: elements.map(
        ({ element }) => element.getBoundingClientRect().top + window.scrollY,
      ),
      maxScroll: Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      ),
      viewportHeight: window.innerHeight,
      trackTop: range.top,
      travel: range.travel,
    }
    publish()
  })
  // Brings the state up to date, measuring first if a measurement was deferred.
  const sync = useEffectEvent(() => {
    if (measurePending.current) measure()
    else publish()
  })
  const settle = useEffectEvent(() => {
    scrolling.current = false
    sync()
  })
  const onScroll = useEffectEvent(() => {
    if (!enabled.current) return
    show()
    scrolling.current = true
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(settle, SETTLE_DELAY)
    // Only the directory needs frames, and it must paint in the same frame as
    // the handle it follows.
    if (pointer.current && !frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        flushSync(publish)
      })
  })
  const suspend = useEffectEvent(() => {
    enabled.current = false
    scrolling.current = false
    measurePending.current = false
    clearTimeout(hideTimer.current)
    clearTimeout(settleTimer.current)
    cancelAnimationFrame(frame.current)
    frame.current = 0
    releasePointer()
    setVisible(false)
    setView((previous) => ({ ...previous, available: false }))
  })

  // Only this component subscribes to scrolling. Business state never receives frames.
  useLayoutEffect(() => {
    const media = matchMedia('(max-width: 760px)')
    const resize = () => {
      if (disabled || !media.matches) suspend()
      else {
        enabled.current = true
        measure()
      }
    }
    observer.current = new ResizeObserver(() => measure())
    observer.current.observe(document.body)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', resize)
    media.addEventListener('change', resize)
    resize()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', resize)
      media.removeEventListener('change', resize)
      observer.current?.disconnect()
      suspend()
    }
  }, [disabled])

  // A grab during a fling must map onto the settled viewport, and the directory
  // must open on the row under the viewport now.
  useLayoutEffect(() => {
    if (dragging) sync()
  }, [dragging])

  // Reordering must update geometry without interrupting an active gesture.
  useLayoutEffect(() => {
    const nodes = ids
      .map(getItemElement)
      .filter((node): node is HTMLElement => node !== null)
    for (const node of nodes) observer.current?.observe(node)
    measure()
    return () => {
      for (const node of nodes) observer.current?.unobserve(node)
    }
  }, [ids, getItemElement, disabled])

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0 || !view.available) return
    event.preventDefault()
    pointer.current = {
      id: event.pointerId,
      offset: event.clientY - event.currentTarget.getBoundingClientRect().top,
      element: event.currentTarget,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    show()
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const held = pointer.current
    const g = geometry.current
    if (!held || event.pointerId !== held.id || !g) return
    window.scrollTo({
      top: dragScroll(
        event.clientY,
        held.offset,
        g.trackTop,
        g.travel,
        g.maxScroll,
      ),
      behavior: 'instant',
    })
  }
  function onPointerEnd(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId) return
    releasePointer()
    show()
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const g = geometry.current
    if (!g || !g.offsets.length) return
    const scrollY = window.scrollY
    let top: number
    if (event.key === 'Home') top = 0
    else if (event.key === 'End') top = g.maxScroll
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const index = currentItem(g.offsets, scrollY, g.maxScroll - scrollY <= 1)
      const next = clamp(
        index + (event.key === 'ArrowDown' ? 1 : -1),
        0,
        g.offsets.length - 1,
      )
      top = rowScrollTop(g.offsets[next], g.maxScroll)
    } else return
    event.preventDefault()
    window.scrollTo({ top, behavior: 'instant' })
    publish()
    show()
  }

  return {
    ...view,
    visible,
    dragging,
    track,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onKeyDown,
  }
}
