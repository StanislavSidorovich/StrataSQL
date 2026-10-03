// Structural comparison of a student CDM with a reference CDM — SPEC §9, trainer level 2 and 3.
// Entities are matched by name (with synonyms), attribute overlap and, in a second pass, by the
// neighbours they are linked to; never by internal ids. Relationships and inheritances are then
// compared through that matching.

import { relationshipKind } from './cdm2pdm'
import {
  formatCardinality,
  primaryIdentifier,
  type Attribute,
  type Cardinality,
  type Entity,
  type Id,
  type Inheritance,
  type Model,
  type Relationship,
} from './metamodel'

export type CompareStatus = 'matched' | 'missing' | 'extra' | 'different'
export type CompareKind = 'entity' | 'attribute' | 'identifier' | 'relationship' | 'inheritance'

export interface CompareItem {
  kind: CompareKind
  status: CompareStatus
  /** Reference element: `entity:Scene`, `relationship:has_scenes`, `inheritance:scene_kind`. Absent for extras. */
  refKey?: string
  /** Names of the reference entities the item is about (for “something is missing around …”). */
  refEntities: string[]
  /** Element of the student model to select. */
  target?: { kind: 'entity' | 'relationship' | 'inheritance'; id: Id }
  message: string
  /** The reference solution of this item in words — the last step of the hint ladder. */
  answer?: string
}

export interface CompareResult {
  items: CompareItem[]
  /** Reference entity id → student entity id. */
  entityMatch: Map<Id, Id>
  counts: Record<CompareStatus, number>
  /** 0–100: matched reference elements, a “different” one counts half. Attributes are not scored. */
  score: number
}

export interface CompareOptions {
  /** Reference entity name → other names accepted for it (case file “Synonyms”). */
  synonyms?: Record<string, string[]>
  /** `links`: entities were given (level 2) — compare only relationships and inheritances. */
  scope?: 'all' | 'links'
}

// ---------------------------------------------------------------- names

const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
/** `TV Shows` → `tvshow`, `car_shift` → `carshift`. */
export const normName = (s: string) => singular(words(s).join(''))

/** Attribute name without the entity prefix: Episode.episode_title → `title`. */
function normAttr(name: string, entityName: string): string {
  const w = words(name)
  const stem = normName(entityName)
  if (w.length > 1 && (singular(w[0]) === stem || stem.endsWith(singular(w[0])))) w.shift()
  return singular(w.join(''))
}

function ownPi(e: Entity): Set<Id> {
  return new Set(primaryIdentifier(e)?.attributeIds ?? [])
}

function plainAttrs(e: Entity): Set<string> {
  const pi = ownPi(e)
  return new Set(e.attributes.filter((a) => !pi.has(a.id)).map((a) => normAttr(a.name, e.name)))
}

/** Reference attributes (outside its own identifier) that the student entity lacks, compared by name. */
export function missingAttributes(s: Entity, r: Entity): Attribute[] {
  const have = plainAttrs(s)
  const pi = ownPi(r)
  return r.attributes.filter((a) => !pi.has(a.id) && !have.has(normAttr(a.name, r.name)))
}

/** The student attribute that stands for a reference attribute (same name without entity prefix). */
export function sameAttribute(s: Entity, r: Entity, refAttr: Attribute): Attribute | undefined {
  const want = normAttr(refAttr.name, r.name)
  return s.attributes.find((a) => normAttr(a.name, s.name) === want)
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return (2 * common) / (a.size + b.size)
}

// ---------------------------------------------------------------- entity matching

function nameScore(student: string, ref: string, synonyms: string[]): number {
  const s = normName(student)
  const names = [ref, ...synonyms].map(normName)
  if (names.includes(s)) return 1
  if (s.length >= 4 && names.some((n) => n.length >= 4 && (n.includes(s) || s.includes(n)))) return 0.6
  return 0
}

const neighbours = (m: Model, id: Id) => {
  const out = new Set<Id>()
  for (const r of m.relationships) {
    if (r.entityA === id) out.add(r.entityB)
    if (r.entityB === id) out.add(r.entityA)
  }
  for (const i of m.inheritances) {
    if (i.parentId === id) i.childIds.forEach((c) => out.add(c))
    if (i.childIds.includes(id)) out.add(i.parentId)
  }
  out.delete(id)
  return out
}

const THRESHOLD = 0.5

export function matchEntities(student: Model, ref: Model, synonyms: Record<string, string[]> = {}): Map<Id, Id> {
  const match = new Map<Id, Id>()
  const used = new Set<Id>()
  const attrs = new Map<Id, Set<string>>()
  for (const e of [...student.entities, ...ref.entities]) attrs.set(e.id, plainAttrs(e))

  const greedy = (score: (s: Entity, r: Entity) => number) => {
    const pairs: [number, Entity, Entity][] = []
    for (const r of ref.entities) {
      if (match.has(r.id)) continue
      for (const s of student.entities) {
        if (used.has(s.id)) continue
        const v = score(s, r)
        if (v >= THRESHOLD) pairs.push([v, s, r])
      }
    }
    pairs.sort((a, b) => b[0] - a[0])
    for (const [, s, r] of pairs) {
      if (match.has(r.id) || used.has(s.id)) continue
      match.set(r.id, s.id)
      used.add(s.id)
    }
  }

  const base = (s: Entity, r: Entity) => nameScore(s.name, r.name, synonyms[r.name] ?? []) + 0.8 * dice(attrs.get(s.id)!, attrs.get(r.id)!)
  greedy(base)
  // Second pass: an unmatched entity linked to the same (already matched) neighbours — e.g. an
  // intermediate entity with an unexpected name and no attributes.
  greedy((s, r) => {
    const rn = [...neighbours(ref, r.id)].map((id) => match.get(id)).filter((x): x is Id => !!x)
    const sn = neighbours(student, s.id)
    if (rn.length < 2) return base(s, r)
    return base(s, r) + 0.6 * dice(new Set(rn), sn)
  })
  return match
}

// ---------------------------------------------------------------- comparison

interface Ctx {
  student: Model
  ref: Model
  match: Map<Id, Id>
  /** student id → reference id */
  back: Map<Id, Id>
  sName: (id: Id) => string
  rName: (id: Id) => string
}

/** Relationship in the reference's words: `TVShow 1,1 — 1,n Episode, Episode depends on TVShow`. */
export function describeRelationship(r: Relationship, name: (id: Id) => string): string {
  const a = name(r.entityA)
  const b = name(r.entityB)
  let s = `${a} ${formatCardinality(r.cardinalityA)} — ${formatCardinality(r.cardinalityB)} ${b}`
  if (r.dependentSide) s += `, ${r.dependentSide === 'A' ? a : b} depends on ${r.dependentSide === 'A' ? b : a}`
  const roles = [r.roleA && `${a} as “${r.roleA}”`, r.roleB && `${b} as “${r.roleB}”`].filter(Boolean)
  if (roles.length) s += ` (roles: ${roles.join(', ')})`
  return s
}

function describeInheritance(i: Inheritance, name: (id: Id) => string): string {
  return (
    `${i.childIds.map(name).join(', ')} inherit from ${name(i.parentId)} — ` +
    `${i.mutuallyExclusive ? 'exclusive' : 'not exclusive'}, ${i.complete ? 'complete' : 'incomplete'}`
  )
}

const sameCard = (a: Cardinality, b: Cardinality) => a.min === b.min && a.max === b.max

/** The student relationship seen in the reference orientation (A ↔ A). */
function oriented(s: Relationship, refA: Id, ctx: Ctx) {
  const flip = s.entityA !== ctx.match.get(refA)
  return {
    cardA: flip ? s.cardinalityB : s.cardinalityA,
    cardB: flip ? s.cardinalityA : s.cardinalityB,
    dep: s.dependentSide ? ((s.dependentSide === 'A') !== flip ? 'A' : 'B') : null,
  }
}

function relDiffs(r: Relationship, s: Relationship, ctx: Ctx): string[] {
  const o = oriented(s, r.entityA, ctx)
  const a = ctx.rName(r.entityA)
  const b = ctx.rName(r.entityB)
  const out: string[] = []
  if (!sameCard(o.cardA, r.cardinalityA) || !sameCard(o.cardB, r.cardinalityB)) {
    const maxDiff = o.cardA.max !== r.cardinalityA.max || o.cardB.max !== r.cardinalityB.max
    out.push(
      maxDiff
        ? `the kind of link differs — you have ${relationshipKind({ ...s, cardinalityA: o.cardA, cardinalityB: o.cardB }).replace(/-/g, ' ')}, ` +
            `the text implies ${relationshipKind(r).replace(/-/g, ' ')}. Read again how many ${b} one ${a} has, and how many ${a} one ${b} has.`
        : `the minimums differ (optional vs mandatory): ask whether a ${b} can exist without a ${a}, and a ${a} without a ${b}.`,
    )
  }
  if (o.dep !== r.dependentSide) {
    if (r.dependentSide) {
      const child = r.dependentSide === 'A' ? a : b
      const parent = r.dependentSide === 'A' ? b : a
      out.push(`${child} should be identified through ${parent} (dependent relationship).`)
    } else out.push(`it should not be a dependent relationship: both entities have their own identity here.`)
  }
  return out
}

export function compareModels(student: Model, ref: Model, opts: CompareOptions = {}): CompareResult {
  const match = matchEntities(student, ref, opts.synonyms)
  const back = new Map([...match].map(([r, s]) => [s, r]))
  const sById = new Map(student.entities.map((e) => [e.id, e]))
  const rById = new Map(ref.entities.map((e) => [e.id, e]))
  const ctx: Ctx = {
    student,
    ref,
    match,
    back,
    sName: (id) => sById.get(id)?.name ?? '?',
    rName: (id) => rById.get(id)?.name ?? '?',
  }
  const items: CompareItem[] = []
  const links = opts.scope === 'links'

  // Entities, their identifiers and attributes.
  if (!links) {
    for (const r of ref.entities) {
      const sid = match.get(r.id)
      const key = `entity:${r.name}`
      if (!sid) {
        items.push({ kind: 'entity', status: 'missing', refKey: key, refEntities: [r.name], message: `An entity is missing (the reference calls it ${r.name}).`, answer: entityAnswer(r, ref) })
        continue
      }
      const s = sById.get(sid)!
      const label = s.name === r.name ? s.name : `${s.name} (reference: ${r.name})`
      items.push({ kind: 'entity', status: 'matched', refKey: key, refEntities: [r.name], target: { kind: 'entity', id: s.id }, message: `${label} ✓` })
      const isChild = ref.inheritances.some((i) => i.childIds.includes(r.id))
      const rHas = ownPi(r).size > 0
      const sHas = ownPi(s).size > 0
      if (!isChild && rHas !== sHas)
        items.push({
          kind: 'identifier',
          status: 'different',
          refKey: key,
          refEntities: [r.name],
          target: { kind: 'entity', id: s.id },
          message: rHas
            ? `${s.name} needs its own identifier attribute: ${r.name} instances repeat for the same parents, or it is identified by its own number.`
            : `${s.name} should have no own identifier — it is identified only by the entities it depends on (one row per combination).`,
          answer: rHas ? `${r.name} has its own identifier: ${piNames(r).join(', ')}.` : `${r.name} has no own identifier; its key comes from its parents.`,
        })
      const missingAttrs = missingAttributes(s, r)
      if (missingAttrs.length)
        items.push({
          kind: 'attribute',
          status: 'missing',
          refKey: key,
          refEntities: [r.name],
          target: { kind: 'entity', id: s.id },
          message: `${s.name}: ${missingAttrs.length} attribute${missingAttrs.length > 1 ? 's' : ''} from the text not found.`,
          answer: `${r.name} has ${missingAttrs.map((a) => a.name).join(', ')}.`,
        })
    }
    for (const s of student.entities)
      if (!back.has(s.id))
        items.push({
          kind: 'entity',
          status: 'extra',
          refEntities: [],
          target: { kind: 'entity', id: s.id },
          message: `${s.name} is not in the reference. Fine if the text supports it (inventing details is allowed), otherwise remove it.`,
        })
  }

  // Relationships.
  const usedRels = new Set<Id>()
  for (const r of ref.relationships) {
    const key = `relationship:${r.name}`
    const names = [ctx.rName(r.entityA), ctx.rName(r.entityB)]
    const sa = match.get(r.entityA)
    const sb = match.get(r.entityB)
    const answer = describeRelationship(r, ctx.rName)
    if (!sa || !sb) {
      items.push({ kind: 'relationship', status: 'missing', refKey: key, refEntities: names, message: `A relationship of ${names.join(' and ')} is missing (one of the entities is missing too).`, answer })
      continue
    }
    const candidates = student.relationships.filter(
      (s) => !usedRels.has(s.id) && ((s.entityA === sa && s.entityB === sb) || (s.entityA === sb && s.entityB === sa)),
    )
    const best = candidates.sort((x, y) => relDiffs(r, x, ctx).length - relDiffs(r, y, ctx).length)[0]
    if (!best) {
      items.push({ kind: 'relationship', status: 'missing', refKey: key, refEntities: names, message: `Something is missing between ${ctx.sName(sa)} and ${ctx.sName(sb)}.`, answer })
      continue
    }
    usedRels.add(best.id)
    const diffs = relDiffs(r, best, ctx)
    const label = `${ctx.sName(sa)} — ${ctx.sName(sb)}`
    items.push(
      diffs.length
        ? { kind: 'relationship', status: 'different', refKey: key, refEntities: names, target: { kind: 'relationship', id: best.id }, message: `${label}: ${diffs.join(' ')}`, answer }
        : { kind: 'relationship', status: 'matched', refKey: key, refEntities: names, target: { kind: 'relationship', id: best.id }, message: `${label} ✓` },
    )
  }
  for (const s of student.relationships) {
    if (usedRels.has(s.id)) continue
    const ra = back.get(s.entityA)
    const rb = back.get(s.entityB)
    let message = `${ctx.sName(s.entityA)} — ${ctx.sName(s.entityB)} is not in the reference.`
    // A many-to-many where the reference has an intermediate entity depending on both ends.
    const inter =
      ra && rb && relationshipKind(s) === 'many-to-many'
        ? ref.entities.find((e) => {
            const parents = ref.relationships.filter((r) => r.dependentSide && (r.dependentSide === 'A' ? r.entityA : r.entityB) === e.id).map((r) => (r.dependentSide === 'A' ? r.entityB : r.entityA))
            return parents.includes(ra) && parents.includes(rb)
          })
        : undefined
    if (inter) message += ` The pair carries data or must be referenced: the reference uses an intermediate entity (${inter.name}) that depends on both.`
    else if (ra && rb) message += ' Check that this path does not duplicate another one (a cycle) and that the text asks for it.'
    items.push({ kind: 'relationship', status: 'extra', refEntities: [ra, rb].filter((x): x is Id => !!x).map(ctx.rName), target: { kind: 'relationship', id: s.id }, message })
  }

  // Inheritances.
  const usedInh = new Set<Id>()
  for (const r of ref.inheritances) {
    const key = `inheritance:${r.name}`
    const names = [ctx.rName(r.parentId), ...r.childIds.map(ctx.rName)]
    const answer = describeInheritance(r, ctx.rName)
    const sp = match.get(r.parentId)
    const s = student.inheritances.find((i) => !usedInh.has(i.id) && i.parentId === sp)
    if (!sp || !s) {
      items.push({ kind: 'inheritance', status: 'missing', refKey: key, refEntities: names, message: `An inheritance is missing around ${ctx.rName(r.parentId)}.`, answer })
      continue
    }
    usedInh.add(s.id)
    const diffs: string[] = []
    const want = r.childIds.map((c) => match.get(c))
    const missingKids = r.childIds.filter((_, k) => !want[k] || !s.childIds.includes(want[k]!))
    const extraKids = s.childIds.filter((c) => !want.includes(c))
    if (missingKids.length) diffs.push(`children missing: ${missingKids.map(ctx.rName).join(', ')}.`)
    if (extraKids.length) diffs.push(`not children in the reference: ${extraKids.map(ctx.sName).join(', ')}.`)
    if (s.mutuallyExclusive !== r.mutuallyExclusive)
      diffs.push(r.mutuallyExclusive ? 'an instance can be only one of the children → exclusive.' : 'the same instance can be several children at once → not exclusive.')
    if (s.complete !== r.complete) diffs.push(r.complete ? 'every instance is one of the children → complete.' : 'some instances are none of the children → incomplete.')
    items.push(
      diffs.length
        ? { kind: 'inheritance', status: 'different', refKey: key, refEntities: names, target: { kind: 'inheritance', id: s.id }, message: `Inheritance of ${ctx.sName(s.parentId)}: ${diffs.join(' ')}`, answer }
        : { kind: 'inheritance', status: 'matched', refKey: key, refEntities: names, target: { kind: 'inheritance', id: s.id }, message: `Inheritance of ${ctx.sName(s.parentId)} ✓` },
    )
  }
  for (const s of student.inheritances)
    if (!usedInh.has(s.id))
      items.push({ kind: 'inheritance', status: 'extra', refEntities: [], target: { kind: 'inheritance', id: s.id }, message: `The inheritance of ${ctx.sName(s.parentId)} is not in the reference.` })

  const counts: Record<CompareStatus, number> = { matched: 0, missing: 0, extra: 0, different: 0 }
  let got = 0
  let total = 0
  for (const i of items) {
    counts[i.status]++
    if (i.kind === 'attribute' || i.kind === 'identifier' || i.status === 'extra') continue
    total++
    if (i.status === 'matched') got++
  }
  // Each different item replaces a matched one, so it is half a point.
  got += items.filter((i) => i.status === 'different' && (i.kind === 'relationship' || i.kind === 'inheritance')).length / 2
  // A wrong identifier costs half of its entity.
  got -= items.filter((i) => i.kind === 'identifier').length / 2
  const order: Record<CompareStatus, number> = { missing: 0, different: 1, extra: 2, matched: 3 }
  items.sort((a, b) => order[a.status] - order[b.status])
  return { items, entityMatch: match, counts, score: total ? Math.max(0, Math.round((100 * got) / total)) : 100 }
}

function piNames(e: Entity): string[] {
  const pi = ownPi(e)
  return e.attributes.filter((a) => pi.has(a.id)).map((a) => a.name)
}

function entityAnswer(e: Entity, m: Model): string {
  const pi = piNames(e)
  const others = e.attributes.filter((a) => !pi.includes(a.name)).map((a) => a.name)
  const parents = m.relationships
    .filter((r) => r.dependentSide && (r.dependentSide === 'A' ? r.entityA : r.entityB) === e.id)
    .map((r) => m.entities.find((x) => x.id === (r.dependentSide === 'A' ? r.entityB : r.entityA))?.name)
  const parts = [`${e.name}`]
  if (pi.length) parts.push(`identifier ${pi.join(', ')}`)
  if (others.length) parts.push(`attributes ${others.join(', ')}`)
  if (parents.length) parts.push(`depends on ${parents.join(' and ')}`)
  if (!pi.length && !others.length && !parents.length) parts.push('no own attributes')
  return parts.join(' · ')
}
