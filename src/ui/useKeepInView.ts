// A dropdown opens under its button aligned left or right; when the toolbar wraps (tablet, narrow window)
// that can put it partly off screen. This shifts it sideways so it stays inside the window.

import { useLayoutEffect, type RefObject } from 'react'

const MARGIN = 8

export function useKeepInView(ref: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const fit = () => {
      el.style.transform = ''
      const r = el.getBoundingClientRect()
      const width = document.documentElement.clientWidth
      let dx = 0
      if (r.right > width - MARGIN) dx = width - MARGIN - r.right
      if (r.left + dx < MARGIN) dx = MARGIN - r.left
      if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref, open])
}
