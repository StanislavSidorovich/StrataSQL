import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { BookOpen, Check, CircleHelp, FileDown, FilePlus, FolderOpen, GraduationCap, Image as ImageIcon, Info, Keyboard, Maximize2, Moon, Play, Plus, Redo2, Save, SaveAll, Sun, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emptyModel } from '../core/metamodel'
import { addEntity, removeEntity, removeInheritance, removeRelationship } from '../core/ops'
import { importPowerDesigner } from '../core/import/powerdesigner'
import { FILE_EXTENSION, parseModel } from '../core/serialize'
import { applyUpdate, useUpdateReady } from '../pwa/register'
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
import { AppearanceButton } from './Appearance'
import { exportCdm, saveModel, saveModelAs } from './fileSave'
import { SideDock } from './SideDock'
import { useEditor, type View } from './store'
import { CASES } from '../data/cases'
import { Menu } from './onboarding/Menu'
import { Onboarding, useOnboarding } from './onboarding/Tour'
import { NameSuggestionLists, TrainerPane } from './trainer/TrainerPane'
import { MyTaskDialog } from './trainer/MyTask'
import { confirmDiscardTask, isVeiled, leaveTrainer, useTrainer } from './trainer/trainerStore'

/** The trainer cases, easiest first: their reference models are the examples. */
const EXAMPLES = CASES.map((c) => ({ id: c.id, label: `${c.title} ${'★'.repeat(c.difficulty)}`, build: c.build }))

const VIEWS: { id: View; label: string; short: string; title: string }[] = [
  { id: 'cdm', label: 'Conceptual', short: 'CDM', title: 'Edit the conceptual data model (CDM)' },
  { id: 'pdm', label: 'Physical', short: 'PDM', title: 'Tables generated from the CDM (PDM)' },
  { id: 'sql', label: 'SQL', short: 'SQL', title: 'SQL Server DDL generated from the PDM' },
  { id: 'sandbox', label: 'Sandbox', short: 'Sandbox', title: 'Run the schema in the browser: insert rows and see which constraint rejects them' },
]

/** Toolbar and menu icon size (lucide). */
const ICON = 15

/** Narrow screens (tablet, small laptop): the properties column starts hidden. */
function useNarrow(): boolean {
  const query = '(max-width: 1199px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

/** The model name with the autosave state: “Saved” once the browser holds the latest edit. */
function SavedState({ name }: { name: string }) {
  const savedAt = useEditor((s) => s.savedAt)
  const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="toolbar-model ml-auto">
      <span className="toolbar-model-name" title="Model name">
        {name}
      </span>
      {savedAt > 0 && (
        <span
          key={savedAt}
          className="saved-state"
          title={`Saved in this browser at ${time}: it comes back when you open the page again. File → Save keeps a copy as a file.`}
        >
          <Check size={13} aria-hidden />
          <span className="saved-label">Saved</span>
        </span>
      )}
    </div>
  )
}

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
  const pickerOnly = useTrainer((s) => s.session === null && s.pickerOpen)
  const walkOn = useEditor((s) => s.walkthrough !== null)
  const veiled = useTrainer((s) => isVeiled(s.session))
  const narrow = useNarrow()
  // Opening another case, level or the picker shows a hidden trainer column again.
  const trainerKey = useTrainer((s) => `${s.pickerOpen}|${s.session?.caseId}|${s.session?.level}|${s.session?.walk === undefined}`)
  const { undo, redo, load, apply, select, setLinkKind, setView, showError } = useEditor.getState()
  const fileInput = useRef<HTMLInputElement>(null)
  // The toolbar's height (it wraps at large text sizes or on narrow screens): the help drawer starts below it.
  const toolbar = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = toolbar.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--toolbar-h', `${el.getBoundingClientRect().height}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const flow = useReactFlow()

  const fit = () => setTimeout(() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 }), 50)

  const openExample = (build: () => ReturnType<typeof emptyModel>) => {
    if (!leaveTrainer()) return
    setView('cdm')
    load(build())
    fit()
  }

  const watchLibrary = () => {
    if (confirmDiscardTask()) useTrainer.getState().walkTo('library', 0)
  }
  const buildCase = (id: string) => {
    if (confirmDiscardTask()) useTrainer.getState().start(id, 3)
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
    useEditor.setState({ focusName: id })
  }

  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 10000)
    return () => clearTimeout(t)
  }, [notice])

  const save = (as: boolean) =>
    (as ? saveModelAs() : saveModel()).then((msg) => msg && setNotice(msg)).catch((err: Error) => showError(`Could not save: ${err.message}`))

  const openFile = async (file: File) => {
    try {
      const text = await file.text()
      if (!leaveTrainer()) return
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
        save(e.shiftKey)
      } else if (typing) {
        return
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (e.key === '?') {
        useOnboarding.getState().showShortcuts(true)
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
      <header className="toolbar" ref={toolbar}>
        <div className="brand">
          Strata<span>SQL</span>
        </div>
        <div className="toolbar-group">
          <Menu
            label="File"
            tour="file"
            items={[
              { label: 'New model', icon: <FilePlus size={ICON} />, onSelect: () => leaveTrainer() && load(emptyModel()) },
              { label: 'Open…', icon: <FolderOpen size={ICON} />, hint: `${FILE_EXTENSION}, .cdm`, onSelect: () => fileInput.current?.click() },
              { label: 'Save', icon: <Save size={ICON} />, hint: 'Ctrl+S', onSelect: () => save(false) },
              { label: 'Save as…', icon: <SaveAll size={ICON} />, hint: 'Ctrl+Shift+S', onSelect: () => save(true) },
              'separator',
              { label: 'Export for PowerDesigner', icon: <FileDown size={ICON} />, hint: '.cdm', onSelect: () => setNotice(exportCdm()) },
              ...(['png', 'svg'] as const).map((format) => ({
                label: `Export diagram as ${format.toUpperCase()}`,
                icon: <ImageIcon size={ICON} />,
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
            title="The course cases, easiest first: watch one built step by step, build it yourself with hints, or open the finished model"
            items={[
              { heading: 'Watch it built' },
              { label: 'Library (start here)', icon: <Play size={ICON} />, onSelect: watchLibrary },
              { label: 'Other cases…', icon: <Play size={ICON} />, onSelect: () => useTrainer.getState().openPicker(true) },
              'separator',
              { heading: 'Build it yourself (with hints)' },
              ...EXAMPLES.map((x) => ({ label: x.label, onSelect: () => buildCase(x.id) })),
              'separator',
              { heading: 'Show the answer' },
              ...EXAMPLES.map((x) => ({ label: x.label, onSelect: () => openExample(x.build) })),
              'separator',
              { label: 'Open exercises (no answer)…', icon: <BookOpen size={ICON} />, onSelect: () => useTrainer.getState().openPicker(true) },
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
        <div className="segmented view-switch" role="tablist" aria-label="View" data-tour="views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} title={v.title}>
              <span className="label-long">{v.label}</span>
              <span className="label-short">{v.short}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          data-tour="trainer"
          className={`btn btn-icon ${trainerOn ? 'btn-primary' : 'btn-accent'}`}
          onClick={() => useTrainer.getState().openPicker(!useTrainer.getState().pickerOpen)}
          title="Practise on the course cases: watch it built, worked example, text tagging, complete the model, build it yourself with hints"
        >
          <GraduationCap size={ICON} aria-hidden />
          <span>Trainer</span>
        </button>
        {view === 'cdm' && (
        <div className="toolbar-group" data-tour="add">
          <button type="button" className="btn btn-primary btn-icon" onClick={addEntityAtCenter} title="Add an entity (or double-click the canvas)">
            <Plus size={ICON} aria-hidden />
            <span>Entity</span>
          </button>
          <span className="toolbar-label" id="link-as">
            Link as:
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="link-as">
            <button type="button" role="radio" aria-checked={linkKind === 'relationship'} className={linkKind === 'relationship' ? 'on' : ''} onClick={() => setLinkKind('relationship')} title="Dragging from the ● handle of an entity to another entity creates a relationship">
              Relationship
            </button>
            <button type="button" role="radio" aria-checked={linkKind === 'inheritance'} className={linkKind === 'inheritance' ? 'on' : ''} onClick={() => setLinkKind('inheritance')} title="Dragging from the ● handle of a child entity to its parent creates an inheritance">
              Inheritance
            </button>
          </div>
        </div>
        )}
        <div className="toolbar-group">
          <button type="button" className="btn btn-icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={ICON} aria-hidden />
          </button>
          <button type="button" className="btn btn-icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
            <Redo2 size={ICON} aria-hidden />
          </button>
          {(view === 'cdm' || view === 'pdm') && (
            <button type="button" className="btn btn-icon" onClick={() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 })} title="Fit the model on screen" aria-label="Fit">
              <Maximize2 size={ICON} aria-hidden />
            </button>
          )}
        </div>
        <SavedState name={model.name} />
        <div className="toolbar-group">
          {updateReady && (
            <button type="button" className="btn btn-primary" onClick={applyUpdate} title="A new version of StrataSQL is ready. Your model is kept.">
              Update
            </button>
          )}
          <Menu
            label={
              <>
                <CircleHelp size={ICON} aria-hidden />
                <span className="label-long">Help</span>
              </>
            }
            className="btn-icon"
            title="Help: glossary, tour, keyboard shortcuts"
            tour="help"
            align="right"
            active={helpOpen}
            items={[
              { label: 'Glossary of concepts', icon: <BookOpen size={ICON} />, onSelect: () => useEditor.getState().openHelp() },
              { label: 'Tour of the screen', icon: <Info size={ICON} />, onSelect: startTour },
              { label: 'Watch a model being built…', icon: <Play size={ICON} />, onSelect: () => useTrainer.getState().openPicker(true) },
              { label: 'Keyboard shortcuts', icon: <Keyboard size={ICON} />, hint: '?', onSelect: () => useOnboarding.getState().showShortcuts(true) },
              { label: 'About StrataSQL', onSelect: () => useOnboarding.getState().showAbout(true) },
              'separator',
              { label: 'Quaera: SQL & analytics trainer ↗', hint: 'quaera.app', onSelect: () => window.open('https://quaera.app', '_blank', 'noopener') },
            ]}
          />
          <AppearanceButton dark={dark} />
          <button type="button" className="btn btn-icon" onClick={toggleTheme} title="Toggle light/dark theme" aria-label="Toggle light/dark theme">
            {dark ? <Sun size={ICON} aria-hidden /> : <Moon size={ICON} aria-hidden />}
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
        {trainerOn && (
          <SideDock side="left" name="trainer" defaultWidth={380} revealKey={trainerKey}>
            <TrainerPane />
          </SideDock>
        )}
        <NameSuggestionLists />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1" data-tour="canvas">
          {view === 'cdm' && <Canvas dark={dark} />}
          {view === 'pdm' && <PdmCanvas dark={dark} />}
          {view === 'sql' && <SqlView />}
          {model.entities.length === 0 && view !== 'sql' && (
            <div className="empty-state">
              <h2>{pickerOnly ? 'Pick a case on the left' : 'Start a conceptual model'}</h2>
              <p>
                {walkOn
                  ? 'The model appears here step by step — follow the steps on the left.'
                  : pickerOnly
                    ? 'Start with ▶ Watch it built, then try the levels 0 → 3. Your own model comes back when you close the trainer.'
                    : `Double-click the canvas or press “+ Entity”.${trainerOn ? ' Read the text on the left and model it here.' : ' Or start here:'}`}
              </p>
              {!trainerOn && (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={watchLibrary}>
                  ▶ Watch a model being built
                </button>
                <button type="button" className="btn" onClick={() => useTrainer.getState().openPicker(true)}>
                  🎓 Build one with hints
                </button>
              </div>
              )}
              {!trainerOn && <p className="muted text-xs">Finished models of all {EXAMPLES.length} cases are in the Examples menu.</p>}
            </div>
          )}
          {veiled && (
            <div className="canvas-veil" role="region" aria-label="Model hidden">
              <div>
                <h2>The model is hidden for now</h2>
                <p>Tag every phrase from memory first — then the finished model appears here, with each phrase’s element.</p>
                <button type="button" className="btn btn-small" onClick={() => useTrainer.getState().setPeek(true)}>
                  Peek at the model
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="error-toast" role="alert" onClick={() => showError(null)}>
              {error}
            </div>
          )}
          </div>
          {view === 'cdm' && model.entities.length > 0 && !walkOn && <IssuesDock />}
        </main>
        <SideDock
          side="right"
          name="properties"
          defaultWidth={390}
          autoHide={walkOn || narrow}
          revealKey={narrow && !walkOn && selection ? `${selection.kind}:${selection.id}` : undefined}
        >
        <aside className="panel" aria-label="Properties" data-tour="panel">
          {view !== 'cdm' && <PdmPanel />}
          {view === 'cdm' && entity && <EntityPanel key={entity.id} entity={entity} model={model} />}
          {view === 'cdm' && rel && <RelationshipPanel key={rel.id} rel={rel} model={model} />}
          {view === 'cdm' && inh && <InheritancePanel key={inh.id} inh={inh} model={model} />}
          {view === 'cdm' && !entity && !rel && !inh && <ModelPanel model={model} />}
        </aside>
        </SideDock>
      </div>
      )}
      {notice && (
        <div className="notice-toast" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <HelpDrawer />
      <MyTaskDialog />
      <Onboarding onPractise={() => useTrainer.getState().openPicker(true)} onWatch={watchLibrary} />
    </div>
  )
}
