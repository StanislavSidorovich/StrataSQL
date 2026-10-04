// Comparator (SPEC §9, stage 4 acceptance): correct matched / missing / extra on the 3 reference
// models and on seeded wrong models.

import { describe, expect, it } from 'vitest'
import { compareModels, matchEntities } from '../src/core/compare'
import { CARD, type Cardinality, type Model } from '../src/core/metamodel'
import {
  addAttribute,
  addEntity,
  addRelationship,
  findEntityByName,
  removeEntity,
  removeRelationship,
  setAttributeInPrimary,
  setDependentSide,
  updateEntity,
  updateInheritance,
  updateRelationship,
} from '../src/core/ops'
import { applyAnswer } from '../src/data/coach'
import { CASES } from '../src/data/cases'
import { MORE_CASES } from '../src/data/cases-more'
import { buildHotel } from '../src/data/examples/hotel'
import { buildLibrary } from '../src/data/examples/library'
import { buildRideHailing } from '../src/data/examples/ride-hailing'
import { buildTimetables } from '../src/data/examples/timetables'
import { buildTvShows } from '../src/data/examples/tv-shows'

const ent = (m: Model, name: string) => findEntityByName(m, name)!
const rel = (m: Model, name: string) => m.relationships.find((r) => r.name === name)!
const tvSyn = CASES.find((c) => c.id === 'tv-shows')!.synonyms

function summary(student: Model, ref: Model, synonyms?: Record<string, string[]>) {
  const res = compareModels(student, ref, { synonyms })
  const pick = (status: string) => res.items.filter((i) => i.status === status && i.kind !== 'attribute').map((i) => i.refKey ?? i.message)
  return { res, missing: pick('missing'), different: pick('different'), extra: pick('extra') }
}

describe('reference models compared with themselves', () => {
  it.each([
    ['TV Shows', buildTvShows],
    ['Timetables', buildTimetables],
    ['Ride Hailing', buildRideHailing],
  ])('%s: everything matched, score 100', (_, build) => {
    const s = summary(build(), build())
    expect(s.missing).toEqual([])
    expect(s.different).toEqual([])
    expect(s.extra).toEqual([])
    expect(s.res.items.some((i) => i.kind === 'attribute')).toBe(false)
    expect(s.res.score).toBe(100)
    expect(s.res.counts.matched).toBe(build().entities.length + build().relationships.length + build().inheritances.length)
  })

  it('matching does not depend on ids or on the order of entities', () => {
    const ref = buildTvShows()
    const student = buildTvShows()
    student.entities.reverse()
    student.entities.forEach((e, k) => (e.id = `other_${k}`))
    const match = matchEntities(student, ref)
    for (const e of ref.entities) expect(student.entities.find((s) => s.id === match.get(e.id))?.name).toBe(e.name)
  })

  it('every case has a reference model and its synonyms name real entities', () => {
    for (const c of CASES) {
      const m = c.build()
      for (const name of Object.keys(c.synonyms)) expect(findEntityByName(m, name), `${c.id}: ${name}`).toBeDefined()
    }
  })
})

describe('seeded wrong models — TV Shows', () => {
  it('the cycle version: Episode linked to Director instead of ShowDirector', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    removeRelationship(m, rel(m, 'directs_episode').id)
    addRelationship(m, ent(m, 'Director').id, ent(m, 'Episode').id, { name: 'directs' })
    const s = summary(m, ref)
    expect(s.missing).toEqual(['relationship:directs_episode'])
    expect(s.extra).toHaveLength(1)
    expect(s.extra[0]).toContain('Director — Episode')
    expect(s.res.score).toBeLessThan(100)
  })

  it('Role drawn as a many-to-many relationship: missing intermediate entity, extra M:N with a hint', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    removeEntity(m, ent(m, 'Role').id)
    addRelationship(m, ent(m, 'Actor').id, ent(m, 'Scene').id, { name: 'plays', cardinalityA: CARD.zeroMany, cardinalityB: CARD.zeroMany })
    const s = summary(m, ref)
    expect(s.missing).toEqual(['entity:Role', 'relationship:actor_role', 'relationship:scene_role'])
    expect(s.extra).toHaveLength(1)
    expect(s.extra[0]).toContain('intermediate entity (Role)')
  })

  it('Scene not dependent on Episode, and a cardinality turned around', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    setDependentSide(m, rel(m, 'has_scenes').id, null)
    updateRelationship(m, rel(m, 'has_episodes').id, { cardinalityA: CARD.oneMany, cardinalityB: CARD.oneOne })
    const s = summary(m, ref)
    expect(s.different).toEqual(['relationship:has_episodes', 'relationship:has_scenes'])
    const msg = s.res.items.find((i) => i.refKey === 'relationship:has_scenes' && i.status === 'different')!.message
    expect(msg).toContain('Scene should be identified through Episode')
  })

  it('accepts synonyms and other attribute spellings', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    updateEntity(m, ent(m, 'Role').id, { name: 'Casting' })
    updateEntity(m, ent(m, 'TechnicianFunction').id, { name: 'Crew' })
    updateEntity(m, ent(m, 'TVShow').id, { name: 'Show' })
    const s = summary(m, ref, tvSyn)
    expect(s.missing).toEqual([])
    expect(s.extra).toEqual([])
    expect(s.res.score).toBe(100)
  })

  it('finds a renamed intermediate entity without attributes by its neighbours', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    updateEntity(m, ent(m, 'ShowDirector').id, { name: 'Xyz' })
    const match = matchEntities(m, ref)
    expect(match.get(ent(ref, 'ShowDirector').id)).toBe(ent(m, 'Xyz').id)
  })

  it('TechnicianFunction without its own identifier; Role with one', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    const tf = ent(m, 'TechnicianFunction')
    setAttributeInPrimary(m, tf.id, tf.attributes[0].id, false)
    const role = ent(m, 'Role')
    addAttribute(m, role.id, { name: 'role_id', dataType: 'Integer', primary: true })
    const ids = compareModels(m, ref).items.filter((i) => i.kind === 'identifier')
    expect(ids.map((i) => i.refKey).sort()).toEqual(['entity:Role', 'entity:TechnicianFunction'])
  })

  it('inheritance: exclusive instead of non-exclusive, a child missing, an extra entity', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    const person = m.inheritances.find((i) => i.name === 'participant_kind')!
    updateInheritance(m, person.id, { mutuallyExclusive: true })
    removeEntity(m, ent(m, 'Technician').id)
    const genre = addEntity(m, { name: 'Genre' })
    addAttribute(m, genre.id, { name: 'genre_id', dataType: 'Integer', primary: true })
    const s = summary(m, ref)
    expect(s.missing).toContain('entity:Technician')
    expect(s.different).toEqual(['inheritance:participant_kind'])
    const msg = s.res.items.find((i) => i.refKey === 'inheritance:participant_kind')!.message
    expect(msg).toContain('children missing: Technician')
    expect(msg).toContain('not exclusive')
    expect(s.extra.some((x) => x.startsWith('Genre'))).toBe(true)
  })

  it('reports attributes from the text that are missing', () => {
    const ref = buildTvShows()
    const m = buildTvShows()
    const show = ent(m, 'TVShow')
    m.entities.find((e) => e.id === show.id)!.attributes = show.attributes.filter((a) => a.name !== 'genre')
    const attr = compareModels(m, ref).items.filter((i) => i.kind === 'attribute')
    expect(attr).toHaveLength(1)
    expect(attr[0].answer).toContain('genre')
  })
})

describe('seeded wrong models — Timetables and Ride Hailing', () => {
  it('Class with its own class_id is flagged; level-2 scope ignores entities', () => {
    const ref = buildTimetables()
    const m = buildTimetables()
    const klass = ent(m, 'Class')
    setAttributeInPrimary(m, klass.id, klass.attributes[0].id, false)
    const s = compareModels(m, ref)
    expect(s.items.filter((i) => i.kind === 'identifier').map((i) => i.refKey)).toEqual(['entity:Class'])
    const links = compareModels(m, ref, { scope: 'links' })
    expect(links.items.every((i) => i.kind === 'relationship' || i.kind === 'inheritance')).toBe(true)
    expect(links.score).toBe(100)
  })

  it('a trip that must always have a shift (1,1 instead of 0,1)', () => {
    const ref = buildRideHailing()
    const m = buildRideHailing()
    updateRelationship(m, rel(m, 'serves').id, { cardinalityA: CARD.oneOne })
    const s = summary(m, ref)
    expect(s.different).toEqual(['relationship:serves'])
    expect(s.res.items.find((i) => i.refKey === 'relationship:serves')!.message).toContain('optional vs mandatory')
  })

  it('an empty model: everything missing, score 0', () => {
    const ref = buildRideHailing()
    const m = buildRideHailing()
    for (const e of [...m.entities]) removeEntity(m, e.id)
    const s = summary(m, ref)
    expect(s.res.score).toBe(0)
    expect(s.res.counts.missing).toBe(ref.entities.length + ref.relationships.length)
  })
})

describe('seeded models — Library (a student build)', () => {
  /** The student build from the trainer: Book_Author instead of the plain M:N, own spellings of attributes. */
  function studentLibrary(mins: { author: Cardinality; book: Cardinality }) {
    const m = buildLibrary()
    removeRelationship(m, rel(m, 'writes').id)
    const book = ent(m, 'Book')
    for (const [from, to] of [['title', 'Name'], ['pub_year', 'Publication_year']]) book.attributes.find((a) => a.name === from)!.name = to
    const isbn = book.attributes.find((a) => a.name === 'isbn')!
    setAttributeInPrimary(m, book.id, book.attributes.find((a) => a.name === 'book_id')!.id, false)
    setAttributeInPrimary(m, book.id, isbn.id, true)
    isbn.name = 'ISBN'
    ent(m, 'Publisher').attributes.find((a) => a.name === 'name')!.name = 'Pname'
    ent(m, 'Member').attributes.find((a) => a.name === 'card_no')!.name = 'Card_number'
    const ba = addEntity(m, { name: 'Book_Author' })
    const toBook = addRelationship(m, book.id, ba.id, { name: 'Books_Entity', cardinalityB: mins.author })
    const toAuthor = addRelationship(m, ent(m, 'Author').id, ba.id, { name: 'Authors_Entity', cardinalityB: mins.book })
    setDependentSide(m, toBook.id, 'B')
    setDependentSide(m, toAuthor.id, 'B')
    return m
  }

  it('an intermediate entity for a plain many-to-many counts as the many-to-many', () => {
    const s = summary(studentLibrary({ author: CARD.oneMany, book: CARD.oneMany }), buildLibrary())
    expect(s.missing).toEqual([])
    expect(s.extra).toEqual([])
    expect(s.different).toEqual([])
    expect(s.res.items.find((i) => i.refKey === 'relationship:writes')!.message).toContain('through Book_Author ✓')
    expect(s.res.score).toBe(100)
  })

  it('…and its minimums are still compared, and “do it for me” fixes them on the two links', () => {
    const m = studentLibrary({ author: CARD.zeroMany, book: CARD.zeroMany })
    const c = CASES.find((x) => x.id === 'library')!
    const item = compareModels(m, c.build()).items.find((i) => i.refKey === 'relationship:writes')!
    expect(item.status).toBe('different')
    expect(item.message).toContain('optional vs mandatory')
    expect(item.message).toContain('an Author')
    expect(item.answer).toContain("At Book_Author's end of Books_Entity: 1,n (Authors per Book)")
    expect(applyAnswer(m, c, item)).toBe(true)
    expect(compareModels(m, c.build()).items.find((i) => i.refKey === 'relationship:writes')!.status).toBe('matched')
    expect(findEntityByName(m, 'Book_Author')).toBeDefined()
  })

  it('accepts short forms and the identifier as an attribute; a real other word is still missing', () => {
    const attr = compareModels(studentLibrary({ author: CARD.oneMany, book: CARD.oneMany }), buildLibrary()).items.filter((i) => i.kind === 'attribute')
    expect(attr.map((i) => i.answer)).toEqual(['Book has title.'])
  })
  it('mandatory (M): “must” from the reference, “may be empty” only where the case says why', () => {
    const m = studentLibrary({ author: CARD.oneMany, book: CARD.oneMany })
    const attr = (e: string, a: string) => ent(m, e).attributes.find((x) => x.name === a)!
    attr('Publisher', 'Pname').mandatory = false
    attr('Loan', 'return_date').mandatory = true
    attr('Author', 'birth_year').mandatory = true // the reference did not decide: accepted
    const c = CASES.find((x) => x.id === 'library')!
    const items = compareModels(m, c.build()).items.filter((i) => i.kind === 'mandatory')
    expect(items.map((i) => i.refKey).sort()).toEqual(['entity:Loan', 'entity:Publisher'])
    expect(items.find((i) => i.refKey === 'entity:Publisher')!.message).toContain('Pname must always have a value')
    expect(items.find((i) => i.refKey === 'entity:Loan')!.message).toContain('return_date can stay empty')
    expect(compareModels(m, c.build()).score).toBe(100) // not scored, like attributes
    for (const item of items) expect(applyAnswer(m, c, item)).toBe(true)
    expect(compareModels(m, c.build()).items.filter((i) => i.kind === 'mandatory')).toEqual([])
  })
})

describe('attribute names — a student build of Hotel', () => {
  it('accepts short forms, word forms, dates written as _on and “number of …”', () => {
    const ref = buildHotel()
    const m = buildHotel()
    const rename = (e: string, from: string, to: string) => (ent(m, e).attributes.find((a) => a.name === from)!.name = to)
    rename('Guest', 'passport_no', 'Passport_number')
    rename('Booking', 'booked_on', 'Date')
    rename('Booking', 'cancelled_on', 'Cancellation')
    rename('Booked Room', 'guests', 'guest_number')
    const missing = compareModels(m, ref).items.filter((i) => i.kind === 'attribute' && i.status === 'missing')
    expect(missing).toEqual([])
  })

  it('still reports an attribute that is really missing', () => {
    const ref = buildHotel()
    const m = buildHotel()
    ent(m, 'Room Type').attributes.find((a) => a.name === 'nightly_price')!.name = 'Price_category'
    const items = compareModels(m, ref).items.filter((i) => i.kind === 'attribute' && i.status === 'missing')
    expect(items.map((i) => i.refAttrs)).toEqual([['nightly_price']])
  })
})

describe('relationship messages — a student build of Hotel', () => {
  it('names the student entities, spots a reversed many end and asks only about the differing minimum', () => {
    const ref = buildHotel()
    const m = buildHotel()
    ent(m, 'Booked Room').name = 'Room_booking'
    const type = rel(m, 'is_of_type')
    ;[type.cardinalityA, type.cardinalityB] = [type.cardinalityB, type.cardinalityA]
    rel(m, 'includes').cardinalityB = CARD.zeroMany
    const msg = (k: string) => compareModels(m, ref).items.find((i) => i.refKey === k)!.message
    expect(msg('relationship:is_of_type')).toContain('the “many” end is on the wrong side')
    expect(msg('relationship:is_of_type')).toContain('one Room has any number of Room Type')
    expect(msg('relationship:includes')).toBe('Booking — Room_booking: the minimums differ (optional vs mandatory). Ask yourself: can a Booking have no Room_booking at all?')
  })
})

describe('alternate identifiers <ai>', () => {
  const hotel = CASES.find((c) => c.id === 'hotel') ?? MORE_CASES.find((c) => c.id === 'hotel')!
  const noAi = () => {
    const m = buildHotel()
    const g = ent(m, 'Guest')
    g.identifiers = g.identifiers.filter((i) => i.isPrimary)
    return m
  }

  it('reports a missing <ai> (not scored) and accepts it on any identifier over the same attributes', () => {
    const res = compareModels(noAi(), buildHotel())
    const alt = res.items.filter((i) => i.kind === 'alternate')
    expect(alt.map((i) => [i.status, i.refAttrs])).toEqual([['missing', ['passport_no']]])
    expect(res.score).toBe(100)
    expect(compareModels(buildHotel(), buildHotel()).items.some((i) => i.kind === 'alternate')).toBe(false)
  })

  it('waits while the attribute itself is missing', () => {
    const m = noAi()
    const g = ent(m, 'Guest')
    g.attributes = g.attributes.filter((a) => a.name !== 'passport_no')
    expect(compareModels(m, buildHotel()).items.some((i) => i.kind === 'alternate')).toBe(false)
  })

  it('“Do it for me” adds the identifier, and the coach quotes the rule', () => {
    const m = noAi()
    const item = compareModels(m, buildHotel()).items.find((i) => i.kind === 'alternate')!
    expect(applyAnswer(m, hotel, item)).toBe(true)
    expect(compareModels(m, buildHotel()).items.some((i) => i.kind === 'alternate')).toBe(false)
    expect(ent(m, 'Guest').identifiers.filter((i) => !i.isPrimary)).toHaveLength(1)
  })
})
