import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { ChartSelection } from './ChartTooltip'
import type { ChartLayer } from './model'
import { createChartPress } from './chartPress'

interface Selection extends ChartSelection {
  width: number
  height: number
  data: object
}

interface Target {
  mode: ChartLayer
  text: string
  onActivate?: () => void
}

export function useChartInteraction(
  width: number,
  height: number,
  data: object,
  layers: readonly ChartLayer[],
) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Selection | null>(null)
  const press = useRef(createChartPress<Selection>(setActive))
  const input = useRef<'keyboard' | 'pointer'>('keyboard')
  const dismiss = useCallback(() => setActive(null), [])
  const cancelInteraction = useCallback(() => {
    press.current.cancel()
    dismiss()
  }, [press, dismiss])
  const stopPreview = useCallback(() => {
    press.current.stopPreview()
    dismiss()
  }, [dismiss])

  function selectionFor(node: EventTarget | null): Selection | null {
    const target =
      node instanceof Element
        ? node.closest<SVGElement>('[data-chart-target]')
        : null
    const mode = layers.find(
      (layer) => layer === target?.getAttribute('data-chart-target'),
    )
    return target && root.current?.contains(target) && mode
      ? {
          target,
          mode,
          text: target.getAttribute('data-tooltip') ?? '',
          width,
          height,
          data,
        }
      : null
  }

  function select(node: EventTarget | null) {
    const next = selectionFor(node)
    setActive((previous) =>
      previous?.target === next?.target ? previous : next,
    )
  }

  // Layout and label measurement can remove a target without changing the data.
  useLayoutEffect(() => {
    const selection = press.current.session?.down
      ? press.current.session.selection
      : active
    if (!selection) return
    if (
      !root.current?.contains(selection.target) ||
      selection.target.getAttribute('data-chart-target') !== selection.mode ||
      selection.target.getAttribute('data-tooltip') !== selection.text
    )
      cancelInteraction()
    else if (
      selection.width !== width ||
      selection.height !== height ||
      selection.data !== data
    )
      stopPreview()
  })

  useEffect(() => {
    const controller = press.current
    function keyboardInput(event: KeyboardEvent) {
      input.current = 'keyboard'
      if (event.key === 'Escape' || controller.session?.down)
        cancelInteraction()
    }
    function pointerDown(event: PointerEvent) {
      input.current = 'pointer'
      if (controller.session?.down) {
        if (event.pointerId !== controller.session.pointerId)
          cancelInteraction()
      } else {
        // A new independent pointer action retires the previous click outcome.
        controller.reset()
      }
    }
    function pointerMove(event: PointerEvent) {
      if (controller.move(event)) dismiss()
    }
    function pointerEnd(event: PointerEvent) {
      if (controller.end(event.pointerId, event.type === 'pointercancel'))
        dismiss()
    }
    function windowBlur() {
      if (controller.session) controller.end(controller.session.pointerId, true)
      dismiss()
    }
    // Window listeners also see Tab entering the chart, a second finger outside
    // it, and release outside its bounds. The press module owns their lifecycle decisions.
    window.addEventListener('keydown', keyboardInput, true)
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointermove', pointerMove, true)
    window.addEventListener('pointerup', pointerEnd, true)
    window.addEventListener('pointercancel', pointerEnd, true)
    window.addEventListener('scroll', stopPreview, true)
    window.addEventListener('resize', stopPreview)
    window.addEventListener('blur', windowBlur)
    return () => {
      window.removeEventListener('keydown', keyboardInput, true)
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointermove', pointerMove, true)
      window.removeEventListener('pointerup', pointerEnd, true)
      window.removeEventListener('pointercancel', pointerEnd, true)
      window.removeEventListener('scroll', stopPreview, true)
      window.removeEventListener('resize', stopPreview)
      window.removeEventListener('blur', windowBlur)
      controller.reset()
    }
  }, [press, dismiss, cancelInteraction, stopPreview])

  const interactionProps: HTMLAttributes<HTMLDivElement> = {
    onPointerOver(event) {
      if (
        event.pointerType !== 'touch' &&
        event.buttons === 0 &&
        !press.current.session?.down
      )
        select(event.target)
    },
    onPointerOut(event) {
      if (event.pointerType !== 'touch' && !press.current.session?.down)
        select(event.relatedTarget)
    },
    onPointerDownCapture(event) {
      // The window listener cancels multi-pointer input; this guard prevents
      // a second finger from starting a replacement gesture.
      if (!event.isPrimary || press.current.session?.down || event.button !== 0)
        return
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      dismiss()
      const selection = selectionFor(event.target)
      if (selection) press.current.start(event, selection)
    },
    onFocus(event) {
      if (
        input.current === 'keyboard' &&
        !press.current.session?.down &&
        event.target.matches(':focus-visible')
      )
        select(event.target)
    },
    onBlur() {
      // Focusing B can blur A after B's pointerdown. Focus must not cancel B's press.
      if (!press.current.session?.down) dismiss()
    },
    onClickCapture(event) {
      // Keyboard/assistive activation is independent of an outstanding pointer click.
      if (event.detail > 0 && press.current.blocksClick) {
        event.preventDefault()
        event.stopPropagation()
      }
      dismiss()
    },
    onContextMenu(event) {
      const native = event.nativeEvent
      if (
        native instanceof PointerEvent &&
        (native.pointerType === 'touch' || native.pointerType === 'pen') &&
        press.current.session
      )
        event.preventDefault()
    },
  }

  function getTargetProps({ mode, text, onActivate }: Target) {
    return {
      role: onActivate ? 'button' : 'img',
      tabIndex: onActivate ? 0 : undefined,
      'aria-label': text.replaceAll('\n', '，'),
      'data-chart-target': mode,
      'data-tooltip': text,
      onClick: onActivate,
      onKeyDown(event: ReactKeyboardEvent<SVGGElement>) {
        if (onActivate && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          dismiss()
          if (!event.repeat) onActivate()
        }
      },
    }
  }

  return { root, active, dismiss, interactionProps, getTargetProps }
}
