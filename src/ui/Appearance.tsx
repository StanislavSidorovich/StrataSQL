// Text size and colours (toolbar "Aa"). Text size zooms the panels, not the diagram (the diagram has its own zoom).
// Colours are kept per theme, so a pale canvas chosen in light mode does not end up behind light text in dark mode.
// Input fields keep their own white (or dark) background.

import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'stratasql.look'

export const TEXT_SIZES = [
  { zoom: 1, label: 'Normal' },
  { zoom: 1.15, label: 'Large' },
  { zoom: 1.3, label: 'Larger' },
  { zoom: 1.5, label: 'Largest' },
] as const

type Theme = 'light' | 'dark'
interface Look {
  text: number
  canvas: Partial<Record<Theme, string>>
  panels: Partial<Record<Theme, string>>
}

/** First swatch = the theme's own colour. */
const SWATCHES: Record<'canvas' | 'panels', Record<Theme, string[]>> = {
  canvas: {
    light: ['#fbfbfc', '#f8f4ea', '#edf6f0', '#edf3fb', '#f3effa', '#fbeff0', '#e9ecf0'],
    dark: ['#171a21', '#1d1b16', '#14201b', '#131b27', '#1d1826', '#0e1014', '#262a31'],
  },
  panels: {
    light: ['#ffffff', '#f6f1e4', '#e8f3ec', '#e7eff9', '#efe9f8', '#f9eaec', '#eceef2'],
    dark: ['#1b1f27', '#24211b', '#18251f', '#18212e', '#231d2d', '#121418', '#2b3038'],
  },
}

function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Look>
    return { text: Number(v.text) || 0, canvas: v.canvas ?? {}, panels: v.panels ?? {} }
  } catch {
    return { text: 0, canvas: {}, panels: {} }
  }
}

/** Applies the stored look to the page; call once near the root. */
function applyLook(look: Look, theme: Theme) {
  const root = document.documentElement.style
  root.setProperty('--ui-zoom', String(TEXT_SIZES[look.text]?.zoom ?? 1))
  const set = (name: string, value: string | undefined) => (value ? root.setProperty(name, value) : root.removeProperty(name))
  set('--canvas-bg', look.canvas[theme])
  set('--code-bg', look.canvas[theme])
  set('--panel-bg', look.panels[theme])
}

export function AppearanceButton({ dark }: { dark: boolean }) {
  const theme: Theme = dark ? 'dark' : 'light'
  const [look, setLook] = useState(readLook)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    applyLook(look, theme)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(look))
    } catch {
      /* private mode: the look is not remembered */
    }
  }, [look, theme])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const setColor = (part: 'canvas' | 'panels', color: string | undefined) =>
    setLook((l) => ({ ...l, [part]: { ...l[part], [theme]: color } }))

  const colorRow = (part: 'canvas' | 'panels', label: string) => {
    const swatches = SWATCHES[part][theme]
    const current = look[part][theme] ?? swatches[0]
    return (
      <div className="look-row">
        <div className="look-label">{label}</div>
        <div className="look-swatches">
          {swatches.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`look-swatch ${current.toLowerCase() === c ? 'on' : ''}`}
              style={{ background: c }}
              title={i === 0 ? 'Default' : c}
              aria-label={i === 0 ? `${label}: default` : `${label}: ${c}`}
              onClick={() => setColor(part, i === 0 ? undefined : c)}
            />
          ))}
          <label className="look-swatch look-custom" title="Any colour…" style={{ background: current }}>
            <span aria-hidden>＋</span>
            <input type="color" aria-label={`${label}: any colour`} value={current} onChange={(e) => setColor(part, e.target.value)} />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="menu" ref={root}>
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open} title="Text size and colours" onClick={() => setOpen((o) => !o)}>
        Aa
      </button>
      {open && (
        <div role="dialog" aria-label="Text size and colours" className="menu-list menu-right look-panel">
          <div className="look-row">
            <div className="look-label">Text size</div>
            <div className="segmented">
              {TEXT_SIZES.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  className={look.text === i ? 'on' : ''}
                  title={`${t.label} (${Math.round(t.zoom * 100)} %)`}
                  aria-label={`Text size: ${t.label}`}
                  style={{ fontSize: `${12 * t.zoom}px` }}
                  onClick={() => setLook((l) => ({ ...l, text: i }))}
                >
                  A
                </button>
              ))}
            </div>
            <div className="look-hint">The diagram has its own zoom (+ / − or the mouse wheel).</div>
          </div>
          {colorRow('canvas', 'Canvas')}
          {colorRow('panels', 'Panels (top bar, side columns)')}
          <div className="look-hint">Colours are kept separately for the light and dark theme.</div>
          <button type="button" className="btn btn-small self-start" onClick={() => setLook({ text: 0, canvas: {}, panels: {} })}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
