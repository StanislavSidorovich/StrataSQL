// “Build it with me” (stage 5c): the next thing to add to a trainer model, and a hint ladder for it.
// The comparator says what is missing or different; the walkthrough order of the case says which of
// those comes first (entities before their links, the starter case's attributes before identifiers).
// `applyAnswer` (“do it for me”) copies that one element of the reference into the student model.

import { compareModels, missingAttributes, sameAttribute, type CompareItem, type CompareResult } from '../core/compare'
import { type Attribute, type Cardinality, type Entity, type Id, type Model, primaryIdentifier } from '../core/metamodel'
import {
  addAttribute,
  addDomain,
  addEntity,
  addIdentifier,
  addInheritance,
  addInheritanceChild,
  addPhysicalKey,
  addRelationship,
  inheritanceOfChild,
  removeAttribute,
  removeIdentifier,
  removeInheritanceChild,
  setDependentSide,
  setForeignKeySide,
  swapRelationshipSides,
  uniqueName,
  updateInheritance,
  updateRelationship,
} from '../core/ops'
import { hintsFor, type TrainerCase } from './cases'
import type { Level } from './trainer'
import { walkthroughSteps } from './walkthrough'

/** A comparator item, or the walkthrough's last modeling step: rules that become keys. */
export type CoachItem = CompareItem | KeysItem

export interface KeysItem {
  kind: 'keys'
  status: 'missing'
  refKey: string
  refEntities: string[]
  target?: { kind: 'entity'; id: Id }
  message: string
  answer: string
}

export interface Rung {
  label: 'What' | 'Where' | 'Why' | 'Answer'
  text: string
}

export interface Coaching {
  item: CoachItem
  /** Stable key of the item, for counting the hint steps shown. */
  key: string
  rungs: Rung[]
  /** Phrases of the text (indices into `case.spans`) the hint points at, from the “Where” rung on. */
  spans: number[]
}

export interface CoachState {
  result: CompareResult
  /** The next item to work on, or null when everything of the reference is in the model. */
  next: Coaching | null
  /** Items that are left to do (missing or different), next one included. */
  todo: number
}

export const coachKey = (item: CoachItem) => `${item.kind}|${item.refKey ?? item.message}`

const KIND_ORDER: Record<CoachItem['kind'], number> = { entity: 0, attribute: 1, identifier: 2, relationship: 3, inheritance: 3, keys: 4 }

const orderCache = new Map<string, Map<string, number>>()
/** Walkthrough step key → index, per case. */
function stepRank(c: TrainerCase): Map<string, number> {
  let rank = orderCache.get(c.id)
  if (!rank) orderCache.set(c.id, (rank = new Map(walkthroughSteps(c).map((s, i) => [s.key, i]))))
  return rank
}

function itemRank(item: CoachItem, rank: Map<string, number>): number {
  const key = item.refKey ?? ''
  const entity = key.startsWith('entity:') ? key.slice('entity:'.length) : ''
  const r =
    item.kind === 'attribute'
      ? rank.get(`attributes:${entity}`) ?? rank.get(key)
      : item.kind === 'identifier'
        ? rank.get(`identifier:${entity}`) ?? rank.get(key)
        : rank.get(key)
  return r ?? Number.MAX_SAFE_INTEGER
}

/** Physical keys (UNIQUE over migrated columns) of the reference the student entity lacks. */
function missingKeys(student: Model, ref: Model, match: Map<Id, Id>): KeysItem[] {
  const out: KeysItem[] = []
  const norm = (cols: string[]) => cols.map((c) => c.toLowerCase()).sort().join(',')
  for (const r of ref.entities) {
    const s = student.entities.find((e) => e.id === match.get(r.id))
    if (!s || !r.physicalKeys?.length) continue
    const have = new Set((s.physicalKeys ?? []).map((k) => norm(k.columns)))
    const lacking = r.physicalKeys.filter((k) => !have.has(norm(k.columns)))
    if (lacking.length)
      out.push({
        kind: 'keys',
        status: 'missing',
        refKey: `keys:${r.name}`,
        refEntities: [r.name],
        target: { kind: 'entity', id: s.id },
        message: `${s.name}: some rules of the text are still not enforced. They become UNIQUE keys over the table's columns (Physical view → keys over columns).`,
        answer: lacking.map((k) => `${k.name} = UNIQUE (${k.columns.join(', ')})`).join('; '),
      })
  }
  return out
}

/** Spans of the text about an item. */
function spansFor(c: TrainerCase, item: CoachItem): number[] {
  const key = item.refKey
  if (!key) return []
  const entity = item.refEntities[0]
  const about = (pred: (target: string, i: number) => boolean) =>
    c.spans.map((s, i) => (s.target && pred(s.target, i) ? i : -1)).filter((i) => i >= 0)
  switch (item.kind) {
    case 'entity':
      return about((t) => t === key || t.startsWith(`attribute:${entity}.`))
    case 'attribute':
      return about((t, i) => t.startsWith(`attribute:${entity}.`) && c.spans[i].step !== 'identifier')
    case 'identifier': {
      const own = about((t, i) => (t === key || t.startsWith(`attribute:${entity}.`)) && c.spans[i].step === 'identifier')
      return own.length ? own : about((t) => t === key)
    }
    case 'keys':
      return about((t, i) => c.spans[i].tag === 'rule' && (t === `entity:${entity}` || t.startsWith(`attribute:${entity}.`)))
    default:
      return about((t) => t === key)
  }
}

function coaching(c: TrainerCase, item: CoachItem, student: Model): Coaching {
  const spans = spansFor(c, item)
  const rungs: Rung[] = []
  // What: the comparator's message, except for a missing entity, whose message names the answer.
  if (item.kind === 'entity' && item.status === 'missing') {
    const near = item.refEntities.length ? neighboursInStudent(c, item.refEntities[0], student) : []
    // A freshly drawn entity still has the default name: the student has started this step already.
    const unnamed = student.entities.find((e) => /^Entity(_\d+)?$/.test(e.name))
    rungs.push({
      label: 'What',
      text: unnamed
        ? `Your new entity is still called “${unnamed.name}”: rename it after a thing the text talks about that your model does not have yet.${near.length ? ` It is linked to ${near.join(' and ')}.` : ''}`
        : `Add an entity: the text talks about a thing your model does not have yet.${near.length ? ` It is linked to ${near.join(' and ')}.` : ''}`,
    })
  } else rungs.push({ label: 'What', text: item.message })
  const caseHints = item.kind === 'keys' ? [] : hintsFor(c, item.refKey, item.refEntities)
  if (spans.length || caseHints.length)
    rungs.push({
      label: 'Where',
      text: [spans.length ? `Read the words ${spans.map((i) => `“${c.spans[i].phrase}”`).join(', ')} (marked in the text).` : '', ...caseHints].filter(Boolean).join(' '),
    })
  // For an entity, the reasons about the entity itself; its attributes' reasons come with them.
  const main = item.kind === 'entity' ? spans.filter((i) => c.spans[i].target === item.refKey) : []
  const why = [...new Set((main.length ? main : spans).map((i) => c.spans[i].why))]
  if (why.length) rungs.push({ label: 'Why', text: why.join(' ') })
  if (item.answer) rungs.push({ label: 'Answer', text: item.answer })
  return { item, key: coachKey(item), rungs, spans }
}

/** Names (in the student model) of the entities a reference entity is linked to. */
function neighboursInStudent(c: TrainerCase, refName: string, student: Model): string[] {
  const ref = c.build()
  const r = ref.entities.find((e) => e.name === refName)
  if (!r) return []
  const match = compareModels(student, ref, { synonyms: c.synonyms }).entityMatch
  const ids = new Set<Id>()
  for (const x of ref.relationships) {
    if (x.entityA === r.id) ids.add(x.entityB)
    if (x.entityB === r.id) ids.add(x.entityA)
  }
  return [...ids].map((id) => student.entities.find((e) => e.id === match.get(id))?.name).filter((n): n is string => !!n)
}

const refCache = new Map<string, Model>()
export function referenceOf(c: TrainerCase): Model {
  let m = refCache.get(c.id)
  if (!m) refCache.set(c.id, (m = c.build()))
  return m
}

/** What to do next in a level 2 or 3 task. */
export function coach(c: TrainerCase, student: Model, level: Level): CoachState {
  const ref = referenceOf(c)
  const result = compareModels(student, ref, { synonyms: c.synonyms, scope: level === 2 ? 'links' : 'all' })
  const rank = stepRank(c)
  const todo: CoachItem[] = result.items.filter((i) => i.status === 'missing' || i.status === 'different')
  // Keys come last, once everything they are built from is in place.
  if (!todo.length) todo.push(...missingKeys(student, ref, result.entityMatch))
  todo.sort((a, b) => itemRank(a, rank) - itemRank(b, rank) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  return { result, next: todo.length ? coaching(c, todo[0], student) : null, todo: todo.length }
}

// ---------------------------------------------------------------- do it for me

/** Copies a reference attribute into a student entity (with its domain, by name). */
function copyAttribute(m: Model, ref: Model, entityId: Id, a: Attribute): Attribute {
  let domainId: Id | undefined
  if (a.domainId) {
    const d = ref.domains.find((x) => x.id === a.domainId)
    if (d) domainId = (m.domains.find((x) => x.name === d.name) ?? addDomain(m, { name: d.name, dataType: d.dataType, length: d.length, precision: d.precision })).id
  }
  const e = m.entities.find((x) => x.id === entityId)!
  return addAttribute(m, entityId, {
    name: uniqueName(a.name, e.attributes.map((x) => x.name)),
    dataType: a.dataType,
    length: a.length,
    precision: a.precision,
    domainId,
    mandatory: a.mandatory,
  })
}

/** A free spot near the reference position (entity boxes are about 200 × 140). */
function freeSpot(m: Model, want: { x: number; y: number }) {
  const p = { ...want }
  while (m.entities.some((e) => Math.abs(e.position.x - p.x) < 220 && Math.abs(e.position.y - p.y) < 140)) p.x += 240
  return p
}

/** Moves a child out of another inheritance, so it can join the right one. */
function freeChild(m: Model, childId: Id, keep?: Id) {
  const other = inheritanceOfChild(m, childId)
  if (other && other.id !== keep) removeInheritanceChild(m, other.id, childId)
}

/**
 * “Do it for me”: makes one coached item match the reference. Mutates `m` (an immer draft in the
 * editor). Returns false when the item cannot be applied (e.g. a link whose entities are missing).
 */
export function applyAnswer(m: Model, c: TrainerCase, item: CoachItem): boolean {
  const ref = referenceOf(c)
  const match = compareModels(m, ref, { synonyms: c.synonyms }).entityMatch
  const rEntity = (name: string) => ref.entities.find((e) => e.name === name)
  const sEntity = (refId: Id): Entity | undefined => m.entities.find((e) => e.id === match.get(refId))
  const key = item.refKey ?? ''
  const rest = key.slice(key.indexOf(':') + 1)

  if (item.kind === 'entity' && item.status === 'missing') {
    const r = rEntity(rest)
    if (!r) return false
    const e = addEntity(m, { name: r.name, position: freeSpot(m, r.position) })
    const ids = new Map<Id, Id>()
    for (const a of r.attributes) ids.set(a.id, copyAttribute(m, ref, e.id, a).id)
    for (const i of r.identifiers) addIdentifier(m, e.id, { name: i.name, isPrimary: i.isPrimary, attributeIds: i.attributeIds.map((a) => ids.get(a)!) })
    return true
  }

  if (item.kind === 'attribute') {
    const r = rEntity(rest)
    const s = r && sEntity(r.id)
    if (!r || !s) return false
    for (const a of missingAttributes(s, r)) copyAttribute(m, ref, s.id, a)
    return true
  }

  if (item.kind === 'identifier') {
    const r = rEntity(rest)
    const s = r && sEntity(r.id)
    if (!r || !s) return false
    const old = primaryIdentifier(s)
    const rPi = primaryIdentifier(r)
    if (old) removeIdentifier(m, s.id, old.id)
    if (rPi) {
      const attrs = rPi.attributeIds.map((id) => {
        const ra = r.attributes.find((a) => a.id === id)!
        return (sameAttribute(s, r, ra) ?? copyAttribute(m, ref, s.id, ra)).id
      })
      addIdentifier(m, s.id, { name: rPi.name, isPrimary: true, attributeIds: attrs })
    } else if (old) {
      // The own id goes: attributes that were only the identifier and are not facts of the reference.
      for (const id of old.attributeIds) {
        const a = s.attributes.find((x) => x.id === id)
        if (a && !r.attributes.some((ra) => sameAttribute(s, r, ra)?.id === id)) removeAttribute(m, s.id, id)
      }
    }
    return true
  }

  if (item.kind === 'relationship') {
    const r = ref.relationships.find((x) => x.name === rest)
    const sa = r && sEntity(r.entityA)
    const sb = r && sEntity(r.entityB)
    if (!r || !sa || !sb) return false
    if (item.bridge) {
      // The student's intermediate entity stays; only the cards at its ends follow the reference.
      const { entity, toA, toB } = item.bridge
      const atEntity = (id: Id, card: Cardinality) => {
        const s = m.relationships.find((x) => x.id === id)
        if (s) updateRelationship(m, id, s.entityA === entity ? { cardinalityA: card } : { cardinalityB: card })
      }
      atEntity(toB, r.cardinalityA)
      atEntity(toA, r.cardinalityB)
      return true
    }
    let s = item.status === 'different' && item.target ? m.relationships.find((x) => x.id === item.target!.id) : undefined
    if (!s) s = addRelationship(m, sa.id, sb.id, { name: uniqueName(r.name, m.relationships.map((x) => x.name)) })
    // Reflexive links keep their orientation; otherwise A is the reference's A.
    if (s.entityA !== sa.id && sa.id !== sb.id) swapRelationshipSides(m, s.id)
    updateRelationship(m, s.id, { cardinalityA: r.cardinalityA, cardinalityB: r.cardinalityB, roleA: r.roleA, roleB: r.roleB })
    setDependentSide(m, s.id, r.dependentSide)
    if (r.foreignKeySide) setForeignKeySide(m, s.id, r.foreignKeySide)
    return true
  }

  if (item.kind === 'inheritance') {
    const r = ref.inheritances.find((x) => x.name === rest)
    const sp = r && sEntity(r.parentId)
    if (!r || !sp) return false
    const kids = r.childIds.map((id) => sEntity(id)?.id).filter((x): x is Id => !!x)
    let s = m.inheritances.find((i) => i.parentId === sp.id)
    if (!s) {
      kids.forEach((k) => freeChild(m, k))
      s = addInheritance(m, sp.id, kids, { name: r.name, mutuallyExclusive: r.mutuallyExclusive, complete: r.complete, generation: r.generation, position: r.position })
      return true
    }
    const inh = s
    for (const k of kids)
      if (!inh.childIds.includes(k)) {
        freeChild(m, k, inh.id)
        addInheritanceChild(m, inh.id, k)
      }
    updateInheritance(m, inh.id, { mutuallyExclusive: r.mutuallyExclusive, complete: r.complete, generation: r.generation })
    for (const k of [...inh.childIds]) if (!kids.includes(k)) removeInheritanceChild(m, inh.id, k)
    return true
  }

  if (item.kind === 'keys') {
    const r = rEntity(rest)
    const s = r && sEntity(r.id)
    if (!r || !s) return false
    const norm = (cols: string[]) => cols.map((x) => x.toLowerCase()).sort().join(',')
    for (const k of r.physicalKeys ?? [])
      if (!(s.physicalKeys ?? []).some((x) => norm(x.columns) === norm(k.columns))) addPhysicalKey(m, s.id, { name: k.name, columns: k.columns })
    return true
  }
  return false
}
