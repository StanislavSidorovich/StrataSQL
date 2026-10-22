// File handles survive a reload only in IndexedDB (they cannot go to localStorage). One handle per tab id.
import type { SavedFile } from './savedFile'

const DB = 'stratasql.files'
const STORE = 'handles'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined // no IndexedDB (private mode, old browser): the file is simply forgotten after a reload
  }
}

export const putHandle = (id: string, file: SavedFile) => run('readwrite', (s) => s.put(file, id))
export const deleteHandle = (id: string) => run('readwrite', (s) => s.delete(id))
export const getHandle = (id: string) => run<SavedFile | undefined>('readonly', (s) => s.get(id) as IDBRequest<SavedFile | undefined>)
