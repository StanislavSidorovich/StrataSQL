// Saving the model to a file. “Save as” lets the user pick the folder and name (File System Access API,
// Chrome and Edge); after that, “Save” writes to the same file until another model is loaded.
// Browsers without the API download the file instead (to the downloads folder, or wherever the browser asks).

import { FILE_EXTENSION, serializeModel } from '../core/serialize'
import { fileBaseName } from './pdm/SqlView'
import { useEditor } from './store'

interface WritableFile {
  name: string
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}
type SavePicker = (opts: object) => Promise<WritableFile>

const picker = (): SavePicker | undefined => (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

/** The file chosen with “Save as”, and the document it belongs to. */
let current: { file: WritableFile; doc: number } | null = null

export const canPickFolder = () => picker() !== undefined

function download(): string {
  const { model } = useEditor.getState()
  const name = `${fileBaseName(model.name)}${FILE_EXTENSION}`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([serializeModel(model)], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return name
}

async function write(file: WritableFile) {
  const out = await file.createWritable()
  await out.write(serializeModel(useEditor.getState().model))
  await out.close()
}

/** Save: to the “Save as” file of this document if there is one, else a download. Returns a message for the user. */
export async function saveModel(): Promise<string | null> {
  const { doc, trainerBackup } = useEditor.getState()
  if (current && current.doc === doc && !trainerBackup) {
    await write(current.file)
    return `Saved to ${current.file.name}`
  }
  download()
  return null
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
  if (!useEditor.getState().trainerBackup) current = { file, doc }
  return `Saved to ${file.name}. Ctrl+S now saves to this file.`
}
