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
  type Identifier,
  type Inheritance,
  type Model,
  type Relationship,
} from './metamodel'

export type CompareStatus = 'matched' | 'missing' | 'extra' | 'different'
export type CompareKind = 'entity' | 'attribute' | 'mandatory' | 'identifier' | 'alternate' | 'duplicate' | 'relationship' | 'inheritance'

export interface CompareItem {
  kind: CompareKind
  status: CompareStatus
  /** Reference element: `entity:Scene`, `relationship:has_scenes`, `inheritance:scene_kind`. Absent for extras. */
  refKey?: string
  /** Names of the reference entities the item is about (for “something is missing around …”). */
  refEntities: string[]
  /** Missing attributes: their reference names (the text's phrases for them make the hint). */
  refAttrs?: string[]
  /** Element of the student model to select. */
  target?: { kind: 'entity' | 'relationship' | 'inheritance'; id: Id }
  message: string
  /** The reference solution of this item in words — the last step of the hint ladder. */
  answer?: string
  /** A reference many-to-many that the student drew as an intermediate entity: its two links. */
  bridge?: Bridge
}

/** An intermediate entity standing for a plain many-to-many: `toA` links it to the reference's A, `toB` to B. */
export interface Bridge {
  entity: Id
  toA: Id
  toB: Id
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

/** Usual short forms of a word: `no` / `nr` / `num` → `number`, `qty` → `quantity`. */
const ABBR: Record<string, string> = { no: 'number', nr: 'number', num: 'number', qty: 'quantity', desc: 'description', addr: 'address', tel: 'phone' }

/**
 * One word reduced to its stem, so that the forms of a word meet: `booked` / `booking` → `book`,
 * `cancelled` / `cancellation` → `cancel`. Both sides are stemmed the same way.
 */
function stem(w: string): string {
  w = singular(ABBR[w] ?? w)
  const cut = w.match(/^(.{4,}?)(?:ation|ing|ed)$/)
  if (cut) w = cut[1]
  return w.length > 3 && /([b-df-hj-np-tv-z])$/.test(w) ? w.slice(0, -1) : w
}

/** A date written as `…_on` / `…_at`: `booked_on` ~ `booking_date`. */
const DATE_WORDS = new Set(['on', 'at'])
/** Words that only say “how many”: `guest_number` ~ `guests` (the number of guests). */
const COUNT_WORDS = new Set(['number', 'count', 'quantity'])

/** Words of an attribute name without the entity prefix: Episode.episode_title → [`title`]. */
function attrWords(name: string, entityName: string): string[] {
  const w = words(name).map(stem)
  if (w.length > 1 && DATE_WORDS.has(w[w.length - 1])) w[w.length - 1] = 'date'
  const ent = normName(entityName)
  if (w.length > 1 && (w[0] === stem(ent) || ent.endsWith(w[0]))) w.shift()
  return w
}

/** Attribute name without the entity prefix: Episode.episode_title → `title`. */
function normAttr(name: string, entityName: string): string {
  return attrWords(name, entityName).join('')
}

const shortFor = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))

/** The same words once one side drops a word the other one leaves implied (`date`, `number`). */
function sameUpTo(a: string[], b: string[], implied: Set<string>): boolean {
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  if (long.length !== short.length + 1 || short.length === 0) return false
  const rest = long.filter((w) => !implied.has(w))
  return rest.length === short.length && rest.every((w, k) => shortFor(w, short[k]))
}

/**
 * Same attribute up to the entity prefix and usual short forms: `pub_year` ~ `Publication_year`,
 * `card_no` ~ `Card_number`, `name` ~ `Pname` (the entity's initial glued on), `booked_on` ~ `Date`
 * of Booking, `cancelled_on` ~ `Cancellation`, `guests` ~ `guest_number`.
 */
function sameAttrName(sName: string, sEntity: string, rName: string, rEntity: string): boolean {
  const a = normAttr(sName, sEntity)
  const b = normAttr(rName, rEntity)
  if (a === b) return true
  const wa = attrWords(sName, sEntity)
  const wb = attrWords(rName, rEntity)
  if (wa.length === wb.length && wa.every((w, k) => shortFor(w, wb[k]))) return true
  if (sameUpTo(wa, wb, new Set(['date'])) || sameUpTo(wa, wb, COUNT_WORDS)) return true
  return a === normName(sEntity)[0] + b || b === normName(rEntity)[0] + a
}

function ownPi(e: Entity): Set<Id> {
  return new Set(primaryIdentifier(e)?.attributeIds ?? [])
}

function plainAttrs(e: Entity): Set<string> {
  const pi = ownPi(e)
  return new Set(e.attributes.filter((a) => !pi.has(a.id)).map((a) => normAttr(a.name, e.name)))
}

/**
 * Reference attributes (outside its own identifier) that the student entity lacks, compared by name.
 * Any student attribute counts, its identifier too: ISBN chosen as the primary identifier is still the ISBN.
 */
export function missingAttributes(s: Entity, r: Entity): Attribute[] {
  const pi = ownPi(r)
  return r.attributes.filter((a) => !pi.has(a.id) && !sameAttribute(s, r, a))
}

/** The student attribute that stands for a reference attribute (same name without entity prefix, or a short form). */
export function sameAttribute(s: Entity, r: Entity, refAttr: Attribute): Attribute | undefined {
  const want = normAttr(refAttr.name, r.name)
  return s.attributes.find((a) => normAttr(a.name, s.name) === want) ?? s.attributes.find((a) => sameAttrName(a.name, s.name, refAttr.name, r.name))
}

/**
 * Mandatory (M) that differs from the reference, for attributes the student has. A reference
 * attribute is “must” when it is mandatory; “may be empty” only when the case says why it is
 * optional (its comment, e.g. return_date “NULL while the book is out”) — elsewhere the reference
 * just did not decide, and the student's M is accepted.
 */
export function mandatoryDiffs(s: Entity, r: Entity): { must: Attribute[]; mayBeEmpty: Attribute[] } {
  const pi = ownPi(r)
  const sPi = ownPi(s)
  const must: Attribute[] = []
  const mayBeEmpty: Attribute[] = []
  for (const ra of r.attributes) {
    if (pi.has(ra.id)) continue
    const sa = sameAttribute(s, r, ra)
    if (!sa || sPi.has(sa.id)) continue
    if (ra.mandatory && !sa.mandatory) must.push(sa)
    else if (!ra.mandatory && ra.comment && sa.mandatory) mayBeEmpty.push(sa)
  }
  return { must, mayBeEmpty }
}

/**
 * Alternate identifiers <ai> of the reference (a value that never repeats: passport_no, email) that
 * the student has not declared. Any student identifier over the same attributes counts, the primary
 * one too. Skipped while one of its attributes is missing (that is reported as a missing attribute).
 */
export function missingAlternates(s: Entity, r: Entity): { ref: Identifier; attrs: Attribute[] }[] {
  const out: { ref: Identifier; attrs: Attribute[] }[] = []
  const key = (ids: Id[]) => [...ids].sort().join(',')
  const have = new Set(s.identifiers.map((i) => key(i.attributeIds)))
  for (const ri of r.identifiers) {
    if (ri.isPrimary) continue
    const attrs = ri.attributeIds.map((id) => sameAttribute(s, r, r.attributes.find((a) => a.id === id)!))
    if (attrs.some((a) => !a)) continue
    if (!have.has(key(attrs.map((a) => a!.id)))) out.push({ ref: ri, attrs: attrs as Attribute[] })
  }
  return out
}

/** One-word names many entities have, each its own fact: a book's name is not the publisher's name. */
const GENERIC = new Set(['name', 'title', 'description', 'comment', 'note', 'phone', 'email', 'address', 'date', 'number', 'code', 'type', 'status', 'price', 'quantity', 'amount'].map(stem))
const generic = (name: string, entity: string) => {
  const w = attrWords(name, entity)
  return w.length === 1 && GENERIC.has(w[0])
}

/** A student attribute that stores a fact the model already holds: twice in one entity, or in a second entity. */
export interface DuplicateAttr {
  /** The student entity and attribute to remove. */
  entity: Entity
  attr: Attribute
  /** The reference entity and attribute it repeats, and the student attribute that already holds it. */
  refEntity: Entity
  refAttr: Attribute
  holder: { entity: Entity; attr: Attribute }
}

/**
 * Attributes the reference does not have that repeat one it does: `Price` next to `Nightly_price`
 * (its words are part of the other name), or `nightly_price` in Room while Room Type holds it.
 * Identifier attributes of the other entity are left to the linter (L11, an attribute that looks like a FK).
 */
export function duplicateAttributes(student: Model, ref: Model, match: Map<Id, Id>): DuplicateAttr[] {
  const out: DuplicateAttr[] = []
  const pairs = ref.entities
    .map((r) => ({ r, s: student.entities.find((e) => e.id === match.get(r.id)) }))
    .filter((p): p is { r: Entity; s: Entity } => !!p.s)
  for (const { r, s } of pairs) {
    const claimed = new Set(r.attributes.map((ra) => sameAttribute(s, r, ra)?.id).filter(Boolean))
    const sPi = ownPi(s)
    for (const x of s.attributes) {
      if (claimed.has(x.id) || sPi.has(x.id)) continue
      const wx = attrWords(x.name, s.name)
      const inside = r.attributes.find((ra) => {
        const holder = sameAttribute(s, r, ra)
        const wr = attrWords(ra.name, r.name)
        return holder && holder.id !== x.id && wx.length > 0 && wx.length < wr.length && wx.every((w) => wr.includes(w))
      })
      if (inside) {
        out.push({ entity: s, attr: x, refEntity: r, refAttr: inside, holder: { entity: s, attr: sameAttribute(s, r, inside)! } })
        continue
      }
      for (const p of pairs) {
        if (p.s.id === s.id) continue
        const pi = ownPi(p.r)
        const ra = p.r.attributes.find((a) => !pi.has(a.id) && !generic(a.name, p.r.name) && sameAttrName(x.name, s.name, a.name, p.r.name))
        const holder = ra && sameAttribute(p.s, p.r, ra)
        if (ra && holder) {
          out.push({ entity: s, attr: x, refEntity: p.r, refAttr: ra, holder: { entity: p.s, attr: holder } })
          break
        }
      }
    }
  }
  return out
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

const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
/** Optional vs mandatory differs at A's end (`atA`: can a B have no A?) and/or at B's end. */
const minimumsDiffer = (a: string, b: string, atA = true, atB = true) => {
  const ask = [atB && `can ${article(a)} ${a} have no ${b} at all`, atA && `can ${article(b)} ${b} have no ${a} at all`].filter(Boolean)
  return `the minimums differ (optional vs mandatory). Ask yourself: ${ask.join(', and ')}?`
}

/** The card drawn at `id`'s end of a relationship. */
export const cardAt = (s: Relationship, id: Id) => (s.entityA === id ? s.cardinalityA : s.cardinalityB)

/** The link of `x` to `p` where many `x` belong to one `p`. */
function manyToOne(m: Model, x: Id, p: Id): Relationship | undefined {
  return m.relationships.find(
    (s) =>
      ((s.entityA === x && s.entityB === p) || (s.entityA === p && s.entityB === x)) && cardAt(s, x).max === 'n' && cardAt(s, p).max === 1,
  )
}

/**
 * Reference many-to-manys that the student drew as an intermediate entity (Book_Author between Book
 * and Author) instead of a plain relationship. Same tables in the PDM, so the course accepts both.
 */
function findBridges(student: Model, ref: Model, match: Map<Id, Id>, back: Map<Id, Id>): Map<Id, Bridge> {
  const out = new Map<Id, Bridge>()
  const taken = new Set<Id>()
  for (const r of ref.relationships) {
    const sa = match.get(r.entityA)
    const sb = match.get(r.entityB)
    if (relationshipKind(r) !== 'many-to-many' || !sa || !sb || sa === sb) continue
    if (student.relationships.some((s) => (s.entityA === sa && s.entityB === sb) || (s.entityA === sb && s.entityB === sa))) continue
    for (const x of student.entities) {
      if (back.has(x.id) || taken.has(x.id)) continue
      if (student.relationships.filter((s) => s.entityA === x.id || s.entityB === x.id).length !== 2) continue
      if (student.inheritances.some((i) => i.parentId === x.id || i.childIds.includes(x.id))) continue
      const toA = manyToOne(student, x.id, sa)
      const toB = manyToOne(student, x.id, sb)
      if (!toA || !toB) continue
      out.set(r.id, { entity: x.id, toA: toA.id, toB: toB.id })
      taken.add(x.id)
      break
    }
  }
  return out
}

/** The student relationship seen in the reference orientation (A ↔ A). */
function oriented(s: Relationship, refA: Id, ctx: Ctx) {
  const flip = s.entityA !== ctx.match.get(refA)
  return {
    cardA: flip ? s.cardinalityB : s.cardinalityA,
    cardB: flip ? s.cardinalityA : s.cardinalityB,
    dep: s.dependentSide ? ((s.dependentSide === 'A') !== flip ? 'A' : 'B') : null,
  }
}

/** How many of the other entity one instance has, in words: 1,n → `one or more`. */
const howMany = (c: Cardinality) => (c.max === 1 ? (c.min ? 'exactly one' : 'at most one') : c.min ? 'one or more' : 'any number of')

function relDiffs(r: Relationship, s: Relationship, ctx: Ctx): string[] {
  const o = oriented(s, r.entityA, ctx)
  // The student's names: the message talks about their model.
  const a = ctx.sName(ctx.match.get(r.entityA)!)
  const b = ctx.sName(ctx.match.get(r.entityB)!)
  const out: string[] = []
  if (!sameCard(o.cardA, r.cardinalityA) || !sameCard(o.cardB, r.cardinalityB)) {
    const maxDiff = o.cardA.max !== r.cardinalityA.max || o.cardB.max !== r.cardinalityB.max
    const reversed = maxDiff && o.cardA.max === r.cardinalityB.max && o.cardB.max === r.cardinalityA.max
    // One A has cardB B's (the card at B's end), one B has cardA A's.
    const yours = `in your model one ${a} has ${howMany(o.cardB)} ${b}, and one ${b} has ${howMany(o.cardA)} ${a}.`
    out.push(
      reversed
        ? `the “many” end is on the wrong side — ${yours} Read again which of the two has many of the other.`
        : maxDiff
          ? `the kind of link differs — you have ${relationshipKind({ ...s, cardinalityA: o.cardA, cardinalityB: o.cardB }).replace(/-/g, ' ')}, ` +
            `the text implies ${relationshipKind(r).replace(/-/g, ' ')}: ${yours} Read again how many ${b} one ${a} has, and how many ${a} one ${b} has.`
          : minimumsDiffer(a, b, o.cardA.min !== r.cardinalityA.min, o.cardB.min !== r.cardinalityB.min),
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
  const bridges = findBridges(student, ref, match, back)
  const bridgeEntities = new Set([...bridges.values()].map((b) => b.entity))

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
          refAttrs: missingAttrs.map((a) => a.name),
          target: { kind: 'entity', id: s.id },
          message: `${s.name}: ${missingAttrs.length} attribute${missingAttrs.length > 1 ? 's' : ''} from the text not found.`,
          answer: `${r.name} has ${missingAttrs.map((a) => a.name).join(', ')}.`,
        })
      const m = mandatoryDiffs(s, r)
      if (m.must.length || m.mayBeEmpty.length)
        items.push({
          kind: 'mandatory',
          status: 'different',
          refKey: key,
          refEntities: [r.name],
          target: { kind: 'entity', id: s.id },
          message:
            `${s.name}: ` +
            [
              m.must.length && `${m.must.map((a) => a.name).join(', ')} must always have a value — tick M (NOT NULL in SQL).`,
              m.mayBeEmpty.length && `${m.mayBeEmpty.map((a) => a.name).join(', ')} can stay empty — untick M.`,
            ]
              .filter(Boolean)
              .join(' '),
          answer: `${r.name}: mandatory ${r.attributes.filter((a) => a.mandatory && !ownPi(r).has(a.id)).map((a) => a.name).join(', ') || '—'}; optional ${r.attributes.filter((a) => !a.mandatory).map((a) => a.name).join(', ') || '—'}.`,
        })
      for (const { ref: ri, attrs } of missingAlternates(s, r)) {
        const names = attrs.map((a) => a.name).join(' + ')
        items.push({
          kind: 'alternate',
          status: 'missing',
          refKey: `alternate:${r.name}.${ri.name}`,
          refEntities: [r.name],
          refAttrs: ri.attributeIds.map((id) => r.attributes.find((a) => a.id === id)!.name),
          target: { kind: 'entity', id: s.id },
          message: `${s.name}: the text says some value never repeats between two ${s.name} instances — your model does not mark it as unique yet.`,
          answer: `${names} is an alternate identifier <ai>: + Identifier on ${s.name}, tick ${names}, leave Primary off. In SQL it becomes UNIQUE.`,
        })
      }
    }
    for (const d of duplicateAttributes(student, ref, match)) {
      const here = d.holder.entity.id === d.entity.id
      items.push({
        kind: 'duplicate',
        status: 'different',
        refKey: `duplicate:${d.entity.name}.${d.attr.name}`,
        refEntities: [d.refEntity.name],
        refAttrs: [d.refAttr.name],
        target: { kind: 'entity', id: d.entity.id },
        message: here
          ? `${d.entity.name}: ${d.attr.name} and ${d.holder.attr.name} look like the same fact stored twice. Keep one — two copies can disagree.`
          : `${d.entity.name}: ${d.attr.name} is also in ${d.holder.entity.name}. A fact is stored once, in the entity it belongs to.`,
        answer: here
          ? `${d.refEntity.name} has one ${d.refAttr.name}: remove ${d.attr.name} and keep ${d.holder.attr.name}.`
          : `${d.refAttr.name} belongs to ${d.refEntity.name}: remove it from ${d.entity.name}.`,
      })
    }
    for (const s of student.entities)
      if (!back.has(s.id) && !bridgeEntities.has(s.id))
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
    const bridge = bridges.get(r.id)
    if (!best && bridge) {
      usedRels.add(bridge.toA)
      usedRels.add(bridge.toB)
      const rel = (id: Id) => student.relationships.find((s) => s.id === id)!
      // Rows of the intermediate entity per B = A instances per B: the card at A's end of the plain link.
      const cardA = cardAt(rel(bridge.toB), bridge.entity)
      const cardB = cardAt(rel(bridge.toA), bridge.entity)
      const label = `${ctx.sName(sa)} — ${ctx.sName(sb)} through ${ctx.sName(bridge.entity)}`
      const target = { kind: 'entity' as const, id: bridge.entity }
      const same = sameCard(cardA, r.cardinalityA) && sameCard(cardB, r.cardinalityB)
      const [a, b] = [ctx.sName(sa), ctx.sName(sb)]
      items.push(
        same
          ? {
              kind: 'relationship',
              status: 'matched',
              refKey: key,
              refEntities: names,
              target,
              bridge,
              message: `${label} ✓ An intermediate entity is also correct here; the reference keeps a plain many-to-many because the pair has no data of its own — the PDM gets the same join table.`,
            }
          : {
              kind: 'relationship',
              status: 'different',
              refKey: key,
              refEntities: names,
              target,
              bridge,
              message: `${label}: ${minimumsDiffer(a, b, !sameCard(cardA, r.cardinalityA), !sameCard(cardB, r.cardinalityB))}`,
              // Where to set it: the cards at the intermediate entity's ends of its two links.
              answer:
                `At ${ctx.sName(bridge.entity)}'s end of ${rel(bridge.toB).name}: ${formatCardinality(r.cardinalityA)} (${a}s per ${b}); ` +
                `of ${rel(bridge.toA).name}: ${formatCardinality(r.cardinalityB)} (${b}s per ${a}). Plain link in the reference: ${answer}.`,
            },
      )
      continue
    }
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
    if (i.kind === 'attribute' || i.kind === 'mandatory' || i.kind === 'identifier' || i.kind === 'alternate' || i.kind === 'duplicate' || i.status === 'extra') continue
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
