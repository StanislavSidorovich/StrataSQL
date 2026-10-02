// Stage 1 acceptance: the full TV Shows reference CDM (cases/tv-shows.md §4) can be built with
// the editor operations and survives save → reload unchanged.

import { describe, expect, it } from 'vitest'
import { formatCardinality, primaryIdentifier, type Model } from '../src/core/metamodel'
import { findEntityByName } from '../src/core/ops'
import { integrityProblems, parseModel, serializeModel } from '../src/core/serialize'
import { buildTvShows } from '../src/data/examples/tv-shows'

function entity(m: Model, name: string) {
  const e = findEntityByName(m, name)
  if (!e) throw new Error(`missing entity ${name}`)
  return e
}

function piNames(m: Model, name: string): string[] {
  const e = entity(m, name)
  const pi = primaryIdentifier(e)
  return (pi?.attributeIds ?? []).map((id) => e.attributes.find((a) => a.id === id)!.name)
}

function rel(m: Model, a: string, b: string) {
  const ea = entity(m, a)
  const eb = entity(m, b)
  const r = m.relationships.find((x) => x.entityA === ea.id && x.entityB === eb.id)
  if (!r) throw new Error(`missing relationship ${a} — ${b}`)
  return {
    card: `${formatCardinality(r.cardinalityA)} / ${formatCardinality(r.cardinalityB)}`,
    dependent: r.dependentSide === 'B' ? b : r.dependentSide === 'A' ? a : null,
  }
}

describe('TV Shows reference CDM', () => {
  const m = buildTvShows()

  it('has every entity of the case with its primary identifier', () => {
    expect(m.entities.map((e) => e.name).sort()).toEqual(
      [
        'Actor', 'Director', 'Episode', 'IndoorScene', 'OutdoorScene', 'Person', 'Role', 'Scene',
        'ShowDirector', 'TVShow', 'Technician', 'TechnicianFunction',
      ].sort(),
    )
    expect(piNames(m, 'TVShow')).toEqual(['show_id'])
    expect(piNames(m, 'Episode')).toEqual(['episode_id'])
    expect(piNames(m, 'Scene')).toEqual(['order_no'])
    expect(piNames(m, 'Person')).toEqual(['person_id'])
    expect(piNames(m, 'TechnicianFunction')).toEqual(['function_no'])
    // Intermediate entity without own id and inheritance children without own attributes.
    expect(piNames(m, 'Role')).toEqual([])
    expect(piNames(m, 'ShowDirector')).toEqual([])
    for (const child of ['Actor', 'Technician', 'Director']) expect(entity(m, child).attributes).toHaveLength(0)
  })

  it('has the dependent Scene and the intermediate entities Role and TechnicianFunction', () => {
    expect(rel(m, 'TVShow', 'Episode')).toEqual({ card: '1,1 / 1,n', dependent: null })
    expect(rel(m, 'Episode', 'Scene')).toEqual({ card: '1,1 / 1,n', dependent: 'Scene' })
    expect(rel(m, 'Actor', 'Role')).toEqual({ card: '1,1 / 0,n', dependent: 'Role' })
    expect(rel(m, 'Scene', 'Role')).toEqual({ card: '1,1 / 0,n', dependent: 'Role' })
    expect(rel(m, 'Technician', 'TechnicianFunction')).toEqual({ card: '1,1 / 0,n', dependent: 'TechnicianFunction' })
    expect(rel(m, 'Scene', 'TechnicianFunction')).toEqual({ card: '1,1 / 0,n', dependent: 'TechnicianFunction' })
    expect(rel(m, 'TVShow', 'ShowDirector')).toEqual({ card: '1,1 / 1,n', dependent: 'ShowDirector' })
    expect(rel(m, 'Director', 'ShowDirector')).toEqual({ card: '1,1 / 0,n', dependent: 'ShowDirector' })
  })

  it('has both inheritances', () => {
    const byParent = (name: string) => m.inheritances.find((i) => i.parentId === entity(m, name).id)!
    const scene = byParent('Scene')
    expect(scene.childIds.map((id) => m.entities.find((e) => e.id === id)!.name)).toEqual(['IndoorScene', 'OutdoorScene'])
    expect(scene).toMatchObject({ mutuallyExclusive: true, complete: true, generation: 'both' })
    const person = byParent('Person')
    expect(person.childIds).toHaveLength(3)
    expect(person).toMatchObject({ complete: true, generation: 'both' })
  })

  it('is consistent and survives save → reload', () => {
    expect(integrityProblems(m)).toEqual([])
    const reloaded = parseModel(serializeModel(m))
    expect(serializeModel(reloaded)).toBe(serializeModel(m))
  })
})
