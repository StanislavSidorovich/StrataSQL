// Several models open at once. The editor store (store.ts) still holds exactly one model, the active
// one, so every edit, check and export works as before. The other open models are parked here with
// their own undo history, view and Save-as file; switching parks the active one and brings the chosen
// one back. The active model is kept in the browser by the editor's autosave, the parked ones under DOCS_KEY.
// Tabs wait while the trainer, a walkthrough, a lesson or a story has the canvas (the user's model is then
// in `trainerBackup`): see `locked`.
import { create } from 'zustand'
import { emptyModel, type Model } from '../core/metamodel'
import { ModelFormatError, parseModel, readSavedBase, serializeModel } from '../core/serialize'
import { deleteHandle, getHandle, putHandle } from './handleStore'
import { onSavedFileChange, setSavedFile, takeSavedFile, type SavedFile } from './savedFile'
import { useEditor, type View } from './store'

export const DOCS_KEY = 'stratasql.docs'
export const MAX_TABS = 12
export const CLOSED_KEPT = 5

/** A model that is not on the canvas: the model and everything that belongs to it. */
export interface Parked {
  model: Model
  past: Model[]
  future: Model[]
  view: View
  tableSelection: string | null
  /** The earlier version this model is compared with, if any. */
  changesBase: Model | null
  /** The file chosen with “Save as” for this model, if any. */
  file: SavedFile | null
}

export interface Tab {
  id: string
}

interface DocsState {
  tabs: Tab[]
  active: string
  /** The open models that are not on the canvas, by tab id. */
  parked: Record<string, Parked>
  /** Recently closed models, newest last: File → Reopen closed model. */
  closed: Parked[]
}

export const hasContent = (m: Model) => m.entities.length > 0

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const fresh = (model: Model): Parked => ({ model, past: [], future: [], view: 'cdm', tableSelection: null, changesBase: null, file: null })

function stored(): { tabs: Tab[]; active: string; parked: Record<string, Parked> } {
  const none = { tabs: [{ id: 't0' }], active: 't0', parked: {} }
  try {
    const raw = globalThis.localStorage?.getItem(DOCS_KEY)
    if (!raw) return none
    const data = JSON.parse(raw) as { tabs: string[]; active: string; parked: Record<string, string> }
    if (!Array.isArray(data.tabs) || !data.tabs.includes(data.active)) return none
    const parked: Record<string, Parked> = {}
    const tabs: Tab[] = []
    for (const id of data.tabs) {
      if (id === data.active) {
        tabs.push({ id })
      } else if (typeof data.parked?.[id] === 'string') {
        parked[id] = { ...fresh(parseModel(data.parked[id])), changesBase: readSavedBase(data.parked[id]) }
        tabs.push({ id })
      }
    }
    return { tabs, active: data.active, parked }
  } catch (e) {
    if (!(e instanceof ModelFormatError)) console.warn('Ignoring stored tabs:', e)
    return none
  }
}

export const useDocs = create<DocsState>()(() => ({ ...stored(), closed: [] }))

/** Takes the active model off the canvas. */
function park(): Parked {
  const { model, past, future, view, tableSelection, changesBase } = useEditor.getState()
  return { model, past, future, view, tableSelection, changesBase, file: takeSavedFile() }
}

/** Puts a model on the canvas as the active one (a new document: the view fits again). */
function show(p: Parked) {
  useEditor.setState((s) => ({
    model: p.model,
    past: p.past,
    future: p.future,
    view: p.view,
    tableSelection: p.tableSelection,
    changesBase: p.changesBase,
    doc: s.doc + 1,
    selection: null,
    focusName: null,
    focusedIssue: null,
    lastEdit: null,
    error: null,
  }))
  setSavedFile(p.file)
}

/** The trainer, a walkthrough, a lesson or a story has the canvas: the tabs wait until it ends. */
export const locked = () => useEditor.getState().trainerBackup !== null

const untouched = () => {
  const ed = useEditor.getState()
  return !hasContent(ed.model) && ed.past.length === 0 && !ed.changesBase
}

/**
 * Opens a model in a new tab; an empty untouched tab is reused. The caller has already left the trainer
 * and the story (leaveModes), so the canvas holds the user's own model. False: no room for another tab.
 */
export function openModel(model: Model): boolean {
  const ed = useEditor.getState()
  if (ed.trainerBackup || untouched()) {
    ed.load(model)
    return true
  }
  if (useDocs.getState().tabs.length >= MAX_TABS) {
    ed.showError(`${MAX_TABS} models are open: close one first.`)
    return false
  }
  addTab(fresh(model))
  return true
}

function addTab(next: Parked) {
  const { tabs, active, parked } = useDocs.getState()
  const id = newId()
  const at = tabs.findIndex((t) => t.id === active) + 1
  useDocs.setState({ tabs: [...tabs.slice(0, at), { id }, ...tabs.slice(at)], active: id, parked: { ...parked, [active]: park() } })
  show(next)
}

export function newModel(): boolean {
  return openModel(emptyModel())
}

export function switchTo(id: string) {
  const { active, parked } = useDocs.getState()
  const target = parked[id]
  if (id === active || !target || locked()) return
  const { [id]: _taken, ...rest } = parked
  useDocs.setState({ active: id, parked: { ...rest, [active]: park() } })
  show(target)
}

/** Closes a tab. The last one left becomes an empty model (Reopen brings the closed one back). */
export function closeTab(id: string) {
  const { tabs, active, parked, closed } = useDocs.getState()
  if (locked()) return
  const i = tabs.findIndex((t) => t.id === id)
  if (i < 0) return
  if (tabs.length === 1) {
    useDocs.setState({ closed: [...closed, park()].slice(-CLOSED_KEPT) })
    show(fresh(emptyModel()))
    return
  }
  const rest = tabs.filter((t) => t.id !== id)
  if (id !== active) {
    const { [id]: gone, ...others } = parked
    useDocs.setState({ tabs: rest, parked: others, closed: [...closed, gone].slice(-CLOSED_KEPT) })
    return
  }
  const nextId = (rest[i] ?? rest[i - 1]).id
  const { [nextId]: next, ...others } = parked
  useDocs.setState({ tabs: rest, active: nextId, parked: others, closed: [...closed, park()].slice(-CLOSED_KEPT) })
  show(next)
}

export function reopenClosed(): boolean {
  const { closed } = useDocs.getState()
  const last = closed.at(-1)
  if (!last || locked()) return false
  // An empty untouched canvas takes the model back without a tab of its own.
  if (untouched()) {
    useDocs.setState({ closed: closed.slice(0, -1) })
    show(last)
    return true
  }
  if (useDocs.getState().tabs.length >= MAX_TABS) {
    useEditor.getState().showError(`${MAX_TABS} models are open: close one first.`)
    return false
  }
  useDocs.setState({ closed: closed.slice(0, -1) })
  addTab(last)
  return true
}

// ---------------------------------------------------------------- the parked models in the browser

function saveDocs() {
  try {
    const { tabs, active, parked } = useDocs.getState()
    if (tabs.length === 1) {
      localStorage.removeItem(DOCS_KEY)
      return
    }
    const models: Record<string, string> = {}
    for (const [id, p] of Object.entries(parked)) models[id] = serializeModel(p.model, undefined, p.changesBase)
    localStorage.setItem(DOCS_KEY, JSON.stringify({ tabs: tabs.map((t) => t.id), active, parked: models }))
  } catch {
    // Storage full or unavailable: the open model is still saved by the editor, and Save keeps a file.
  }
}

// A parked model is saved when it is parked; edits of the active one go through the editor's autosave.
useDocs.subscribe((s, prev) => {
  if (typeof localStorage === 'undefined') return
  if (s.tabs !== prev.tabs || s.active !== prev.active || s.parked !== prev.parked) saveDocs()
})

// ---------------------------------------------------------------- the Save-as files across a reload
// The handle of every tab's file is kept in IndexedDB under the tab id (the active tab's too) and given back
// after a reload; the first Save then asks the browser for permission again (savedFile.ts ensureWritable).
onSavedFileChange((file) => {
  const id = useDocs.getState().active
  void (file ? putHandle(id, file) : deleteHandle(id))
})
useDocs.subscribe((s, prev) => {
  // A tab that is gone (closed, or the whole set replaced) takes its handle with it.
  for (const t of prev.tabs) if (!s.tabs.some((x) => x.id === t.id)) void deleteHandle(t.id)
})

async function restoreFiles() {
  if (typeof indexedDB === 'undefined') return
  const { tabs, active } = useDocs.getState()
  for (const { id } of tabs) {
    const file = await getHandle(id)
    if (!file) continue
    if (id === active) setSavedFile(file)
    else if (useDocs.getState().parked[id]) useDocs.setState((s) => ({ parked: { ...s.parked, [id]: { ...s.parked[id], file } } }))
  }
}
void restoreFiles()
