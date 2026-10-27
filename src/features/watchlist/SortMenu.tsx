import { Check, ChevronDown, ListSortDescending } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import type { Preferences } from './model'
import './sort-menu.css'

const options = [
  { value: 'added', label: '按添加顺序' },
  { value: 'yield', label: '股息率从高到低' },
] as const

export function SortMenu({
  value,
  onChange,
}: {
  value: Preferences['sort']
  onChange: (value: Preferences['sort']) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const selected = options.findIndex((option) => option.value === value)
  useEffect(() => {
    if (!open) return
    items.current[selected]?.focus()
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, selected])
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div
      className="sort-control"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <Button
        className="sort-trigger"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <ListSortDescending />
        <span>{options[selected].label}</span>
        <ChevronDown className="sort-chevron" />
      </Button>
      {open && (
        <div
          className="sort-menu"
          id={id}
          role="menu"
          aria-label="排序方式"
          onKeyDown={(event) => {
            const index = items.current.findIndex(
              (item) => item === document.activeElement,
            )
            const next =
              event.key === 'ArrowDown'
                ? (index + 1) % options.length
                : event.key === 'ArrowUp'
                  ? (index + options.length - 1) % options.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? options.length - 1
                      : null
            if (next !== null) {
              event.preventDefault()
              items.current[next]?.focus()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              close()
            }
          }}
        >
          {options.map((option, index) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              key={option.value}
              ref={(element) => {
                items.current[index] = element
              }}
              tabIndex={-1}
              onClick={() => {
                onChange(option.value)
                close()
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
