import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  clamp,
  currentItem,
  dragScroll,
  rowScrollTop,
  scrollProgress,
  scrollTrack,
} from './fastScrollGeometry'

interface Geometry {
  ids: string[]
  offsets: number[]
  maxScroll: number
  viewportHeight: number
  viewportTop: number
  trackTop: number
  travel: number
}
interface View {
  available: boolean
  progress: number
  activeId?: string
  viewportHeight: number
  viewportTop: number
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
    viewportTop: 0,
    trackTop: 0,
    travel: 0,
  })
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const geometry = useRef<Geometry | null>(null)
  const enabled = useRef(false)
  const pointer = useRef<{
    id: number
    offset: number
    element: HTMLElement
  } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const frame = useRef(0)
  const observer = useRef<ResizeObserver | null>(null)

  function show() {
    clearTimeout(hideTimer.current)
    setVisible(true)
    if (!pointer.current)
      hideTimer.current = setTimeout(() => setVisible(false), 1200)
  }

  function releasePointer() {
    const held = pointer.current
    pointer.current = null
    if (held?.element.hasPointerCapture(held.id))
      held.element.releasePointerCapture(held.id)
    setDragging(false)
  }

  function publish() {
    const g = geometry.current
    if (!g) return
    const progress = scrollProgress(window.scrollY, g.maxScroll)
    const active = currentItem(
      g.offsets,
      window.scrollY + g.viewportTop,
      g.maxScroll - window.scrollY <= 1,
    )
    const next: View = {
      available:
        enabled.current && g.maxScroll > 0 && g.travel > 0 && g.ids.length > 0,
      progress,
      activeId: g.ids[active],
      viewportHeight: g.viewportHeight,
      viewportTop: g.viewportTop,
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
    const elements = ids.flatMap((id) => {
      const element = getItemElement(id)
      return element ? [{ id, element }] : []
    })
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportTop = window.visualViewport?.offsetTop ?? 0
    const track = scrollTrack(viewportHeight)
    geometry.current = {
      ids: elements.map((item) => item.id),
      offsets: elements.map(
        ({ element }) => element.getBoundingClientRect().top + window.scrollY,
      ),
      maxScroll: Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      ),
      viewportHeight,
      viewportTop,
      trackTop: track.top,
      travel: track.travel,
    }
    publish()
  })
  const onScroll = useEffectEvent(() => {
    if (!enabled.current) return
    show()
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        publish()
      })
  })
  const suspend = useEffectEvent(() => {
    enabled.current = false
    clearTimeout(hideTimer.current)
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
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    media.addEventListener('change', resize)
    resize()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
      media.removeEventListener('change', resize)
      observer.current?.disconnect()
      suspend()
    }
  }, [disabled])

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
        g.viewportTop + g.trackTop,
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
    if (!g) return
    const index = g.ids.indexOf(view.activeId ?? '')
    let top: number
    if (event.key === 'Home') top = 0
    else if (event.key === 'End') top = g.maxScroll
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = clamp(
        index + (event.key === 'ArrowDown' ? 1 : -1),
        0,
        g.offsets.length - 1,
      )
      top = rowScrollTop(g.offsets[next], g.maxScroll)
    } else return
    event.preventDefault()
    window.scrollTo({ top, behavior: 'instant' })
    show()
  }

  return {
    ...view,
    visible,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onKeyDown,
  }
}
