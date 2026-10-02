import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { emptyModel } from '../core/metamodel'
import { addEntity, removeEntity, removeInheritance, removeRelationship } from '../core/ops'
import { FILE_EXTENSION, parseModel, serializeModel } from '../core/serialize'
import { buildTvShows } from '../data/examples/tv-shows'
import { Canvas } from './canvas/Canvas'
import { EntityPanel } from './panels/EntityPanel'
import { InheritancePanel } from './panels/InheritancePanel'
import { ModelPanel } from './panels/ModelPanel'
import { RelationshipPanel } from './panels/RelationshipPanel'
import { useEditor } from './store'

const EXAMPLES = [{ id: 'tv-shows', label: 'TV Shows (Class 03)', build: buildTvShows }]

export function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('stratasql.theme')
    return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('stratasql.theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, () => setDark((d) => !d)]
}

function downloadModel() {
  const { model } = useEditor.getState()
  const blob = new Blob([serializeModel(model)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(model.name || 'model').replace(/[^\p{L}\p{N}_-]+/gu, '_')}${FILE_EXTENSION}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function deleteSelection() {
  const { selection, apply } = useEditor.getState()
  if (!selection) return
  apply((m) => {
    if (selection.kind === 'entity') removeEntity(m, selection.id)
    else if (selection.kind === 'relationship') removeRelationship(m, selection.id)
    else removeInheritance(m, selection.id)
  })
}

function Editor() {
  const [dark, toggleTheme] = useTheme()
  const model = useEditor((s) => s.model)
  const selection = useEditor((s) => s.selection)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const linkKind = useEditor((s) => s.linkKind)
  const error = useEditor((s) => s.error)
  const { undo, redo, load, apply, select, setLinkKind, showError } = useEditor.getState()
  const fileInput = useRef<HTMLInputElement>(null)
  const flow = useReactFlow()

  const fit = () => setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 50)

  const addEntityAtCenter = () => {
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const pos = el ? flow.screenToFlowPosition({ x: el.left + el.width / 2 - 90, y: el.top + el.height / 2 - 40 }) : { x: 0, y: 0 }
    let id = ''
    apply((m) => (id = addEntity(m, { position: { x: Math.round(pos.x), y: Math.round(pos.y) } }).id))
    select({ kind: 'entity', id })
  }

  const openFile = async (file: File) => {
    try {
      load(parseModel(await file.text()))
      fit()
    } catch (e) {
      showError(`Could not open ${file.name}: ${(e as Error).message}`)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        downloadModel()
      } else if (typing) {
        return
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection()
      } else if (e.key === 'Escape') {
        select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, select])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => showError(null), 6000)
    return () => clearTimeout(t)
  }, [error, showError])

  const entity = selection?.kind === 'entity' ? model.entities.find((e) => e.id === selection.id) : undefined
  const rel = selection?.kind === 'relationship' ? model.relationships.find((r) => r.id === selection.id) : undefined
  const inh = selection?.kind === 'inheritance' ? model.inheritances.find((i) => i.id === selection.id) : undefined

  return (
    <div className="flex h-full flex-col">
      <header className="toolbar">
        <div className="brand">
          Strata<span>SQL</span>
        </div>
        <span className="toolbar-model" title="Model name">
          {model.name}
        </span>
        <div className="toolbar-group">
          <button type="button" className="btn" onClick={() => load(emptyModel())} title="New empty model">
            New
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()} title={`Open a ${FILE_EXTENSION} file`}>
            Open…
          </button>
          <button type="button" className="btn" onClick={downloadModel} title="Save as file (Ctrl+S)">
            Save
          </button>
          <select
            className="input w-auto"
            aria-label="Load example"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value)
              if (ex) {
                load(ex.build())
                fit()
              }
            }}
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openFile(f)
              e.target.value = ''
            }}
          />
        </div>
        <div className="toolbar-group">
          <button type="button" className="btn btn-primary" onClick={addEntityAtCenter}>
            + Entity
          </button>
          <div className="segmented" role="radiogroup" aria-label="Link kind">
            <button type="button" role="radio" aria-checked={linkKind === 'relationship'} className={linkKind === 'relationship' ? 'on' : ''} onClick={() => setLinkKind('relationship')} title="Dragging between entities creates a relationship">
              Relationship
            </button>
            <button type="button" role="radio" aria-checked={linkKind === 'inheritance'} className={linkKind === 'inheritance' ? 'on' : ''} onClick={() => setLinkKind('inheritance')} title="Drag from a child entity to its parent">
              Inheritance
            </button>
          </div>
        </div>
        <div className="toolbar-group">
          <button type="button" className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button type="button" className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            ↷
          </button>
          <button type="button" className="btn" onClick={() => flow.fitView({ padding: 0.15, duration: 300 })} title="Fit the model on screen">
            Fit
          </button>
        </div>
        <div className="ml-auto">
          <button type="button" className="btn" onClick={toggleTheme} title="Toggle light/dark theme">
            {dark ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Canvas dark={dark} />
          {model.entities.length === 0 && (
            <div className="empty-state">
              <h2>Start a conceptual model</h2>
              <p>Double-click the canvas or press “+ Entity”. Or open a worked example:</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  load(buildTvShows())
                  fit()
                }}
              >
                Open TV Shows example
              </button>
            </div>
          )}
          {error && (
            <div className="error-toast" role="alert" onClick={() => showError(null)}>
              {error}
            </div>
          )}
        </main>
        <aside className="panel" aria-label="Properties">
          {entity && <EntityPanel key={entity.id} entity={entity} model={model} />}
          {rel && <RelationshipPanel key={rel.id} rel={rel} model={model} />}
          {inh && <InheritancePanel key={inh.id} inh={inh} model={model} />}
          {!entity && !rel && !inh && <ModelPanel model={model} />}
        </aside>
      </div>
    </div>
  )
}
