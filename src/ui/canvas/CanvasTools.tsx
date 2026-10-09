// Canvas tools, the way drawing apps place them: what you draw with floats on the canvas (top centre),
// view controls and undo sit by the zoom buttons. The top bar keeps only the document: file, views, help.

import { ControlButton, Controls, type FitViewOptions } from '@xyflow/react'
import { Plus, Redo2, Undo2 } from 'lucide-react'
import { useEditor } from '../store'

const ICON = 15

/** Fit for the conceptual canvas: room on top for the draw tools, so they do not cover an entity. */
export const CDM_FIT: FitViewOptions = { padding: { top: '80px', right: 0.1, bottom: 0.1, left: 0.1 }, maxZoom: 1 }

/** + Entity and the Link as switch (what a drag from ● creates). Keys: E, R, I. */
export function DrawTools({ onAddEntity }: { onAddEntity: () => void }) {
  const linkKind = useEditor((s) => s.linkKind)
  const setLinkKind = useEditor((s) => s.setLinkKind)
  return (
    <div className="canvas-tools" role="toolbar" aria-label="Draw" data-tour="add">
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
