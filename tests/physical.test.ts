// Physical choices stored in the CDM: the FK side of a one-to-one, AKs over PDM columns.

import { describe, expect, it } from 'vitest'
import { CARD, emptyModel } from '../src/core/metamodel'
import {
  ModelError,
  addEntity,
  addPhysicalKey,
  addRelationship,
  removePhysicalKey,
  setForeignKeySide,
  swapRelationshipSides,
  togglePhysicalKeyColumn,
  updatePhysicalKey,
  updateRelationship,
} from '../src/core/ops'
import { ModelFormatError, parseModel, serializeModel } from '../src/core/serialize'

function oneToOne() {
  const m = emptyModel()
  const a = addEntity(m, { name: 'Person' })
  const b = addEntity(m, { name: 'Passport' })
  const r = addRelationship(m, a.id, b.id, { cardinalityB: CARD.zeroOne })
  return { m, a, b, r }
}

describe('FK side of a one-to-one', () => {
  it('is only allowed on one-to-one relationships', () => {
    const { m, r } = oneToOne()
    setForeignKeySide(m, r.id, 'A')
    expect(r.foreignKeySide).toBe('A')
    updateRelationship(m, r.id, { cardinalityB: CARD.zeroMany })
    expect(r.foreignKeySide).toBeUndefined()
    expect(() => setForeignKeySide(m, r.id, 'B')).toThrow(ModelError)
  })

  it('follows a swap of the sides', () => {
    const { m, r, a } = oneToOne()
    setForeignKeySide(m, r.id, 'A')
    swapRelationshipSides(m, r.id)
    expect(r.foreignKeySide).toBe('B')
    expect(r.entityB).toBe(a.id)
  })
})

describe('physical keys', () => {
  it('are added, edited and removed; an entity without keys has no field at all', () => {
    const { m, b } = oneToOne()
    const k = addPhysicalKey(m, b.id, { columns: ['person_id', 'person_id'] })
    expect(k).toMatchObject({ name: 'AK1_PASSPORT', columns: ['person_id'] })
    togglePhysicalKeyColumn(m, b.id, k.id, 'passport_no')
    togglePhysicalKeyColumn(m, b.id, k.id, 'person_id')
    expect(k.columns).toEqual(['passport_no'])
    updatePhysicalKey(m, b.id, k.id, { name: 'AK_NO' })
    expect(b.physicalKeys![0].name).toBe('AK_NO')
    removePhysicalKey(m, b.id, k.id)
    expect(b.physicalKeys).toBeUndefined()
  })
})

describe('serialization of physical choices', () => {
  it('round-trips the FK side and the keys', () => {
    const { m, b, r } = oneToOne()
    setForeignKeySide(m, r.id, 'A')
    addPhysicalKey(m, b.id, { name: 'AK_X', columns: ['a', 'b'] })
    const text = serializeModel(m)
    expect(serializeModel(parseModel(text))).toBe(text)
    expect(parseModel(text).entities[1].physicalKeys).toEqual([{ id: b.physicalKeys![0].id, name: 'AK_X', columns: ['a', 'b'] }])
  })

  it('omits empty fields, so older files stay byte-identical', () => {
    const { m } = oneToOne()
    const text = serializeModel(m)
    expect(text).not.toContain('physicalKeys')
    expect(text).not.toContain('foreignKeySide')
    const raw = JSON.parse(text)
    raw.entities[0].physicalKeys = []
    expect(serializeModel(parseModel(raw))).toBe(text)
  })

  it('rejects a bad FK side', () => {
    const raw = JSON.parse(serializeModel(oneToOne().m))
    raw.relationships[0].foreignKeySide = 'C'
    expect(() => parseModel(raw)).toThrow(ModelFormatError)
  })
})
