// A drag handle on the top edge of a dock under the canvas (Changes, Model check): drag up for a
// taller list, down for a shorter one, double-click to reset. The height is remembered per dock.
// While a dock is open its height is the dragged one; without a drag the CSS max-height rules.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

const MIN = 90

const readHeight = (key: string) => {
  try {
    const h = Number(localStorage.getItem(key))
    return Number.isFinite(h) && h >= MIN ? h : null
  } catch {
    return null
  }
}

/** Dragged height of a dock: `style` goes on the dock, `handle` is its first child. */
export function useDockResize(name: string, open: boolean) {
  const storageKey = `stratasql.dockHeight.${name}`
  const [height, setHeight] = useState<number | null>(() => readHeight(storageKey))
  const drag = useRef<{ y: number; h: number; max: number } | null>(null)

  useEffect(() => {
    try {
      if (height === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, String(Math.round(height)))
    } catch {
      /* private mode: the height is not remembered */
    }
  }, [storageKey, height])

  const style: CSSProperties | undefined = open && height !== null ? { height: `${height}px`, maxHeight: 'none' } : undefined

  const handle = open ? (
    <div
      className="dock-resizer"
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize · double-click to reset"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        const dock = e.currentTarget.parentElement
        if (!dock) return
        // The dock may grow up to 75 % of the column it sits in (canvas + docks).
        const max = Math.max(MIN, (dock.parentElement?.clientHeight ?? window.innerHeight) * 0.75)
        drag.current = { y: e.clientY, h: dock.getBoundingClientRect().height, max }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic pointer: no capture */
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setHeight(Math.max(MIN, Math.min(drag.current.max, drag.current.h + (drag.current.y - e.clientY))))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => setHeight(null)}
    />
  ) : null

  return { style, handle }
}
