import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { emptyModel } from '../core/metamodel'
import { addEntity, removeEntity, removeInheritance, removeRelationship } from '../core/ops'
import { importPowerDesigner } from '../core/import/powerdesigner'
import { FILE_EXTENSION, parseModel, serializeModel } from '../core/serialize'
import { applyUpdate, useUpdateReady } from '../pwa/register'
import { buildRideHailing } from '../data/examples/ride-hailing'
import { buildTimetables } from '../data/examples/timetables'
import { buildTvShows } from '../data/examples/tv-shows'
import { Canvas } from './canvas/Canvas'
import { exportDiagram } from './exportImage'
import { HelpDrawer } from './help/HelpDrawer'
import { IssuesDock } from './lint/IssuesPanel'
import { EntityPanel } from './panels/EntityPanel'
import { InheritancePanel } from './panels/InheritancePanel'
import { ModelPanel } from './panels/ModelPanel'
import { RelationshipPanel } from './panels/RelationshipPanel'
import { PdmCanvas } from './pdm/PdmCanvas'
import { PdmPanel } from './pdm/PdmPanel'
import { fileBaseName, SqlView } from './pdm/SqlView'
import { SandboxView } from './sandbox/SandboxView'
import { useEditor, type View } from './store'
import { Menu } from './onboarding/Menu'
import { Onboarding, useOnboarding } from './onboarding/Tour'
import { TrainerPane } from './trainer/TrainerPane'
import { useTrainer } from './trainer/trainerStore'

const EXAMPLES = [
  { id: 'tv-shows', label: 'TV Shows (Class 03)', build: buildTvShows },
  { id: 'timetables', label: 'Timetables (Class 03)', build: buildTimetables },
  { id: 'ride-hailing', label: 'Ride Hailing (Shadow Project)', build: buildRideHailing },
]

const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'cdm', label: 'Conceptual', title: 'Edit the conceptual data model (CDM)' },
  { id: 'pdm', label: 'Physical', title: 'Tables generated from the CDM (PDM)' },
  { id: 'sql', label: 'SQL', title: 'SQL Server DDL generated from the PDM' },
  { id: 'sandbox', label: 'Sandbox', title: 'Run the schema in the browser: insert rows and see which constraint rejects them' },
]

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
  a.download = `${fileBaseName(model.name)}${FILE_EXTENSION}`
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
  const updateReady = useUpdateReady()
  const model = useEditor((s) => s.model)
  const selection = useEditor((s) => s.selection)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const linkKind = useEditor((s) => s.linkKind)
  const error = useEditor((s) => s.error)
  const view = useEditor((s) => s.view)
  const helpOpen = useEditor((s) => s.help !== null)
  const trainerOn = useTrainer((s) => s.session !== null || s.pickerOpen)
  const { undo, redo, load, apply, select, setLinkKind, setView, showError } = useEditor.getState()
  const fileInput = useRef<HTMLInputElement>(null)
  const flow = useReactFlow()

  const fit = () => setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 50)

  const openExample = (build: () => ReturnType<typeof emptyModel>) => {
    setView('cdm')
    load(build())
    fit()
  }

  const startTour = () => {
    setView('cdm')
    setTimeout(() => useOnboarding.getState().startTour(), 50)
  }

  const addEntityAtCenter = () => {
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const pos = el ? flow.screenToFlowPosition({ x: el.left + el.width / 2 - 90, y: el.top + el.height / 2 - 40 }) : { x: 0, y: 0 }
    let id = ''
    apply((m) => (id = addEntity(m, { position: { x: Math.round(pos.x), y: Math.round(pos.y) } }).id))
    select({ kind: 'entity', id })
  }

  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 10000)
    return () => clearTimeout(t)
  }, [notice])

  const openFile = async (file: File) => {
    try {
      const text = await file.text()
      if (/\.(cdm|cdb|pdm|pdb)$/i.test(file.name)) {
        const { model: imported, warnings } = importPowerDesigner(text, file.name)
        setView('cdm')
        load(imported)
        setNotice(
          `Imported ${imported.entities.length} entities and ${imported.relationships.length} relationships from ${file.name}.` +
            (warnings.length ? `\n${warnings.join('\n')}` : ''),
        )
      } else load(parseModel(text))
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && useEditor.getState().view === 'cdm') {
        deleteSelection()
      } else if (e.key === 'Escape') {
        const s = useEditor.getState()
        if (s.help !== null) return s.closeHelp()
        select(null)
        s.selectTable(null)
        s.focusIssue(null)
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
        <div className="segmented view-switch" role="tablist" aria-label="View" data-tour="views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} title={v.title}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <Menu
            label="File"
            tour="file"
            items={[
              { label: 'New model', onSelect: () => load(emptyModel()) },
              { label: 'Open…', hint: `${FILE_EXTENSION}, .cdm`, onSelect: () => fileInput.current?.click() },
              { label: 'Save', hint: 'Ctrl+S', onSelect: downloadModel },
              'separator',
              ...(['png', 'svg'] as const).map((format) => ({
                label: `Export diagram as ${format.toUpperCase()}`,
                disabled: view !== 'cdm' && view !== 'pdm',
                onSelect: () => {
                  const suffix = view === 'pdm' ? '_PDM' : '_CDM'
                  exportDiagram(flow.getNodesBounds(flow.getNodes()), format, fileBaseName(model.name) + suffix).catch((err: Error) => showError(`Export failed: ${err.message}`))
                },
              })),
            ]}
          />
          <Menu
            label="Examples"
            title="Finished reference models of the course cases"
            items={[
              ...EXAMPLES.map((x) => ({ label: x.label, onSelect: () => openExample(x.build) })),
              'separator',
              { label: 'Build one yourself (Trainer)…', onSelect: () => useTrainer.getState().openPicker(true) },
            ]}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json,.cdm,.cdb,.pdm,.pdb"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {view === 'cdm' && (
        <div className="toolbar-group" data-tour="add">
          <button type="button" className="btn btn-primary" onClick={addEntityAtCenter} title="Add an entity (or double-click the canvas)">
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
        )}
        <div className="toolbar-group">
          <button type="button" className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button type="button" className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            ↷
          </button>
          {(view === 'cdm' || view === 'pdm') && (
              <button type="button" className="btn" onClick={() => flow.fitView({ padding: 0.15, duration: 300 })} title="Fit the model on screen">
              Fit
            </button>
          )}
        </div>
        <div className="toolbar-group ml-auto">
          {updateReady && (
            <button type="button" className="btn btn-primary" onClick={applyUpdate} title="A new version of StrataSQL is ready. Your model is kept.">
              Update
            </button>
          )}
          <button
            type="button"
            data-tour="trainer"
            className={`btn ${trainerOn ? 'btn-primary' : ''}`}
            onClick={() => useTrainer.getState().openPicker(!useTrainer.getState().pickerOpen)}
            title="Practise on the course cases: worked example, text tagging, complete the model, from scratch"
          >
            🎓 Trainer
          </button>
          <Menu
            label="? Help"
            tour="help"
            align="right"
            active={helpOpen}
            items={[
              { label: 'Glossary of concepts', onSelect: () => useEditor.getState().openHelp() },
              { label: 'Tour of the screen', onSelect: startTour },
              { label: 'Keyboard shortcuts', onSelect: () => useOnboarding.getState().showShortcuts(true) },
            ]}
          />
          <button type="button" className="btn" onClick={toggleTheme} title="Toggle light/dark theme">
            {dark ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {view === 'sandbox' ? (
        <>
          <SandboxView />
          {error && (
            <div className="error-toast" role="alert" onClick={() => showError(null)}>
              {error}
            </div>
          )}
        </>
      ) : (
      <div className="flex min-h-0 flex-1">
        {trainerOn && <TrainerPane />}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1" data-tour="canvas">
          {view === 'cdm' && <Canvas dark={dark} />}
          {view === 'pdm' && <PdmCanvas dark={dark} />}
          {view === 'sql' && <SqlView />}
          {model.entities.length === 0 && view !== 'sql' && (
            <div className="empty-state">
              <h2>Start a conceptual model</h2>
              <p>Double-click the canvas or press “+ Entity”.{trainerOn ? ' Read the text on the left and model it here.' : ' Or open a worked example:'}</p>
              {!trainerOn && (
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setView('cdm')
                      load(x.build())
                      fit()
                    }}
                  >
                    {x.label}
                  </button>
                ))}
                <button type="button" className="btn" onClick={() => useTrainer.getState().openPicker(true)}>
                  🎓 Trainer
                </button>
              </div>
              )}
            </div>
          )}
          {error && (
            <div className="error-toast" role="alert" onClick={() => showError(null)}>
              {error}
            </div>
          )}
          </div>
          {view === 'cdm' && model.entities.length > 0 && <IssuesDock />}
        </main>
        <aside className="panel" aria-label="Properties" data-tour="panel">
          {view !== 'cdm' && <PdmPanel />}
          {view === 'cdm' && entity && <EntityPanel key={entity.id} entity={entity} model={model} />}
          {view === 'cdm' && rel && <RelationshipPanel key={rel.id} rel={rel} model={model} />}
          {view === 'cdm' && inh && <InheritancePanel key={inh.id} inh={inh} model={model} />}
          {view === 'cdm' && !entity && !rel && !inh && <ModelPanel model={model} />}
        </aside>
      </div>
      )}
      {notice && (
        <div className="notice-toast" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <HelpDrawer />
      <Onboarding onPractise={() => useTrainer.getState().openPicker(true)} onExample={() => openExample(buildTvShows)} />
    </div>
  )
}
