import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  hint?: string
  onSelect: () => void
  disabled?: boolean
}

/** A toolbar button that opens a list of commands. Closes on choice, outside click and Esc. */
export function Menu(props: { label: ReactNode; title?: string; items: (MenuItem | 'separator')[]; align?: 'left' | 'right'; active?: boolean; tour?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={root} data-tour={props.tour}>
      <button type="button" className={`btn ${props.active ? 'btn-primary' : ''}`} aria-haspopup="menu" aria-expanded={open} title={props.title} onClick={() => setOpen((o) => !o)}>
        {props.label} <span aria-hidden className="menu-caret">▾</span>
      </button>
      {open && (
        <div role="menu" className={`menu-list ${props.align === 'right' ? 'menu-right' : ''}`}>
          {props.items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                <span>{it.label}</span>
                {it.hint && <kbd>{it.hint}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
