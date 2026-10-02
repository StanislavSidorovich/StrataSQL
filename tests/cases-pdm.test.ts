// Stage 2 acceptance: the reference CDMs of the three cases generate the PDMs of cases/*.md §5.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { findColumn, findTable, type Pdm } from '../src/core/pdm'
import { integrityProblems, parseModel, serializeModel } from '../src/core/serialize'
import { buildRideHailing } from '../src/data/examples/ride-hailing'
import { buildTimetables } from '../src/data/examples/timetables'
import { buildTvShows } from '../src/data/examples/tv-shows'

/** `TABLE: pk1, pk2 | FK cols → REF; … | AK cols; …` — compact summary to compare with the case tables. */
function summary(p: Pdm): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of p.tables) {
    const parts = [t.primaryKey?.columns.join(', ') ?? '—']
    if (t.foreignKeys.length) parts.push(t.foreignKeys.map((f) => `${f.columns.join(', ')} → ${f.refTable}`).join('; '))
    if (t.alternateKeys.length) parts.push(`AK ${t.alternateKeys.map((a) => a.columns.join(', ')).join('; AK ')}`)
    out[t.name] = parts.join(' | ')
  }
  return out
}

function nullableColumns(p: Pdm, table: string): string[] {
  return findTable(p, table)!.columns.filter((c) => c.nullable).map((c) => c.name)
}

describe('TV Shows (cases/tv-shows.md §5)', () => {
  const p = generatePdm(buildTvShows())

  it('generates the expected tables and keys', () => {
    expect(summary(p)).toEqual({
      TVSHOW: 'show_id',
      EPISODE: 'episode_id | show_id → TVSHOW; show_id, person_id → SHOWDIRECTOR',
      SCENE: 'episode_id, order_no | episode_id → EPISODE',
      INDOORSCENE: 'episode_id, order_no | episode_id, order_no → SCENE',
      OUTDOORSCENE: 'episode_id, order_no | episode_id, order_no → SCENE',
      PERSON: 'person_id',
      ACTOR: 'person_id | person_id → PERSON',
      TECHNICIAN: 'person_id | person_id → PERSON',
      DIRECTOR: 'person_id | person_id → PERSON',
      ROLE: 'person_id, episode_id, order_no | person_id → ACTOR; episode_id, order_no → SCENE',
      TECHNICIANFUNCTION:
        'person_id, episode_id, order_no, function_no | person_id → TECHNICIAN; episode_id, order_no → SCENE',
      SHOWDIRECTOR: 'show_id, person_id | show_id → TVSHOW; person_id → DIRECTOR',
    })
  })

  it('keeps show_id as one shared column in EPISODE (no conflicting director)', () => {
    const episode = findTable(p, 'EPISODE')!
    expect(episode.columns.filter((c) => c.name === 'show_id')).toHaveLength(1)
    expect(episode.columns.map((c) => c.name)).toEqual(['episode_id', 'title', 'summary', 'duration_min', 'show_id', 'person_id'])
    expect(nullableColumns(p, 'EPISODE')).toEqual(['summary', 'duration_min'])
    expect(p.notes.filter((n) => n.level === 'warning')).toEqual([])
  })
})

describe('Timetables (cases/timetables.md §5)', () => {
  const p = generatePdm(buildTimetables())

  it('generates the expected tables and keys', () => {
    const time = 'period_id, weekday, slot_id'
    const classKey = 'course_id, professor_id, year_id, room_id, shift_code, period_id, weekday'
    expect(summary(p)).toEqual({
      PROGRAM: 'program_id | AK code',
      PROGRAMCOURSE: 'program_id, course_id | program_id → PROGRAM; course_id → COURSE',
      COURSE: 'course_id',
      PROFESSOR: 'professor_id',
      ACADEMICYEAR: 'year_id',
      TEACHINGASSIGNMENT:
        'course_id, professor_id, year_id | course_id → COURSE; professor_id → PROFESSOR; year_id → ACADEMICYEAR',
      ROOM: 'room_id',
      SHIFT: 'shift_code',
      PERIOD: 'period_id',
      CLASS: `${classKey} | course_id, professor_id, year_id → TEACHINGASSIGNMENT; room_id → ROOM; shift_code → SHIFT; period_id → PERIOD`,
      SLOT: 'slot_id',
      CLASSSLOT:
        `${classKey}, slot_id | ${classKey} → CLASS; slot_id → SLOT | ` +
        `AK room_id, ${time}; AK professor_id, ${time}; AK course_id, shift_code, ${time}`,
    })
  })

  it('builds the three rule AKs from migrated columns only', () => {
    const slot = findTable(p, 'CLASSSLOT')!
    for (const ak of slot.alternateKeys) for (const c of ak.columns) expect(findColumn(slot, c)!.migrated).toBe(true)
    expect(slot.alternateKeys.map((a) => a.name)).toEqual(['AK_ROOM_TIME', 'AK_PROFESSOR_TIME', 'AK_COURSE_SHIFT_TIME'])
    expect(p.notes.filter((n) => n.level === 'warning')).toEqual([])
  })
})

describe('Ride Hailing (cases/ride-hailing.md §5)', () => {
  const p = generatePdm(buildRideHailing())

  it('generates the expected tables and keys', () => {
    expect(summary(p)).toEqual({
      RIDER: 'rider_id',
      DRIVER: 'driver_id | AK license_no',
      CAR: 'car_id | AK plate',
      CAR_SHIFT: 'shift_id | driver_id → DRIVER; car_id → CAR',
      TRIP: 'trip_id | rider_id → RIDER; shift_id → CAR_SHIFT',
      TRIP_STOP: 'trip_id, stop_order | trip_id → TRIP',
      DRIVER_RATING: 'trip_id | trip_id → TRIP',
      RIDER_RATING: 'trip_id | trip_id → TRIP',
      DRIVER_POSITION: 'driver_id, recorded_at | driver_id → DRIVER',
      RIDER_POSITION: 'rider_id, recorded_at | rider_id → RIDER',
    })
  })

  it('makes rider_id NOT NULL and shift_id NULL in TRIP (lifecycle)', () => {
    const trip = findTable(p, 'TRIP')!
    expect(findColumn(trip, 'rider_id')!.nullable).toBe(false)
    expect(findColumn(trip, 'shift_id')!.nullable).toBe(true)
    expect(p.notes.filter((n) => n.level === 'warning')).toEqual([])
  })
})

describe('reference models', () => {
  it.each([
    ['Timetables', buildTimetables],
    ['Ride Hailing', buildRideHailing],
  ])('%s is consistent and survives save → reload', (_, build) => {
    const m = build()
    expect(integrityProblems(m)).toEqual([])
    expect(serializeModel(parseModel(serializeModel(m)))).toBe(serializeModel(m))
  })
})
