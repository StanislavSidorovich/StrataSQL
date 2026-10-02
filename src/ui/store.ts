import { produce } from 'immer'
import { useMemo } from 'react'
import { create } from 'zustand'
import { generatePdm } from '../core/cdm2pdm'
import { emptyModel, type Id, type Model } from '../core/metamodel'
import { ModelError } from '../core/ops'
import type { Pdm } from '../core/pdm'
import { ModelFormatError, parseModel, serializeModel } from '../core/serialize'

export type Selection =
  | { kind: 'entity'; id: Id }
  | { kind: 'relationship'; id: Id }
  | { kind: 'inheritance'; id: Id }
  | null

export type LinkKind = 'relationship' | 'inheritance'

/** Conceptual model editor, generated physical model, generated SQL, SQL sandbox. */
export type View = 'cdm' | 'pdm' | 'sql' | 'sandbox'

const HISTORY_LIMIT = 200
const COALESCE_MS = 1000
const STORAGE_KEY = 'stratasql.model'

interface ApplyOptions {
  /** Consecutive edits with the same key within 1 s form one undo step (typing in a field). */
  coalesce?: string
}

interface EditorState {
  model: Model
  past: Model[]
  future: Model[]
  selection: Selection
  linkKind: LinkKind
  view: View
  /** Selected table in the PDM view (by name). */
  tableSelection: string | null
  error: string | null
  lastEdit: { key: string; at: number } | null

  /** Runs an edit operation on a draft; on ModelError the model is untouched and the message is shown. */
  apply: (edit: (m: Model) => void, opts?: ApplyOptions) => boolean
  undo: () => void
  redo: () => void
  load: (model: Model) => void
  select: (selection: Selection) => void
  setLinkKind: (kind: LinkKind) => void
  setView: (view: View) => void
  selectTable: (name: string | null) => void
  showError: (message: string | null) => void
}

export const useEditor = create<EditorState>()((set, get) => ({
  model: loadStoredModel() ?? emptyModel(),
  past: [],
  future: [],
  selection: null,
  linkKind: 'relationship',
  view: 'cdm',
  tableSelection: null,
  error: null,
  lastEdit: null,

  apply(edit, opts = {}) {
    const { model, past, lastEdit } = get()
    let next: Model
    try {
      next = produce(model, (draft) => {
        edit(draft) // ops may return the created element; immer must not see it
      })
    } catch (e) {
      if (e instanceof ModelError) {
        set({ error: e.message })
        return false
      }
      throw e
    }
    if (next === model) return true
    const now = Date.now()
    const merge = opts.coalesce !== undefined && lastEdit?.key === opts.coalesce && now - lastEdit.at < COALESCE_MS
    set({
      model: next,
      past: merge ? past : [...past, model].slice(-HISTORY_LIMIT),
      future: [],
      error: null,
      lastEdit: opts.coalesce !== undefined ? { key: opts.coalesce, at: now } : null,
      selection: validSelection(next, get().selection),
    })
    return true
  },

  undo() {
    const { past, model, future, selection } = get()
    const prev = past.at(-1)
    if (!prev) return
    set({
      model: prev,
      past: past.slice(0, -1),
      future: [model, ...future],
      lastEdit: null,
      selection: validSelection(prev, selection),
    })
  },

  redo() {
    const { past, model, future, selection } = get()
    const next = future[0]
    if (!next) return
    set({
      model: next,
      past: [...past, model],
      future: future.slice(1),
      lastEdit: null,
      selection: validSelection(next, selection),
    })
  },

  load(model) {
    const { model: current, past } = get()
    set({
      model,
      past: [...past, current].slice(-HISTORY_LIMIT),
      future: [],
      selection: null,
      tableSelection: null,
      lastEdit: null,
      error: null,
    })
  },

  select: (selection) => set({ selection }),
  setLinkKind: (linkKind) => set({ linkKind }),
  setView: (view) => set({ view }),
  selectTable: (tableSelection) => set({ tableSelection }),
  showError: (error) => set({ error }),
}))

function validSelection(m: Model, s: Selection): Selection {
  if (!s) return null
  const list = s.kind === 'entity' ? m.entities : s.kind === 'relationship' ? m.relationships : m.inheritances
  return list.some((x) => x.id === s.id) ? s : null
}

// ---------------------------------------------------------------- persistence (localStorage)

function loadStoredModel(): Model | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return text ? parseModel(text) : null
  } catch (e) {
    if (e instanceof ModelFormatError) console.warn('Ignoring stored model:', e.message)
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
useEditor.subscribe((state, prev) => {
  if (state.model === prev.model) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeModel(useEditor.getState().model))
    } catch {
      // Storage full or unavailable: the file save still works.
    }
  }, 300)
})

/** Shortcut for components: the current model. */
export function useModel(): Model {
  return useEditor((s) => s.model)
}

/** The PDM generated from the current model (recomputed only when the model changes). */
export function usePdm(): Pdm {
  const model = useModel()
  return useMemo(() => generatePdm(model), [model])
}
