// Theme, text size and colours (toolbar "Aa"). Text size zooms the panels; the diagram's text grows with it too
// (font size, not zoom — React Flow measures the nodes again), unless the student turns that off.
// Colours are kept per theme, so a pale canvas chosen in light mode does not end up behind light text in dark mode.
// Input fields keep their own white (or dark) background.

import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useKeepInView } from './useKeepInView'

const STORAGE_KEY = 'stratasql.look'

export const TEXT_SIZES = [
  { zoom: 1, label: 'Normal' },
  { zoom: 1.1, label: 'Slightly larger' },
  { zoom: 1.15, label: 'Large' },
  { zoom: 1.3, label: 'Larger' },
  { zoom: 1.5, label: 'Largest' },
] as const

type Theme = 'light' | 'dark'
interface Look {
  /** Text size as a factor (1, 1.1 … 1.5). */
  size: number
  /** The diagram's text follows the text size. */
  diagram: boolean
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
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Look> & { text?: number }
    // Before 1.1 was added the size was stored as an index into [1, 1.15, 1.3, 1.5].
    const size = Number(v.size) || [1, 1.15, 1.3, 1.5][Number(v.text) || 0] || 1
    return { size, diagram: v.diagram !== false, canvas: v.canvas ?? {}, panels: v.panels ?? {} }
  } catch {
    return { size: 1, diagram: true, canvas: {}, panels: {} }
  }
}

/** Applies the stored look to the page; call once near the root. */
function applyLook(look: Look, theme: Theme) {
  const root = document.documentElement.style
  root.setProperty('--ui-zoom', String(look.size))
  root.setProperty('--diagram-zoom', String(look.diagram ? look.size : 1))
  const set = (name: string, value: string | undefined) => (value ? root.setProperty(name, value) : root.removeProperty(name))
  set('--canvas-bg', look.canvas[theme])
  set('--code-bg', look.canvas[theme])
  set('--panel-bg', look.panels[theme])
}

export function AppearanceButton({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const theme: Theme = dark ? 'dark' : 'light'
  const [look, setLook] = useState(readLook)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useKeepInView(panel, open)

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
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
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
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open} title="Appearance: light or dark theme, text size, colours" onClick={() => setOpen((o) => !o)}>
        Aa
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label="Appearance" className="menu-list menu-right look-panel">
          <div className="look-row">
            <div className="look-label">Theme</div>
            <div className="segmented self-start" role="radiogroup" aria-label="Theme">
              {([false, true] as const).map((d) => (
                <button key={String(d)} type="button" role="radio" aria-checked={dark === d} className={`btn-icon ${dark === d ? 'on' : ''}`} onClick={() => dark !== d && onToggleTheme()}>
                  {d ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
                  <span>{d ? 'Dark' : 'Light'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="look-row">
            <div className="look-label">Text size</div>
            <div className="segmented">
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={look.size === t.zoom ? 'on' : ''}
                  title={`${t.label} (${Math.round(t.zoom * 100)} %)`}
                  aria-label={`Text size: ${t.label}`}
                  style={{ fontSize: `${12 * t.zoom}px` }}
                  onClick={() => setLook((l) => ({ ...l, size: t.zoom }))}
                >
                  A
                </button>
              ))}
            </div>
            <label className="look-hint flex items-center gap-1">
              <input type="checkbox" checked={look.diagram} onChange={(e) => setLook((l) => ({ ...l, diagram: e.target.checked }))} />
              Diagram text too (entities and tables get bigger; the diagram also has its own zoom: + / − or the mouse wheel)
            </label>
          </div>
          {colorRow('canvas', 'Canvas')}
          {colorRow('panels', 'Panels (top bar, side columns)')}
          <div className="look-hint">Colours are kept separately for the light and dark theme.</div>
          <button type="button" className="btn btn-small self-start" onClick={() => setLook({ size: 1, diagram: true, canvas: {}, panels: {} })}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
