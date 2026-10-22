// The file chosen with “Save as” and the document (store.doc) it belongs to. Kept apart from fileSave.ts
// so the tabs (docs.ts) can park and restore it without pulling in the export code.
import { useEditor } from './store'

export interface SavedFile {
  name: string
  createWritable: () => Promise<{ write: (data: string | Blob) => Promise<void>; close: () => Promise<void> }>
}

let current: { file: SavedFile; doc: number } | null = null

/** The Save-as file of the document now on the canvas, if any. */
export function savedFileFor(doc: number): SavedFile | null {
  return current && current.doc === doc ? current.file : null
}

/** Binds a Save-as file to the document `doc`. */
export function bindSavedFile(file: SavedFile, doc: number) {
  current = { file, doc }
}

/** The Save-as file of the process on the canvas (null if none): taken when its tab is parked. */
export const takeSavedFile = (): SavedFile | null => savedFileFor(useEditor.getState().doc)

/** Gives the model now on the canvas its Save-as file back (or none). */
export function setSavedFile(file: SavedFile | null) {
  current = file ? { file, doc: useEditor.getState().doc } : null
}
