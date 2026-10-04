// A side column that can be hidden and resized: drag its inner edge, double-click the edge to reset.
// The width is remembered per side; a change of `revealKey` opens a hidden column again.
// The body is zoomed by the text size (Appearance.tsx); dividing by the zoom keeps the width on screen.

import { useEffect, useRef, useState, type ReactNode } from 'react'

const readWidth = (key: string) => {
  try {
    const w = Number(localStorage.getItem(key))
    return Number.isFinite(w) && w > 0 ? w : null
  } catch {
    return null
  }
}

export function SideDock(props: { side: 'left' | 'right'; name: string; defaultWidth: number; revealKey?: string; children: ReactNode }) {
  const { side, name, defaultWidth, revealKey, children } = props
  const storageKey = `stratasql.dock.${side}`
  const [width, setWidth] = useState(() => readWidth(storageKey) ?? defaultWidth)
  const [open, setOpen] = useState(true)
  const drag = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => setOpen(true), [revealKey])
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)))
    } catch {
      /* private mode: the width is not remembered */
    }
  }, [storageKey, width])

  const clamp = (w: number) => Math.max(260, Math.min(w, Math.max(320, window.innerWidth * 0.45)))
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    setWidth(clamp(drag.current.w + (side === 'left' ? dx : -dx)))
  }

  const gutter = (
    <div
      className="dock-gutter"
      role="separator"
      aria-orientation="vertical"
      title={open ? 'Drag to resize · double-click to reset' : undefined}
      onPointerDown={(e) => {
        if (!open || (e.target as HTMLElement).closest('button')) return
        drag.current = { x: e.clientX, w: width }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic pointer: no capture */
        }
      }}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => open && setWidth(defaultWidth)}
    >
      <button type="button" className="dock-toggle" onClick={() => setOpen(!open)} title={open ? `Hide the ${name}` : `Show the ${name}`} aria-expanded={open}>
        {(side === 'left') === open ? '‹' : '›'}
      </button>
    </div>
  )

  return (
    <div className={`dock dock-${side} ${open ? '' : 'is-collapsed'}`}>
      {side === 'right' && gutter}
      {open && (
        <div className="dock-body" style={{ width: `calc(${width}px / var(--ui-zoom, 1))` }}>
          {children}
        </div>
      )}
      {side === 'left' && gutter}
    </div>
  )
}
