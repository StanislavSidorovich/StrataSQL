import { describe, expect, it } from 'vitest'
import { emptyModel } from '../src/core/metamodel'
import { addAttribute, addEntity, addInheritance, addRelationship } from '../src/core/ops'
import { ModelFormatError, integrityProblems, parseModel, readSavedTask, serializeModel } from '../src/core/serialize'

function small() {
  const m = emptyModel('Small')
  const a = addEntity(m, { name: 'A' })
  const b = addEntity(m, { name: 'B' })
  addAttribute(m, a.id, { name: 'a_id', dataType: 'Integer', primary: true })
  addRelationship(m, a.id, b.id, { dependentSide: 'B' })
  addInheritance(m, a.id, [addEntity(m, { name: 'C' }).id])
  return m
}

describe('serialization', () => {
  it('round-trips a model', () => {
    const m = small()
    expect(parseModel(serializeModel(m))).toEqual(JSON.parse(serializeModel(m)))
  })

  it('rejects non-JSON, foreign formats and unknown versions', () => {
    expect(() => parseModel('{oops')).toThrow(ModelFormatError)
    expect(() => parseModel({ format: 'other' })).toThrow(/Not a StrataSQL model/)
    expect(() => parseModel({ ...emptyModel(), version: 99 })).toThrow(/version/)
  })

  it('rejects bad field types with a path to the field', () => {
    const raw = JSON.parse(serializeModel(small()))
    raw.relationships[0].cardinalityA.max = 3
    expect(() => parseModel(raw)).toThrow(/relationships\[0\]\.cardinalityA\.max/)
  })

  it('rejects dangling references', () => {
    const raw = JSON.parse(serializeModel(small()))
    raw.relationships[0].entityB = 'nope'
    expect(() => parseModel(raw)).toThrow(/unknown entity nope/)
  })

  it('detects inheritance cycles and double parents', () => {
    const m = emptyModel()
    const a = addEntity(m)
    const b = addEntity(m)
    m.inheritances.push(
      { id: 'i1', name: 'i1', parentId: a.id, childIds: [b.id], mutuallyExclusive: true, complete: true, generation: 'both', position: { x: 0, y: 0 } },
      { id: 'i2', name: 'i2', parentId: b.id, childIds: [a.id], mutuallyExclusive: true, complete: true, generation: 'both', position: { x: 0, y: 0 } },
    )
    expect(integrityProblems(m).some((p) => p.includes('cycle'))).toBe(true)
  })
})

describe('the trainer task saved with a model', () => {
  it('is written last, read back, and does not change the model', () => {
    const m = emptyModel('Hotel — my model')
    addEntity(m, { name: 'Guest' })
    const text = serializeModel(m, { id: 'hotel', level: 3 })
    expect(readSavedTask(text)).toEqual({ id: 'hotel', level: 3 })
    expect(text.trimEnd().endsWith('"task": {\n    "id": "hotel",\n    "level": 3\n  }\n}')).toBe(true)
    expect(serializeModel(parseModel(text))).toBe(serializeModel(m))
  })

  it('is absent from a plain model file, and a broken one is ignored', () => {
    const m = emptyModel('x')
    expect(readSavedTask(serializeModel(m))).toBeNull()
    expect(readSavedTask(serializeModel(m).replace(/\}\s*$/, ', "task": { "id": 5 } }'))).toBeNull()
    expect(readSavedTask('not json')).toBeNull()
  })
})
