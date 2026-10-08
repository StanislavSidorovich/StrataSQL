// Saving the model to a file. “Save as” lets the user pick the folder and name (File System Access API,
// Chrome and Edge); after that, “Save” writes to the same file until another model is loaded. A trainer
// task is a document of its own (`doc` changes when it starts and ends), so its file never receives the
// student's own model, and the other way round.
// Browsers without the API download the file instead (to the downloads folder, or wherever the browser asks).

import { exportPowerDesigner } from '../core/export/powerdesigner'
import { exportPowerDesignerPdm } from '../core/export/powerdesigner-pdm'
import { FILE_EXTENSION, serializeModel, type SavedTask } from '../core/serialize'
import { fileBaseName } from './pdm/SqlView'
import { useEditor } from './store'
import { useTrainer } from './trainer/trainerStore'

interface WritableFile {
  name: string
  createWritable: () => Promise<{ write: (data: string | Blob) => Promise<void>; close: () => Promise<void> }>
}
type SavePicker = (opts: object) => Promise<WritableFile>

/** The running trainer task (not a walkthrough), saved with the model so opening the file can continue it. */
function currentTask(): SavedTask | undefined {
  const s = useTrainer.getState().session
  return s && s.walk === undefined ? { id: s.caseId, level: s.level } : undefined
}

const picker = (): SavePicker | undefined => (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

/** The file chosen with “Save as”, and the document it belongs to. */
let current: { file: WritableFile; doc: number } | null = null

export const canPickFolder = () => picker() !== undefined

function download(): string {
  const { model } = useEditor.getState()
  const name = `${fileBaseName(model.name)}${FILE_EXTENSION}`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([serializeModel(model, currentTask())], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return name
}

async function write(file: WritableFile) {
  const out = await file.createWritable()
  await out.write(serializeModel(useEditor.getState().model, currentTask()))
  await out.close()
}

/** Save: to the “Save as” file of this document if there is one, else a download. Returns a message for the user. */
export async function saveModel(): Promise<string | null> {
  const { doc } = useEditor.getState()
  if (current && current.doc === doc) {
    await write(current.file)
    return `Saved to ${current.file.name}`
  }
  const name = download()
  return canPickFolder() ? `Downloaded ${name}. Use File → Save as to pick a folder: Ctrl+S then saves there.` : null
}

/** Save as: pick a folder and a name. Returns a message for the user, or null when cancelled. */
export async function saveModelAs(): Promise<string | null> {
  const show = picker()
  if (!show) {
    const name = download()
    return `Saved as ${name} in your downloads folder. To choose the folder, use Chrome or Edge, or turn on “Ask where to save each file” in your browser’s settings.`
  }
  const { model, doc } = useEditor.getState()
  let file: WritableFile
  try {
    file = await show({
      suggestedName: `${fileBaseName(model.name)}${FILE_EXTENSION}`,
      types: [{ description: 'StrataSQL model', accept: { 'application/json': [FILE_EXTENSION, '.json'] } }],
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
  await write(file)
  current = { file, doc }
  return `Saved to ${file.name}. Ctrl+S now saves to this file.`
}

/** File kinds for exports: what the save dialog shows and filters on. */
export const FILE_KINDS = {
  cdm: { description: 'PowerDesigner conceptual model', accept: { 'application/xml': ['.cdm'] } },
  pdm: { description: 'PowerDesigner physical model', accept: { 'application/xml': ['.pdm'] } },
  sql: { description: 'SQL script', accept: { 'text/plain': ['.sql'] } },
  png: { description: 'PNG image', accept: { 'image/png': ['.png'] } },
  svg: { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } },
} as const

/**
 * Saves an exported file where the user chooses (Chrome, Edge), else as a download. The dialog opens
 * first and the content is made after it: a slow `make` (an image) would otherwise lose the click
 * the browser requires for the dialog. Returns the file name, or null when the user cancelled.
 */
export async function saveExport(name: string, kind: keyof typeof FILE_KINDS, make: () => Blob | Promise<Blob>): Promise<string | null> {
  const show = picker()
  if (!show) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await make())
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return name
  }
  let file: WritableFile
  try {
    file = await show({ suggestedName: name, types: [FILE_KINDS[kind]] })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
  const out = await file.createWritable()
  await out.write(await make())
  await out.close()
  return file.name
}

/** Export for PowerDesigner: a .cdm (XML). Returns a message for the user, with what PD cannot hold. */
export async function exportCdm(): Promise<string | null> {
  const { model } = useEditor.getState()
  const { xml, warnings } = exportPowerDesigner(model)
  const name = await saveExport(`${fileBaseName(model.name)}.cdm`, 'cdm', () => new Blob([xml], { type: 'application/xml' }))
  if (!name) return null
  return `Exported ${name} — open it in PowerDesigner (File → Open).` + (warnings.length ? `\n${warnings.join('\n')}` : '')
}

/** Export the generated tables for PowerDesigner: a .pdm (XML) for SQL Server 2008. */
export async function exportPdm(): Promise<string | null> {
  const { model } = useEditor.getState()
  const { xml, warnings } = exportPowerDesignerPdm(model)
  const name = await saveExport(`${fileBaseName(model.name)}.pdm`, 'pdm', () => new Blob([xml], { type: 'application/xml' }))
  if (!name) return null
  return `Exported ${name} — open it in PowerDesigner (File → Open).` + (warnings.length ? `\n${warnings.join('\n')}` : '')
}
