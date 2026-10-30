const LONG_PRESS_MS = 400
const MOVE_TOLERANCE = 10

interface PointerPosition {
  pointerId: number
  clientX: number
  clientY: number
}

interface Press<T> extends PointerPosition {
  selection: T
  phase: 'pending' | 'preview' | 'cancelled'
  down: boolean
}

/** Keep the outcome through release: click and contextmenu can arrive afterwards. */
export function createChartPress<T>(onPreview: (target: T) => void) {
  let current: Press<T> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function stopTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  function reset() {
    stopTimer()
    current = null
  }
  function cancel() {
    if (!current?.down) return
    stopTimer()
    current.phase = 'cancelled'
  }
  return {
    get session(): Readonly<Press<T>> | null {
      return current
    },
    get blocksClick() {
      return current !== null && current.phase !== 'pending'
    },
    start({ pointerId, clientX, clientY }: PointerPosition, selection: T) {
      reset()
      const press: Press<T> = {
        pointerId,
        clientX,
        clientY,
        selection,
        phase: 'pending',
        down: true,
      }
      current = press
      timer = setTimeout(() => {
        timer = undefined
        press.phase = 'preview'
        onPreview(press.selection)
      }, LONG_PRESS_MS)
    },
    move({ pointerId, clientX, clientY }: PointerPosition) {
      if (
        !current?.down ||
        current.pointerId !== pointerId ||
        current.phase === 'cancelled'
      )
        return false
      if (
        Math.hypot(clientX - current.clientX, clientY - current.clientY) <=
        MOVE_TOLERANCE
      )
        return false
      cancel()
      return true
    },
    end(pointerId: number, cancelled = false) {
      if (!current?.down || current.pointerId !== pointerId) return false
      if (cancelled) cancel()
      stopTimer()
      current.down = false
      return true
    },
    // Stop a stale preview without turning an otherwise valid tap into a cancellation.
    stopPreview: stopTimer,
    cancel,
    reset,
  }
}
