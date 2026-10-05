// Tablets: the on-screen keyboard and the portrait layout.
//
// Keyboard: Android Chrome shrinks the page under the keyboard (`interactive-widget=resizes-content`
// in index.html); Safari only shrinks the visual viewport, so the app's height follows it there
// (`--app-h`). Either way the field being typed in is scrolled back into view.

import { useEffect, useState } from 'react'

const isTextField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'file', 'range'].includes(el.type))

function revealFocused() {
  const el = document.activeElement
  if (isTextField(el)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function installKeyboardFit() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let frame = 0
  vv.addEventListener('resize', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // A keyboard that covers the page without resizing it: the app takes the visible height.
      if (window.innerHeight - vv.height > 80) {
        root.style.setProperty('--app-h', `${vv.height}px`)
        window.scrollTo(0, 0)
      } else root.style.removeProperty('--app-h')
      revealFocused()
    })
  })
  // The keyboard opens a moment after the focus; a field already in view stays where it is.
  document.addEventListener('focusin', (e) => {
    if (isTextField(e.target as Element) && matchMedia('(pointer: coarse)').matches) setTimeout(revealFocused, 350)
  })
}

/** A tablet or phone held upright. Measured on the screen, not the window: the keyboard makes the window wide and short. */
const portraitNow = () => window.innerWidth < 1200 && window.screen.height > window.screen.width

export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(portraitNow)
  useEffect(() => {
    const on = () => setPortrait(portraitNow())
    // The keyboard opening or closing while a field is being typed in never changes the layout.
    const onResize = () => isTextField(document.activeElement) || on()
    window.addEventListener('resize', onResize)
    screen.orientation?.addEventListener?.('change', on)
    return () => {
      window.removeEventListener('resize', onResize)
      screen.orientation?.removeEventListener?.('change', on)
    }
  }, [])
  return portrait
}
