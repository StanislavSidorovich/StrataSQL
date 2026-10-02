// One test group per linter check of SPEC §7, plus the reference models (no false alarms).

import { describe, expect, it } from 'vitest'
import { lintModel, type LintIssue, type RuleId } from '../src/core/lint'
import { CARD, emptyModel, type Model } from '../src/core/metamodel'
import { addAttribute, addEntity, addInheritance, addRelationship, findEntityByName, removeRelationship, updateEntity } from '../src/core/ops'
import { buildRideHailing } from '../src/data/examples/ride-hailing'
import { buildTimetables } from '../src/data/examples/timetables'
import { buildTvShows } from '../src/data/examples/tv-shows'

const rules = (m: Model) => lintModel(m).map((i) => i.rule)
const only = (m: Model, rule: RuleId): LintIssue[] => lintModel(m).filter((i) => i.rule === rule)

/** Entity with an integer primary identifier `<name>_id`. */
function ent(m: Model, name: string, extra: string[] = []) {
  const e = addEntity(m, { name })
  addAttribute(m, e.id, { name: `${name.toLowerCase()}_id`, dataType: 'Integer', primary: true })
  for (const a of extra) addAttribute(m, e.id, { name: a })
  return e
}

describe('reference models', () => {
  it.each([
    ['TV Shows', buildTvShows],
    ['Timetables', buildTimetables],
    ['Ride Hailing', buildRideHailing],
  ])('%s has no issues at all', (_, build) => {
    const issues = lintModel(build())
    expect(issues.map((i) => `${i.rule}: ${i.message}`)).toEqual([])
  })
})

describe('L01 entity without primary identifier', () => {
  it('flags an independent entity without PI', () => {
    const m = emptyModel()
    const e = addEntity(m, { name: 'Loose' })
    addAttribute(m, e.id, { name: 'note' })
    expect(only(m, 'L01')).toMatchObject([{ severity: 'error', targets: [{ kind: 'entity', id: e.id }] }])
  })
  it('accepts dependent entities and inheritance children without own PI', () => {
    const m = emptyModel()
    const show = ent(m, 'Show')
    const sd = addEntity(m, { name: 'ShowDirector' })
    addRelationship(m, show.id, sd.id, { dependentSide: 'B', cardinalityB: CARD.oneOne })
    const actor = addEntity(m, { name: 'Actor' })
    addInheritance(m, show.id, [actor.id])
    expect(only(m, 'L01')).toEqual([])
  })
})

describe('L02 entity without attributes and relationships', () => {
  it('flags an empty, unlinked entity only', () => {
    const m = emptyModel()
    const empty = addEntity(m, { name: 'Empty' })
    ent(m, 'Full')
    expect(only(m, 'L02').map((i) => i.targets[0])).toEqual([{ kind: 'entity', id: empty.id }])
  })
})

describe('L03 many-to-many relationship with data', () => {
  it('suggests an intermediate entity when the name or comment describes pair data', () => {
    const m = emptyModel()
    const s = ent(m, 'Student')
    const c = ent(m, 'Course')
    const r = addRelationship(m, s.id, c.id, { name: 'enrolled', cardinalityA: CARD.zeroMany, comment: 'with the grade and the enrolment date' })
    const issues = only(m, 'L03')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('“date”')
    expect(issues[0].message).toContain('“grade”')
    expect(issues[0].targets).toEqual([{ kind: 'relationship', id: r.id }])
  })
  it('stays quiet for a plain M:N and for 1:N relationships with such words', () => {
    const m = emptyModel()
    const s = ent(m, 'Student')
    const c = ent(m, 'Course')
    addRelationship(m, s.id, c.id, { name: 'likes', cardinalityA: CARD.zeroMany })
    addRelationship(m, s.id, c.id, { name: 'start_date', roleA: 'x' })
    expect(only(m, 'L03')).toEqual([])
  })
})

describe('L04 cycle of relationships', () => {
  it('flags the TV Shows cycle version (Episode → Director)', () => {
    const m = buildTvShows()
    const byName = (n: string) => findEntityByName(m, n)!
    removeRelationship(m, m.relationships.find((r) => r.name === 'directs_episode')!.id)
    addRelationship(m, byName('Director').id, byName('Episode').id, { name: 'directs' })
    const issues = only(m, 'L04')
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    const entities = issues[0].targets.filter((t) => t.kind === 'entity').map((t) => (t.kind === 'entity' ? m.entities.find((e) => e.id === t.id)!.name : ''))
    expect(entities.sort()).toEqual(['Director', 'Episode', 'ShowDirector', 'TVShow'])
  })

  it('accepts the reference (Episode → ShowDirector): show_id is one shared column', () => {
    expect(only(buildTvShows(), 'L04')).toEqual([])
  })

  it('flags a diamond whose key is not shared (intermediate entity with its own id)', () => {
    const m = emptyModel()
    const show = ent(m, 'Show')
    const ep = ent(m, 'Episode')
    const sd = ent(m, 'ShowDirector') // own id → show_id is not part of its key
    addRelationship(m, show.id, ep.id)
    addRelationship(m, show.id, sd.id)
    addRelationship(m, sd.id, ep.id)
    const issues = only(m, 'L04')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('Episode reaches Show along two paths')
  })

  it('flags circular references (every table points at the next)', () => {
    const m = emptyModel()
    const emp = ent(m, 'Employee')
    const dep = ent(m, 'Department')
    addRelationship(m, dep.id, emp.id, { name: 'works_in' }) // employee → department
    addRelationship(m, emp.id, dep.id, { name: 'manages', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroOne }) // 1:1, FK in department
    // Two relationships between one pair are not a cycle for L04 (that is L08's business).
    expect(only(m, 'L04')).toEqual([])
    const site = ent(m, 'Site')
    removeRelationship(m, m.relationships.find((r) => r.name === 'manages')!.id)
    addRelationship(m, site.id, dep.id) // department → site
    addRelationship(m, emp.id, site.id, { name: 'runs', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroOne }) // site → employee
    const issues = only(m, 'L04')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/^Circular references/)
  })

  it('does not see a tree as a cycle', () => {
    expect(only(buildTimetables(), 'L04')).toEqual([])
    expect(only(buildRideHailing(), 'L04')).toEqual([])
  })
})

describe('L05 attribute repeated in parent and child', () => {
  it('flags the child attribute, also through a grandparent', () => {
    const m = emptyModel()
    const person = ent(m, 'Person', ['name'])
    const staff = addEntity(m, { name: 'Staff' })
    addAttribute(m, staff.id, { name: 'salary' })
    const doctor = addEntity(m, { name: 'Doctor' })
    const dupe = addAttribute(m, doctor.id, { name: 'Name' })
    addInheritance(m, person.id, [staff.id])
    addInheritance(m, staff.id, [doctor.id])
    expect(only(m, 'L05')).toMatchObject([{ targets: [{ kind: 'attribute', entityId: doctor.id, attributeId: dupe.id }, { kind: 'entity', id: person.id }] }])
  })
})

describe('L06 inheritance child without own attributes or relationships', () => {
  it('flags a bare child; a relationship justifies it (TV Shows Actor)', () => {
    const m = emptyModel()
    const person = ent(m, 'Person', ['name'])
    const actor = addEntity(m, { name: 'Actor' })
    const extra = addEntity(m, { name: 'Extra' })
    addInheritance(m, person.id, [actor.id, extra.id])
    const scene = ent(m, 'Scene')
    addRelationship(m, scene.id, actor.id, { cardinalityA: CARD.zeroMany })
    expect(only(m, 'L06').map((i) => i.targets[0])).toEqual([{ kind: 'entity', id: extra.id }])
    expect(only(buildTvShows(), 'L06')).toEqual([])
  })
})

describe('L07 dependent entity without own identifier and a single parent', () => {
  it('flags a 1:N dependent without own id', () => {
    const m = emptyModel()
    const trip = ent(m, 'Trip')
    const stop = addEntity(m, { name: 'TripStop' })
    addAttribute(m, stop.id, { name: 'address' })
    addRelationship(m, trip.id, stop.id, { dependentSide: 'B' })
    expect(only(m, 'L07')).toMatchObject([{ severity: 'error', targets: [{ kind: 'entity', id: stop.id }, { kind: 'relationship' }] }])
  })
  it('accepts an own identifier, two parents, or a 1:1 dependent (Ride Hailing ratings)', () => {
    const m = emptyModel()
    const trip = ent(m, 'Trip')
    const stop = addEntity(m, { name: 'TripStop' })
    addAttribute(m, stop.id, { name: 'stop_order', dataType: 'Integer', primary: true })
    addRelationship(m, trip.id, stop.id, { dependentSide: 'B' })
    const rating = addEntity(m, { name: 'Rating' })
    addAttribute(m, rating.id, { name: 'score' })
    addRelationship(m, trip.id, rating.id, { dependentSide: 'B', cardinalityB: CARD.zeroOne })
    expect(only(m, 'L07')).toEqual([])
    expect(only(buildTvShows(), 'L07')).toEqual([]) // Role: two parents, no own id
  })
})

describe('L08 repeated relationship without roles', () => {
  it('flags parallel and reflexive relationships without roles', () => {
    const m = emptyModel()
    const stop = ent(m, 'Stop')
    const route = ent(m, 'Route')
    const from = addRelationship(m, stop.id, route.id, { name: 'from' })
    addRelationship(m, stop.id, route.id, { name: 'to', roleA: 'destination' })
    const boss = addRelationship(m, route.id, route.id, { name: 'replaces', cardinalityA: CARD.zeroOne })
    expect(only(m, 'L08').map((i) => i.targets[0])).toEqual([
      { kind: 'relationship', id: from.id },
      { kind: 'relationship', id: boss.id },
    ])
  })
  it('stays quiet for a single relationship between two entities', () => {
    const m = emptyModel()
    addRelationship(m, ent(m, 'A').id, ent(m, 'B').id)
    expect(only(m, 'L08')).toEqual([])
  })
})

describe('L09 derived attribute', () => {
  it('flags aggregates and age, not ordinary names', () => {
    const m = emptyModel()
    const d = ent(m, 'Driver', ['avg_rating', 'totalTrips', 'number_of_cars', 'age', 'count', 'number', 'average_speed_limit_name_x'])
    const flagged = only(m, 'L09').map((i) => (i.targets[0].kind === 'attribute' ? d.attributes.find((a) => a.id === (i.targets[0] as { attributeId: string }).attributeId)!.name : ''))
    expect(flagged).toEqual(['avg_rating', 'totalTrips', 'number_of_cars', 'age', 'average_speed_limit_name_x'])
  })
})

describe('L10 duplicate names', () => {
  it('flags duplicate entity names, codes and attribute names', () => {
    const m = emptyModel()
    const a = ent(m, 'Car')
    const b = ent(m, 'Truck')
    updateEntity(m, b.id, { name: 'car' }) // case-insensitive duplicate
    const c = ent(m, 'Bus')
    updateEntity(m, c.id, { code: 'CAR' })
    const x = addAttribute(m, a.id, { name: 'plate' })
    a.attributes.push({ ...x, id: 'att_dupe' })
    const issues = only(m, 'L10')
    expect(issues.map((i) => i.targets.length)).toEqual([2, 3, 2])
    expect(issues.every((i) => i.severity === 'error')).toBe(true)
  })
})

describe('ordering', () => {
  it('lists errors first, then warnings, then info', () => {
    const m = emptyModel()
    addEntity(m, { name: 'Empty' }) // L01 error + L02 warning
    const d = ent(m, 'D', ['total'])
    expect(d).toBeTruthy()
    expect(rules(m)).toEqual(['L01', 'L02'])
  })
})
