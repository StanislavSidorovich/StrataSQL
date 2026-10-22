// Several models open at once: tabs park and restore a model with its own undo history, nothing leaks between them.
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyModel, type Model } from '../src/core/metamodel'
import { addEntity, renameModel } from '../src/core/ops'
import { closeTab, locked, MAX_TABS, newModel, openModel, reopenClosed, switchTo, useDocs } from '../src/ui/docs'
import { bindSavedFile, savedFileFor, type SavedFile } from '../src/ui/savedFile'
import { useEditor } from '../src/ui/store'

const drawn = (name: string): Model => {
  const m = emptyModel(name)
  addEntity(m, { name: 'Thing' })
  return m
}
const file = (name: string): SavedFile => ({ name, createWritable: async () => ({ write: async () => {}, close: async () => {} }) })
const idsOf = () => useDocs.getState().tabs.map((t) => t.id)
const names = () => useDocs.getState().tabs.map((t) => (t.id === useDocs.getState().active ? useEditor.getState().model.name : useDocs.getState().parked[t.id].model.name))

beforeEach(() => {
  useDocs.setState({ tabs: [{ id: 't0' }], active: 't0', parked: {}, closed: [] })
  useEditor.setState({ model: emptyModel('Start'), past: [], future: [], selection: null, trainerBackup: null, changesBase: null, view: 'cdm', doc: 0 })
})

describe('tabs', () => {
  it('reuses an empty untouched tab for the first model', () => {
    openModel(drawn('A'))
    expect(useDocs.getState().tabs).toHaveLength(1)
    expect(useEditor.getState().model.name).toBe('A')
  })

  it('opens the next model beside the first, which stays open', () => {
    openModel(drawn('A'))
    openModel(drawn('B'))
    expect(names()).toEqual(['A', 'B'])
    expect(useEditor.getState().model.name).toBe('B')
  })

  it('keeps each model own undo history, view and comparison', () => {
    openModel(drawn('A'))
    const loaded = useEditor.getState().past.length
    useEditor.getState().apply((m) => renameModel(m, 'A2'))
    useEditor.getState().setView('pdm')
    useEditor.getState().setChangesBase(emptyModel('old'))
    openModel(drawn('B'))
    expect(useEditor.getState().past).toHaveLength(0)
    expect(useEditor.getState().changesBase).toBeNull()
    switchTo(idsOf()[0])
    expect(useEditor.getState().model.name).toBe('A2')
    expect(useEditor.getState().past).toHaveLength(loaded + 1)
    expect(useEditor.getState().view).toBe('pdm')
    expect(useEditor.getState().changesBase?.name).toBe('old')
    useEditor.getState().undo()
    expect(useEditor.getState().model.name).toBe('A')
    switchTo(idsOf()[1])
    expect(useEditor.getState().model.name).toBe('B')
    expect(useEditor.getState().future).toHaveLength(0)
  })

  it('gives every model its own Save-as file', () => {
    openModel(drawn('A'))
    bindSavedFile(file('a.json'), useEditor.getState().doc)
    openModel(drawn('B'))
    expect(savedFileFor(useEditor.getState().doc)).toBeNull()
    bindSavedFile(file('b.json'), useEditor.getState().doc)
    switchTo(idsOf()[0])
    expect(savedFileFor(useEditor.getState().doc)?.name).toBe('a.json')
    switchTo(idsOf()[1])
    expect(savedFileFor(useEditor.getState().doc)?.name).toBe('b.json')
  })

  it('stops at MAX_TABS and says so', () => {
    for (let i = 0; i < MAX_TABS; i++) expect(openModel(drawn(`M${i}`))).toBe(true)
    expect(useDocs.getState().tabs).toHaveLength(MAX_TABS)
    expect(openModel(drawn('one more'))).toBe(false)
    expect(useEditor.getState().error).toMatch(/close one first/)
  })

  it('New opens an empty model in a new tab', () => {
    openModel(drawn('A'))
    newModel()
    expect(useDocs.getState().tabs).toHaveLength(2)
    expect(useEditor.getState().model.entities).toHaveLength(0)
  })

  it('closing the active tab shows its neighbour; Reopen brings it back, newest first', () => {
    openModel(drawn('A'))
    openModel(drawn('B'))
    openModel(drawn('C'))
    closeTab(useDocs.getState().active)
    expect(names()).toEqual(['A', 'B'])
    expect(useEditor.getState().model.name).toBe('B')
    closeTab(idsOf()[0])
    expect(names()).toEqual(['B'])
    expect(reopenClosed()).toBe(true)
    expect(names()).toEqual(['B', 'A'])
    expect(reopenClosed()).toBe(true)
    expect(names()).toEqual(['B', 'A', 'C'])
    expect(reopenClosed()).toBe(false)
  })

  it('closing the last tab leaves an empty model and Reopen takes the old one back into it', () => {
    openModel(drawn('A'))
    closeTab(useDocs.getState().active)
    expect(useDocs.getState().tabs).toHaveLength(1)
    expect(useEditor.getState().model.entities).toHaveLength(0)
    reopenClosed()
    expect(useDocs.getState().tabs).toHaveLength(1)
    expect(useEditor.getState().model.name).toBe('A')
  })

  it('remembers only the last 5 closed models', () => {
    for (let i = 0; i < 8; i++) openModel(drawn(`M${i}`))
    for (let i = 0; i < 7; i++) closeTab(idsOf()[0])
    expect(useDocs.getState().closed).toHaveLength(5)
  })

  it('waits while a trainer task, lesson or story has the canvas', () => {
    openModel(drawn('A'))
    openModel(drawn('B'))
    const [a] = idsOf()
    useEditor.setState({ trainerBackup: drawn('B') })
    expect(locked()).toBe(true)
    switchTo(a)
    closeTab(a)
    expect(useDocs.getState().active).not.toBe(a)
    expect(useDocs.getState().tabs).toHaveLength(2)
    // A model opened meanwhile goes to the canvas of the task, not to a tab.
    openModel(drawn('X'))
    expect(useDocs.getState().tabs).toHaveLength(2)
  })

  it('keeps the parked models in the browser, the active one with the editor autosave', () => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    try {
      openModel(drawn('A'))
      openModel(drawn('B'))
      const saved = JSON.parse(store.get('stratasql.docs')!)
      expect(saved.tabs).toEqual(idsOf())
      expect(Object.keys(saved.parked)).toEqual([idsOf()[0]])
      closeTab(idsOf()[0])
      expect(store.has('stratasql.docs')).toBe(false)
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })
})
