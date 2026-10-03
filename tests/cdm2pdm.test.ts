// One test (group) per CDM → PDM rule of SPEC §6.

import { describe, expect, it } from 'vitest'
import { foreignKeyHolder, generatePdm } from '../src/core/cdm2pdm'
import { CARD, emptyModel, type Model } from '../src/core/metamodel'
import {
  addAttribute,
  addEntity,
  addIdentifier,
  addInheritance,
  addPhysicalKey,
  addRelationship,
  setForeignKeySide,
} from '../src/core/ops'
import { findColumn, findTable, type Pdm } from '../src/core/pdm'

function table(p: Pdm, name: string) {
  const t = findTable(p, name)
  if (!t) throw new Error(`no table ${name}; have ${p.tables.map((x) => x.name).join(', ')}`)
  return t
}
const cols = (p: Pdm, name: string) => table(p, name).columns.map((c) => c.name)
const pk = (p: Pdm, name: string) => table(p, name).primaryKey?.columns
const fks = (p: Pdm, name: string) =>
  table(p, name).foreignKeys.map((f) => `${f.name}: (${f.columns.join(',')}) → ${f.refTable}(${f.refColumns.join(',')})`)
const nullable = (p: Pdm, t: string, c: string) => findColumn(table(p, t), c)!.nullable

/** Entity with an integer primary identifier `<name>_id` (lower-case). */
function ent(m: Model, name: string, extra: string[] = []) {
  const e = addEntity(m, { name })
  addAttribute(m, e.id, { name: `${name.toLowerCase()}_id`, dataType: 'Integer', primary: true })
  for (const a of extra) addAttribute(m, e.id, { name: a, length: 50 })
  return e
}

describe('entity → table', () => {
  it('maps attributes to columns, the primary identifier to the PK and alternate identifiers to AKs', () => {
    const m = emptyModel()
    const car = addEntity(m, { name: 'Car Shift' })
    addAttribute(m, car.id, { name: 'shift_id', dataType: 'Integer', primary: true })
    const plate = addAttribute(m, car.id, { name: 'plate', length: 10, mandatory: true })
    addAttribute(m, car.id, { name: 'note', dataType: 'Text' })
    addIdentifier(m, car.id, { name: 'plate', isPrimary: false, attributeIds: [plate.id] })
    const p = generatePdm(m)
    expect(p.tables.map((t) => t.name)).toEqual(['CAR_SHIFT'])
    expect(cols(p, 'CAR_SHIFT')).toEqual(['shift_id', 'plate', 'note'])
    expect(pk(p, 'CAR_SHIFT')).toEqual(['shift_id'])
    expect(table(p, 'CAR_SHIFT').primaryKey!.name).toBe('PK_CAR_SHIFT')
    expect(table(p, 'CAR_SHIFT').alternateKeys).toMatchObject([{ name: 'AK_PLATE_CAR_SHIFT', columns: ['plate'] }])
    expect(nullable(p, 'CAR_SHIFT', 'plate')).toBe(false)
    expect(nullable(p, 'CAR_SHIFT', 'note')).toBe(true)
    expect(findColumn(table(p, 'CAR_SHIFT'), 'note')).toMatchObject({ dataType: 'Text', migrated: false })
  })

  it('warns about a table without primary key', () => {
    const m = emptyModel()
    addEntity(m, { name: 'Loose' })
    const p = generatePdm(m)
    expect(table(p, 'LOOSE').primaryKey).toBeNull()
    expect(p.notes.some((n) => n.level === 'warning' && n.message.includes('LOOSE has no primary key'))).toBe(true)
  })
})

describe('one-to-many', () => {
  it('puts the FK on the many side, NOT NULL when the one side has min 1', () => {
    const m = emptyModel()
    const rider = ent(m, 'Rider')
    const shift = ent(m, 'Shift')
    const trip = ent(m, 'Trip')
    addRelationship(m, rider.id, trip.id, { name: 'requests' }) // 1,1 — 0,n
    addRelationship(m, shift.id, trip.id, { name: 'serves', cardinalityA: CARD.zeroOne })
    const p = generatePdm(m)
    expect(cols(p, 'TRIP')).toEqual(['trip_id', 'rider_id', 'shift_id'])
    expect(nullable(p, 'TRIP', 'rider_id')).toBe(false)
    expect(nullable(p, 'TRIP', 'shift_id')).toBe(true)
    expect(fks(p, 'TRIP')).toEqual([
      'FK_TRIP_REQUESTS_RIDER: (rider_id) → RIDER(rider_id)',
      'FK_TRIP_SERVES_SHIFT: (shift_id) → SHIFT(shift_id)',
    ])
    expect(table(p, 'TRIP').foreignKeys.map((f) => f.mandatory)).toEqual([true, false])
  })

  it('works whichever way round the relationship was drawn', () => {
    const m = emptyModel()
    const trip = ent(m, 'Trip')
    const rider = ent(m, 'Rider')
    const r = addRelationship(m, trip.id, rider.id, { cardinalityA: CARD.zeroMany, cardinalityB: CARD.oneOne })
    expect(foreignKeyHolder(r)).toBe('A')
    expect(cols(generatePdm(m), 'TRIP')).toEqual(['trip_id', 'rider_id'])
  })
})

describe('one-to-one', () => {
  it('defaults the FK to the side that must have a partner and makes it UNIQUE', () => {
    const m = emptyModel()
    const person = ent(m, 'Person')
    const passport = ent(m, 'Passport')
    // Every passport has exactly one person; a person has at most one passport.
    addRelationship(m, person.id, passport.id, { name: 'holds', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroOne })
    const p = generatePdm(m)
    expect(cols(p, 'PERSON')).toEqual(['person_id'])
    expect(cols(p, 'PASSPORT')).toEqual(['passport_id', 'person_id'])
    expect(nullable(p, 'PASSPORT', 'person_id')).toBe(false)
    expect(table(p, 'PASSPORT').alternateKeys).toMatchObject([{ name: 'AK_HOLDS_PASSPORT', columns: ['person_id'] }])
  })

  it('follows the side chosen by the user', () => {
    const m = emptyModel()
    const person = ent(m, 'Person')
    const passport = ent(m, 'Passport')
    const r = addRelationship(m, person.id, passport.id, { name: 'holds', cardinalityA: CARD.oneOne, cardinalityB: CARD.zeroOne })
    setForeignKeySide(m, r.id, 'A')
    const p = generatePdm(m)
    expect(cols(p, 'PERSON')).toEqual(['person_id', 'passport_id'])
    expect(nullable(p, 'PERSON', 'passport_id')).toBe(true)
    expect(table(p, 'PERSON').alternateKeys[0].columns).toEqual(['passport_id'])
  })

  it('skips the UNIQUE when the FK already is the whole PK (dependent 1:1, Ride Hailing ratings)', () => {
    const m = emptyModel()
    const trip = ent(m, 'Trip')
    const rating = addEntity(m, { name: 'Rating' })
    addAttribute(m, rating.id, { name: 'score', dataType: 'Short integer', mandatory: true })
    addRelationship(m, trip.id, rating.id, { cardinalityB: CARD.zeroOne, dependentSide: 'B' })
    const p = generatePdm(m)
    expect(pk(p, 'RATING')).toEqual(['trip_id'])
    expect(table(p, 'RATING').alternateKeys).toEqual([])
  })
})

describe('many-to-many', () => {
  it('becomes a join table whose PK is both FKs', () => {
    const m = emptyModel()
    const student = ent(m, 'Student')
    const course = ent(m, 'Course')
    addRelationship(m, student.id, course.id, { name: 'enrolls', cardinalityA: CARD.zeroMany, cardinalityB: CARD.oneMany })
    const p = generatePdm(m)
    expect(cols(p, 'STUDENT')).toEqual(['student_id'])
    expect(cols(p, 'ENROLLS')).toEqual(['student_id', 'course_id'])
    expect(pk(p, 'ENROLLS')).toEqual(['student_id', 'course_id'])
    expect(fks(p, 'ENROLLS')).toEqual([
      'FK_ENROLLS_ENROLLS_STUDENT: (student_id) → STUDENT(student_id)',
      'FK_ENROLLS_ENROLLS_COURSE: (course_id) → COURSE(course_id)',
    ])
  })

  it('prefixes the columns of a reflexive many-to-many with the roles', () => {
    const m = emptyModel()
    const course = ent(m, 'Course')
    addRelationship(m, course.id, course.id, {
      name: 'prerequisite',
      cardinalityA: CARD.zeroMany,
      cardinalityB: CARD.zeroMany,
      roleA: 'required',
      roleB: 'unlocked',
    })
    const p = generatePdm(m)
    expect(cols(p, 'PREREQUISITE')).toEqual(['required_course_id', 'unlocked_course_id'])
  })
})

describe('dependent entities', () => {
  it('migrate the parent key into the child PK, before the own identifier', () => {
    const m = emptyModel()
    const episode = ent(m, 'Episode')
    const scene = addEntity(m, { name: 'Scene' })
    addAttribute(m, scene.id, { name: 'order_no', dataType: 'Integer', primary: true })
    addRelationship(m, episode.id, scene.id, { dependentSide: 'B' })
    const p = generatePdm(m)
    expect(pk(p, 'SCENE')).toEqual(['episode_id', 'order_no'])
    expect(table(p, 'SCENE').foreignKeys[0]).toMatchObject({ identifying: true, mandatory: true, columns: ['episode_id'] })
    expect(findColumn(table(p, 'SCENE'), 'episode_id')!.migrated).toBe(true)
  })

  it('migrate keys transitively and from several parents (intermediate entity without own id)', () => {
    const m = emptyModel()
    const episode = ent(m, 'Episode')
    const scene = addEntity(m, { name: 'Scene' })
    addAttribute(m, scene.id, { name: 'order_no', dataType: 'Integer', primary: true })
    addRelationship(m, episode.id, scene.id, { dependentSide: 'B' })
    const actor = ent(m, 'Actor')
    const role = addEntity(m, { name: 'Role' })
    addAttribute(m, role.id, { name: 'role_name', length: 100, mandatory: true })
    addRelationship(m, actor.id, role.id, { dependentSide: 'B' })
    addRelationship(m, scene.id, role.id, { dependentSide: 'B' })
    const p = generatePdm(m)
    expect(pk(p, 'ROLE')).toEqual(['actor_id', 'episode_id', 'order_no'])
    expect(cols(p, 'ROLE')).toEqual(['actor_id', 'episode_id', 'order_no', 'role_name'])
  })

  it('add the own identifier when the pair may repeat (intermediate entity with own id)', () => {
    const m = emptyModel()
    const tech = ent(m, 'Technician')
    const scene = ent(m, 'Scene')
    const fn = addEntity(m, { name: 'TechnicianFunction' })
    addAttribute(m, fn.id, { name: 'function_no', dataType: 'Integer', primary: true })
    addRelationship(m, tech.id, fn.id, { dependentSide: 'B' })
    addRelationship(m, scene.id, fn.id, { dependentSide: 'B' })
    expect(pk(generatePdm(m), 'TECHNICIANFUNCTION')).toEqual(['technician_id', 'scene_id', 'function_no'])
  })

  it('report a dependency cycle instead of looping', () => {
    const m = emptyModel()
    const a = ent(m, 'A')
    const b = ent(m, 'B')
    addRelationship(m, a.id, b.id, { dependentSide: 'B' })
    addRelationship(m, b.id, a.id, { dependentSide: 'B' })
    const p = generatePdm(m)
    expect(p.notes.some((n) => n.message.startsWith('Dependency cycle'))).toBe(true)
  })
})

describe('inheritance', () => {
  function scenes(generation: 'parent' | 'children' | 'both', discriminator?: string) {
    const m = emptyModel()
    const scene = ent(m, 'Scene', ['title'])
    const indoor = addEntity(m, { name: 'Indoor' })
    addAttribute(m, indoor.id, { name: 'studio', length: 50, mandatory: true })
    const outdoor = addEntity(m, { name: 'Outdoor' })
    addAttribute(m, outdoor.id, { name: 'location', length: 50 })
    addInheritance(m, scene.id, [indoor.id, outdoor.id], { name: 'kind', generation, discriminator })
    const crew = ent(m, 'Crew')
    addRelationship(m, crew.id, indoor.id, { name: 'works_in' })
    return generatePdm(m)
  }

  it('generation = both: parent table + child tables whose PK is a FK to the parent', () => {
    const p = scenes('both')
    expect(p.tables.map((t) => t.name)).toEqual(['SCENE', 'INDOOR', 'OUTDOOR', 'CREW'])
    expect(cols(p, 'INDOOR')).toEqual(['scene_id', 'crew_id', 'studio'])
    expect(pk(p, 'INDOOR')).toEqual(['scene_id'])
    expect(fks(p, 'INDOOR')[0]).toBe('FK_INDOOR_KIND_SCENE: (scene_id) → SCENE(scene_id)')
    expect(table(p, 'INDOOR').foreignKeys[0].identifying).toBe(true)
  })

  it('generation = parent: one table, child columns nullable, optional discriminator with CHECK', () => {
    const p = scenes('parent', 'scene_kind')
    expect(p.tables.map((t) => t.name)).toEqual(['SCENE', 'CREW'])
    expect(cols(p, 'SCENE')).toEqual(['scene_id', 'crew_id', 'title', 'studio', 'location', 'scene_kind'])
    // studio is mandatory in Indoor, but outdoor rows have none.
    expect(nullable(p, 'SCENE', 'studio')).toBe(true)
    // The relationship to the child moves to the single table, nullable for the same reason.
    expect(nullable(p, 'SCENE', 'crew_id')).toBe(true)
    expect(nullable(p, 'SCENE', 'scene_kind')).toBe(false)
    expect(table(p, 'SCENE').checks).toMatchObject([{ name: 'CK_SCENE_SCENE_KIND', expression: "scene_kind IN ('Indoor', 'Outdoor')" }])
  })

  it('generation = children: no parent table, parent columns copied into each child', () => {
    const p = scenes('children')
    expect(p.tables.map((t) => t.name)).toEqual(['INDOOR', 'OUTDOOR', 'CREW'])
    expect(cols(p, 'INDOOR')).toEqual(['scene_id', 'crew_id', 'title', 'studio'])
    expect(cols(p, 'OUTDOOR')).toEqual(['scene_id', 'title', 'location'])
    expect(pk(p, 'OUTDOOR')).toEqual(['scene_id'])
    expect(table(p, 'OUTDOOR').foreignKeys).toEqual([])
    expect(findColumn(table(p, 'OUTDOOR'), 'scene_id')!.migrated).toBe(false)
  })

  it('generation = children: a FK to the missing parent table is reported, not generated', () => {
    const m = emptyModel()
    const person = ent(m, 'Person')
    const actor = addEntity(m, { name: 'Actor' })
    addInheritance(m, person.id, [actor.id], { generation: 'children' })
    const award = ent(m, 'Award')
    addRelationship(m, person.id, award.id, { name: 'wins' })
    const p = generatePdm(m)
    expect(table(p, 'AWARD').foreignKeys).toEqual([])
    expect(p.notes.some((n) => n.level === 'warning' && n.message.includes('Person has no table'))).toBe(true)
  })
})

describe('naming and column collisions', () => {
  it('names FKs FK_<CHILD>_<ROLE>_<PARENT>, using the role when there is one', () => {
    const m = emptyModel()
    const dept = ent(m, 'Dept')
    const emp = ent(m, 'Emp')
    addRelationship(m, dept.id, emp.id, { name: 'employs', roleA: 'employer' })
    expect(fks(generatePdm(m), 'EMP')).toEqual(['FK_EMP_EMPLOYER_DEPT: (dept_id) → DEPT(dept_id)'])
  })

  it('shares a column that arrives from the same origin through different neighbours (TV Shows)', () => {
    const m = emptyModel()
    const show = ent(m, 'Show')
    const director = ent(m, 'Director')
    const sd = addEntity(m, { name: 'ShowDirector' })
    addRelationship(m, show.id, sd.id, { dependentSide: 'B' })
    addRelationship(m, director.id, sd.id, { dependentSide: 'B' })
    const episode = ent(m, 'Episode')
    addRelationship(m, show.id, episode.id, { name: 'has' })
    addRelationship(m, sd.id, episode.id, { name: 'directs' })
    const p = generatePdm(m)
    expect(cols(p, 'EPISODE')).toEqual(['episode_id', 'show_id', 'director_id'])
    expect(fks(p, 'EPISODE')).toEqual([
      'FK_EPISODE_HAS_SHOW: (show_id) → SHOW(show_id)',
      'FK_EPISODE_DIRECTS_SHOWDIRECTOR: (show_id,director_id) → SHOWDIRECTOR(show_id,director_id)',
    ])
    expect(p.notes.some((n) => n.message.includes('EPISODE.show_id is one shared column'))).toBe(true)
  })

  it('prefixes columns with the role when the same neighbour is referenced twice', () => {
    const m = emptyModel()
    const stop = ent(m, 'Stop')
    const leg = ent(m, 'Leg')
    addRelationship(m, stop.id, leg.id, { name: 'departs', roleA: 'from' })
    addRelationship(m, stop.id, leg.id, { name: 'arrives', roleA: 'to' })
    const p = generatePdm(m)
    expect(cols(p, 'LEG')).toEqual(['leg_id', 'from_stop_id', 'to_stop_id'])
    expect(fks(p, 'LEG')).toEqual([
      'FK_LEG_FROM_STOP: (from_stop_id) → STOP(stop_id)',
      'FK_LEG_TO_STOP: (to_stop_id) → STOP(stop_id)',
    ])
    expect(p.notes.filter((n) => n.level === 'warning')).toEqual([])
  })

  it('prefixes a reflexive FK and warns when roles are missing', () => {
    const m = emptyModel()
    const emp = ent(m, 'Employee')
    addRelationship(m, emp.id, emp.id, { name: 'manages', cardinalityA: CARD.zeroOne })
    const p = generatePdm(m)
    expect(cols(p, 'EMPLOYEE')).toEqual(['employee_id', 'manages_employee_id'])
    expect(nullable(p, 'EMPLOYEE', 'manages_employee_id')).toBe(true)
    expect(p.notes.some((n) => n.level === 'warning' && n.message.includes('Give the relationship roles'))).toBe(true)
  })

  it('renames a migrated column whose name is taken by a different column', () => {
    const m = emptyModel()
    const show = addEntity(m, { name: 'Show' })
    addAttribute(m, show.id, { name: 'id', dataType: 'Integer', primary: true })
    const episode = addEntity(m, { name: 'Episode' })
    addAttribute(m, episode.id, { name: 'id', dataType: 'Integer', primary: true })
    addRelationship(m, show.id, episode.id)
    const p = generatePdm(m)
    expect(cols(p, 'EPISODE')).toEqual(['id', 'show_id'])
    expect(fks(p, 'EPISODE')).toEqual(['FK_EPISODE_SHOW_EPISODE_SHOW: (show_id) → SHOW(id)'])
  })
})

describe('alternate keys over migrated columns (Timetables)', () => {
  function slots() {
    const m = emptyModel()
    const room = ent(m, 'Room')
    const klass = addEntity(m, { name: 'Class' })
    addAttribute(m, klass.id, { name: 'weekday', dataType: 'Short integer', primary: true })
    addRelationship(m, room.id, klass.id, { dependentSide: 'B' })
    const slot = ent(m, 'Slot')
    const cs = addEntity(m, { name: 'ClassSlot' })
    addRelationship(m, klass.id, cs.id, { dependentSide: 'B' })
    addRelationship(m, slot.id, cs.id, { dependentSide: 'B' })
    return { m, cs }
  }

  it('are built from columns that exist only after migration', () => {
    const { m, cs } = slots()
    addPhysicalKey(m, cs.id, { name: 'AK_ROOM_TIME', columns: ['room_id', 'weekday', 'slot_id'] })
    const p = generatePdm(m)
    expect(pk(p, 'CLASSSLOT')).toEqual(['room_id', 'weekday', 'slot_id'])
    expect(table(p, 'CLASSSLOT').alternateKeys).toMatchObject([{ name: 'AK_ROOM_TIME', columns: ['room_id', 'weekday', 'slot_id'] }])
  })

  it('are skipped with a warning when a column does not exist', () => {
    const { m, cs } = slots()
    addPhysicalKey(m, cs.id, { name: 'AK_BAD', columns: ['room_id', 'professor_id'] })
    const p = generatePdm(m)
    expect(table(p, 'CLASSSLOT').alternateKeys).toEqual([])
    expect(p.notes).toContainEqual(expect.objectContaining({ level: 'warning', message: 'Key AK_BAD on CLASSSLOT skipped: no column professor_id.' }))
  })
})
