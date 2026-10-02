import { describe, expect, it } from 'vitest'
import { CARD, emptyModel, primaryIdentifier } from '../src/core/metamodel'
import {
  ModelError,
  addAttribute,
  addDomain,
  addEntity,
  addIdentifier,
  addInheritance,
  addInheritanceChild,
  addRelationship,
  ancestorsOf,
  linkInheritance,
  moveAttribute,
  removeAttribute,
  removeDomain,
  removeEntity,
  removeInheritanceChild,
  setAttributeInPrimary,
  setDependentSide,
  setPrimaryIdentifier,
  swapRelationshipSides,
  toAttributeCode,
  toEntityCode,
  uniqueName,
  updateAttribute,
  updateDomain,
  updateEntity,
  updateRelationship,
} from '../src/core/ops'

describe('codes and names', () => {
  it('converts names to PD-like codes', () => {
    expect(toEntityCode('TV Show')).toBe('TV_SHOW')
    expect(toEntityCode('TVShow')).toBe('TVSHOW')
    expect(toAttributeCode('Release Year')).toBe('release_year')
    expect(toAttributeCode('  e-mail ')).toBe('e_mail')
  })

  it('makes names unique case-insensitively', () => {
    expect(uniqueName('Entity', ['entity', 'Entity_2'])).toBe('Entity_3')
    expect(uniqueName('Car', ['Driver'])).toBe('Car')
  })
})

describe('entities', () => {
  it('adds entities with unique names and derived codes', () => {
    const m = emptyModel()
    const a = addEntity(m, { name: 'Car Shift' })
    const b = addEntity(m, { name: 'car shift' })
    expect(a.code).toBe('CAR_SHIFT')
    expect(b.name).toBe('car shift_2')
  })

  it('keeps the code in sync on rename until the code is customised', () => {
    const m = emptyModel()
    const e = addEntity(m, { name: 'Trip' })
    updateEntity(m, e.id, { name: 'Ride' })
    expect(e.code).toBe('RIDE')
    updateEntity(m, e.id, { code: 'T_RIDE' })
    updateEntity(m, e.id, { name: 'Journey' })
    expect(e.code).toBe('T_RIDE')
  })

  it('removing an entity removes its relationships and inheritance links', () => {
    const m = emptyModel()
    const p = addEntity(m, { name: 'Person' })
    const a = addEntity(m, { name: 'Actor' })
    const d = addEntity(m, { name: 'Director' })
    const s = addEntity(m, { name: 'Scene' })
    addRelationship(m, a.id, s.id)
    addInheritance(m, p.id, [a.id, d.id])
    removeEntity(m, a.id)
    expect(m.relationships).toHaveLength(0)
    expect(m.inheritances[0].childIds).toEqual([d.id])
    removeEntity(m, p.id)
    expect(m.inheritances).toHaveLength(0)
  })
})

describe('attributes and identifiers', () => {
  it('putting an attribute in the primary identifier creates it and makes the attribute mandatory', () => {
    const m = emptyModel()
    const e = addEntity(m, { name: 'Car' })
    const id = addAttribute(m, e.id, { name: 'car_id', dataType: 'Integer' })
    expect(id.mandatory).toBe(false)
    setAttributeInPrimary(m, e.id, id.id, true)
    expect(primaryIdentifier(e)?.attributeIds).toEqual([id.id])
    expect(id.mandatory).toBe(true)
  })

  it('removing the last attribute of the primary identifier drops the identifier', () => {
    const m = emptyModel()
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'x', primary: true })
    setAttributeInPrimary(m, e.id, a.id, false)
    expect(e.identifiers).toHaveLength(0)
  })

  it('refuses to make a primary-identifier attribute optional', () => {
    const m = emptyModel()
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'x', primary: true })
    expect(() => updateAttribute(m, e.id, a.id, { mandatory: false })).toThrow(ModelError)
  })

  it('supports one primary and several alternate identifiers', () => {
    const m = emptyModel()
    const e = addEntity(m, { name: 'Car' })
    const id = addAttribute(m, e.id, { name: 'car_id', primary: true })
    const plate = addAttribute(m, e.id, { name: 'plate' })
    const ak = addIdentifier(m, e.id, { name: 'AK_plate', attributeIds: [plate.id] })
    expect(ak.isPrimary).toBe(false)
    expect(plate.mandatory).toBe(false)
    setPrimaryIdentifier(m, e.id, ak.id)
    expect(e.identifiers.filter((i) => i.isPrimary).map((i) => i.id)).toEqual([ak.id])
    expect(plate.mandatory).toBe(true)
    expect(id.mandatory).toBe(true)
  })

  it('removing an attribute removes it from identifiers', () => {
    const m = emptyModel()
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'a', primary: true })
    const b = addAttribute(m, e.id, { name: 'b', primary: true })
    removeAttribute(m, e.id, a.id)
    expect(primaryIdentifier(e)?.attributeIds).toEqual([b.id])
  })

  it('reorders attributes within bounds', () => {
    const m = emptyModel()
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'a' })
    const b = addAttribute(m, e.id, { name: 'b' })
    moveAttribute(m, e.id, b.id, -5)
    expect(e.attributes.map((x) => x.id)).toEqual([b.id, a.id])
  })
})

describe('domains', () => {
  it('attributes take their type from the domain and follow its changes', () => {
    const m = emptyModel()
    const d = addDomain(m, { name: 'Email', length: 100 })
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'email', domainId: d.id })
    expect(a.length).toBe(100)
    updateDomain(m, d.id, { length: 254 })
    expect(a.length).toBe(254)
    removeDomain(m, d.id)
    expect(a.domainId).toBeUndefined()
    expect(a.length).toBe(254)
  })

  it('choosing an explicit type detaches the attribute from its domain', () => {
    const m = emptyModel()
    const d = addDomain(m, { name: 'Phone', length: 20 })
    const e = addEntity(m)
    const a = addAttribute(m, e.id, { name: 'phone', domainId: d.id })
    updateAttribute(m, e.id, a.id, { dataType: 'Characters' })
    expect(a.domainId).toBeUndefined()
  })
})

describe('relationships', () => {
  it('defaults to one A — many B', () => {
    const m = emptyModel()
    const show = addEntity(m, { name: 'TVShow' })
    const ep = addEntity(m, { name: 'Episode' })
    const r = addRelationship(m, show.id, ep.id)
    expect(r.cardinalityA).toEqual(CARD.oneOne)
    expect(r.cardinalityB).toEqual(CARD.zeroMany)
    expect(r.dependentSide).toBeNull()
  })

  it('making a side dependent forces the parent end to 1,1', () => {
    const m = emptyModel()
    const ep = addEntity(m, { name: 'Episode' })
    const sc = addEntity(m, { name: 'Scene' })
    const r = addRelationship(m, ep.id, sc.id, { cardinalityA: CARD.zeroOne })
    setDependentSide(m, r.id, 'B')
    expect(r.cardinalityA).toEqual(CARD.oneOne)
  })

  it('relaxing the parent end cardinality cancels the dependency', () => {
    const m = emptyModel()
    const ep = addEntity(m)
    const sc = addEntity(m)
    const r = addRelationship(m, ep.id, sc.id, { dependentSide: 'B' })
    updateRelationship(m, r.id, { cardinalityA: CARD.zeroOne })
    expect(r.dependentSide).toBeNull()
  })

  it('reflexive relationships are allowed but cannot be dependent', () => {
    const m = emptyModel()
    const p = addEntity(m, { name: 'Employee' })
    const r = addRelationship(m, p.id, p.id, { roleA: 'manager', roleB: 'report' })
    expect(() => setDependentSide(m, r.id, 'B')).toThrow(ModelError)
  })

  it('swapping sides swaps cardinalities, roles and dependency', () => {
    const m = emptyModel()
    const a = addEntity(m)
    const b = addEntity(m)
    const r = addRelationship(m, a.id, b.id, { roleA: 'ra', dependentSide: 'B' })
    swapRelationshipSides(m, r.id)
    expect(r.entityA).toBe(b.id)
    expect(r.cardinalityB).toEqual(CARD.oneOne)
    expect(r.roleB).toBe('ra')
    expect(r.dependentSide).toBe('A')
  })
})

describe('inheritance', () => {
  it('refuses self-inheritance, double parents and cycles', () => {
    const m = emptyModel()
    const p = addEntity(m, { name: 'Person' })
    const a = addEntity(m, { name: 'Actor' })
    const x = addEntity(m, { name: 'Other' })
    expect(() => addInheritance(m, p.id, [p.id])).toThrow(ModelError)
    const inh = addInheritance(m, p.id, [a.id])
    expect(() => addInheritance(m, x.id, [a.id])).toThrow(/already inherits/)
    expect(() => addInheritance(m, a.id, [p.id])).toThrow(/cycle/)
    expect(() => addInheritanceChild(m, inh.id, a.id)).toThrow(ModelError)
  })

  it('linkInheritance reuses the parent inheritance', () => {
    const m = emptyModel()
    const p = addEntity(m, { name: 'Person' })
    const a = addEntity(m, { name: 'Actor' })
    const d = addEntity(m, { name: 'Director' })
    const first = linkInheritance(m, a.id, p.id)
    const second = linkInheritance(m, d.id, p.id)
    expect(second.id).toBe(first.id)
    expect(m.inheritances).toHaveLength(1)
    expect(first.generation).toBe('both')
    expect(ancestorsOf(m, d.id)).toEqual([p.id])
  })

  it('removing the last child removes the inheritance', () => {
    const m = emptyModel()
    const p = addEntity(m)
    const a = addEntity(m)
    const inh = addInheritance(m, p.id, [a.id])
    removeInheritanceChild(m, inh.id, a.id)
    expect(m.inheritances).toHaveLength(0)
  })
})

describe('relationship ends', () => {
  it('re-pointing a dependent relationship to the same entity on both ends drops the dependency', () => {
    const m = emptyModel()
    const a = addEntity(m)
    const b = addEntity(m)
    const r = addRelationship(m, a.id, b.id, { dependentSide: 'B' })
    updateRelationship(m, r.id, { entityB: a.id })
    expect(r.dependentSide).toBeNull()
    expect(() => updateRelationship(m, r.id, { entityA: 'missing' })).toThrow(ModelError)
  })
})
