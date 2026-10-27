import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import './modal.css'
import { Button } from './Button'

export interface ModalHandle {
  close: () => void
}

interface Props {
  ref?: Ref<ModalHandle>
  title: string
  onClose: () => void
  className?: string
  placement?: 'center' | 'side'
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

function outside(element: HTMLDialogElement, x: number, y: number) {
  const bounds = element.getBoundingClientRect()
  return (
    x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
  )
}

export function Modal({
  ref,
  title,
  onClose,
  className,
  placement = 'center',
  initialFocusRef,
  children,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  const titleId = useId()

  useLayoutEffect(() => {
    const element = dialog.current!
    element.showModal()
    initialFocusRef?.current?.focus({ preventScroll: true })
    return () => element.close()
  }, [initialFocusRef])

  function close() {
    dialog.current?.close()
  }

  useImperativeHandle(ref, () => ({ close }), [])

  return createPortal(
    <dialog
      ref={dialog}
      className={`modal${placement === 'side' ? ' modal--side' : ''}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onClose={(event) => {
        // StrictMode can queue a close event before reopening the same dialog.
        if (!event.currentTarget.open) onClose()
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current =
          event.isPrimary &&
          event.button === 0 &&
          outside(event.currentTarget, event.clientX, event.clientY)
      }}
      onClick={(event) => {
        const dismiss =
          pressedBackdrop.current &&
          outside(event.currentTarget, event.clientX, event.clientY)
        pressedBackdrop.current = false
        if (dismiss) close()
      }}
      onPointerCancel={() => {
        pressedBackdrop.current = false
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="text"
          className="modal-close"
          onClick={close}
          aria-label={`关闭${title}`}
        >
          <X />
        </Button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>,
    document.body,
  )
}
