// Canvas tools, the way drawing apps place them: what you draw with floats on the canvas (top centre),
// view controls and undo sit by the zoom buttons. The top bar keeps the document: file, views, help;
// the student may dock the draw tools there (drag the grip), when the bar is wide enough.

import { ControlButton, Controls, type FitViewOptions } from '@xyflow/react'
import { GripVertical, Plus, Redo2, Undo2 } from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor } from '../store'

const ICON = 15

const FLOAT_PADDING: FitViewOptions['padding'] = { top: '80px', right: 0.1, bottom: 0.1, left: 0.1 }

/**
 * Fit for the conceptual canvas: room on top for the floating draw tools, so they do not cover an
 * entity; no extra room while they are docked in the top bar (setFitForDock keeps it in step).
 */
export const CDM_FIT: FitViewOptions = { padding: FLOAT_PADDING, maxZoom: 1 }
export function setFitForDock(docked: boolean) {
  CDM_FIT.padding = docked ? 0.1 : FLOAT_PADDING
}

const DOCK_KEY = 'stratasql.drawDocked'

/** Where the draw tools live: floating on the canvas (default) or docked in the top bar, as the student drags them. */
export function useDrawDock(): [boolean, (docked: boolean) => void] {
  const [docked, setDocked] = useState(() => {
    try {
      return localStorage.getItem(DOCK_KEY) === '1'
    } catch {
      return false
    }
  })
  const set = (d: boolean) => {
    setDocked(d)
    try {
      localStorage.setItem(DOCK_KEY, d ? '1' : '0')
    } catch {
      /* private mode: the place is not remembered */
    }
  }
  return [docked, set]
}

/**
 * + Entity and the Link as switch (what a drag from ● creates). Keys: E, R, I. The grip on the left
 * moves the bar: dropped on the top bar it docks there, dropped on the canvas it floats again.
 */
export function DrawTools({ onAddEntity, docked, onDock, canDock }: { onAddEntity: () => void; docked: boolean; onDock: (docked: boolean) => void; canDock: boolean }) {
  const linkKind = useEditor((s) => s.linkKind)
  const setLinkKind = useEditor((s) => s.setLinkKind)
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; zoom: number } | null>(null)

  const onDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, zoom: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1 }
    document.documentElement.classList.add('draw-dragging')
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || !bar.current) return
    bar.current.style.translate = `${(e.clientX - d.x) / d.zoom}px ${(e.clientY - d.y) / d.zoom}px`
  }
  const onUp = (e: ReactPointerEvent) => {
    if (!drag.current) return
    drag.current = null
    document.documentElement.classList.remove('draw-dragging')
    if (bar.current) bar.current.style.translate = ''
    const top = document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0
    if (!docked && e.clientY < top && canDock) onDock(true)
    else if (docked && e.clientY > top + 8) onDock(false)
  }

  const grip = docked
    ? 'Drag onto the canvas to float this bar there (double-click: the same)'
    : canDock
      ? 'Drag into the top bar to keep these tools there and free the canvas (double-click: the same)'
      : 'Drag to move · the top bar is too narrow here for these tools'
  return (
    <div ref={bar} className={docked ? 'draw-docked' : 'canvas-tools'} role="toolbar" aria-label="Draw" data-tour="add">
      <span
        className="draw-grip"
        title={grip}
        aria-hidden
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => (docked || canDock) && onDock(!docked)}
      >
        <GripVertical size={14} />
      </span>
      <button type="button" className="btn btn-primary btn-icon keep-label" onClick={onAddEntity} title="Add an entity (E, or double-click the canvas)">
        <Plus size={ICON} aria-hidden />
        <span>Entity</span>
      </button>
      <span className="canvas-tools-sep" aria-hidden />
      <span className="toolbar-label" id="link-as">
        Link as:
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="link-as">
        <button type="button" role="radio" aria-checked={linkKind === 'relationship'} className={linkKind === 'relationship' ? 'on' : ''} onClick={() => setLinkKind('relationship')} title="Dragging from the ● handle of an entity to another entity creates a relationship (R)">
          Relationship
        </button>
        <button type="button" role="radio" aria-checked={linkKind === 'inheritance'} className={linkKind === 'inheritance' ? 'on' : ''} onClick={() => setLinkKind('inheritance')} title="Dragging from the ● handle of a child entity to its parent creates an inheritance (I)">
          Inheritance
        </button>
      </div>
    </div>
  )
}

/** Zoom, fit and (on the editable canvas) undo / redo, bottom left. */
export function CanvasControls({ fit, history }: { fit: FitViewOptions; history?: boolean }) {
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { undo, redo } = useEditor.getState()
  return (
    <Controls showInteractive={false} fitViewOptions={{ ...fit, duration: 300 }}>
      {history && (
        <>
          <ControlButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="control-history">
            <Undo2 size={14} aria-hidden />
          </ControlButton>
          <ControlButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
            <Redo2 size={14} aria-hidden />
          </ControlButton>
        </>
      )}
    </Controls>
  )
}
