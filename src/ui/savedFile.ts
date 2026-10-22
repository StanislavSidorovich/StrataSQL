// The file chosen with “Save as” and the document (store.doc) it belongs to. Kept apart from fileSave.ts
// so the tabs (docs.ts) can park and restore it without pulling in the export code.
import { useEditor } from './store'

export interface SavedFile {
  name: string
  createWritable: () => Promise<{ write: (data: string | Blob) => Promise<void>; close: () => Promise<void> }>
  /** File System Access permission calls (Chrome, Edge); after a reload a stored handle is in the “prompt” state. */
  queryPermission?: (opts: { mode: 'readwrite' }) => Promise<string>
  requestPermission?: (opts: { mode: 'readwrite' }) => Promise<string>
}

/**
 * Can the file be written now? A handle restored after a reload must ask again, and the ask needs the
 * user's click: call this first thing in a Save handler. False: refused, so the caller asks for a new file.
 */
export async function ensureWritable(file: SavedFile): Promise<boolean> {
  try {
    if (!file.queryPermission) return true
    if ((await file.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    return (await file.requestPermission?.({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

type Listener = (file: SavedFile | null) => void
const listeners: Listener[] = []
/** Told whenever the file of the document on the canvas changes (docs.ts keeps it in the browser). */
export function onSavedFileChange(fn: Listener) {
  listeners.push(fn)
}
const changed = (file: SavedFile | null) => listeners.forEach((fn) => fn(file))

let current: { file: SavedFile; doc: number } | null = null

/** The Save-as file of the document now on the canvas, if any. */
export function savedFileFor(doc: number): SavedFile | null {
  return current && current.doc === doc ? current.file : null
}

/** Binds a Save-as file to the document `doc`. */
export function bindSavedFile(file: SavedFile, doc: number) {
  current = { file, doc }
  changed(file)
}

/** The Save-as file of the process on the canvas (null if none): taken when its tab is parked. */
export const takeSavedFile = (): SavedFile | null => savedFileFor(useEditor.getState().doc)

/** Gives the model now on the canvas its Save-as file back (or none). */
export function setSavedFile(file: SavedFile | null) {
  current = file ? { file, doc: useEditor.getState().doc } : null
  changed(file)
}
