// What changed between two versions of a model: a teammate's draft (the base) and the revised model.
// Entities are matched the way the trainer matches a student model with a reference (compare.ts:
// name, attributes, neighbours, never ids), so a model rebuilt by hand or imported from PowerDesigner
// still lines up with its draft. Each new, changed or removed element gets a number, in reading
// order on the canvas, so a list and the diagram can point at each other.

import { matchEntities, normName, sameAttribute } from './compare'
import { formatCardinality, formatDataType, primaryIdentifier, type Attribute, type Entity, type Id, type Model, type Relationship } from './metamodel'

export type ChangeStatus = 'new' | 'changed' | 'removed'
export type ChangeKind = 'entity' | 'relationship' | 'inheritance'

export interface Change {
  status: ChangeStatus
  kind: ChangeKind
  /** The element in the revised model (absent when removed). */
  id?: Id
  /** The element in the base model (absent when new). */
  baseId?: Id
  /** `Clinical_record`, `Pet — Appointment (for_pet)`. */
  label: string
  /** What differs, one short line each: `+ Name`, `Microchip: I → VA20`, `card at Billing: 1,n → 0,1`. */
  details: string[]
  /** Why: the revised element's comment (removed elements: the base element's comment). */
  note?: string
  /**
   * A new line of a new entity (or a removed line of a removed entity) comes with it: it shares the
   * entity's number instead of taking its own, so 15 new entities read as 15 changes, not 40.
   */
  with?: Id
  /** 1, 2, 3… in reading order on the canvas (removed elements come last). */
  n: number
}

export interface ModelChanges {
  /** Numbered changes, each entity followed by the lines that come with it. */
  changes: Change[]
  /** Elements of the base that are still there unchanged. */
  kept: number
  /** Numbered changes by status (lines that come with an entity are not counted again). */
  counts: Record<ChangeStatus, number>
}

/** Change of an element of the revised model, if it has one. */
export function changeOf(c: ModelChanges, kind: ChangeKind, id: Id): Change | undefined {
  return c.changes.find((x) => x.kind === kind && x.id === id)
}

// ---------------------------------------------------------------- entities

function piNames(e: Entity): string[] {
  const pi = primaryIdentifier(e)
  return e.attributes.filter((a) => pi?.attributeIds.includes(a.id)).map((a) => a.name)
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const wordsOf = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** A typo fixed: one letter off (`Adress` ~ `Address`), two in a long name (`Microsip` ~ `Microchip`). */
function typo(a: string, b: string): boolean {
  const short = Math.min(a.length, b.length)
  if (short < 5) return false
  const limit = short >= 8 ? 2 : 1
  if (Math.abs(a.length - b.length) > limit) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] <= limit
}

/**
 * Base attribute → revised attribute. Besides the trainer's name rules: the single key attribute of
 * both (`IDBilling` → `Billing_ID`), a typo fixed, and a name kept inside a longer one when only one
 * revised attribute qualifies (`Password` → `Password_hash`; `Rate` with `Vet_rate` and `Branch_rate` stays open).
 */
function pairAttributes(base: Entity, rev: Entity): Map<Id, Attribute> {
  const out = new Map<Id, Attribute>()
  const taken = new Set<Id>()
  const put = (b: Attribute, r: Attribute | undefined) => {
    if (!r || taken.has(r.id) || out.has(b.id)) return
    out.set(b.id, r)
    taken.add(r.id)
  }
  const bPi = primaryIdentifier(base)?.attributeIds ?? []
  const rPi = primaryIdentifier(rev)?.attributeIds ?? []
  for (const b of base.attributes) put(b, sameAttribute(rev, base, b))
  if (bPi.length === 1 && rPi.length === 1) put(base.attributes.find((a) => a.id === bPi[0])!, rev.attributes.find((a) => a.id === rPi[0]))
  const free = () => rev.attributes.filter((r) => !taken.has(r.id))
  for (const b of base.attributes) {
    if (out.has(b.id)) continue
    const t = free().filter((r) => typo(letters(b.name), letters(r.name)))
    if (t.length === 1) put(b, t[0])
  }
  for (const b of base.attributes) {
    if (out.has(b.id)) continue
    const bw = wordsOf(b.name)
    const t = free().filter((r) => {
      const rw = wordsOf(r.name)
      return rw.length > bw.length && bw.every((w) => rw.includes(w))
    })
    if (t.length === 1) put(b, t[0])
  }
  return out
}

function entityDetails(base: Entity, rev: Entity): string[] {
  const out: string[] = []
  if (base.name !== rev.name) out.push(`renamed from ${base.name}`)
  const pairs = pairAttributes(base, rev)
  const claimed = new Set([...pairs.values()].map((a) => a.id))
  for (const ba of base.attributes) {
    const ra = pairs.get(ba.id)
    if (!ra) {
      out.push(`− ${ba.name}`)
      continue
    }
    const parts: string[] = []
    if (ra.name !== ba.name) parts.push(`renamed from ${ba.name}`)
    if (formatDataType(ra) !== formatDataType(ba)) parts.push(`${formatDataType(ba)} → ${formatDataType(ra)}`)
    if (ra.mandatory !== ba.mandatory) parts.push(ra.mandatory ? 'now mandatory' : 'now optional')
    if (parts.length) out.push(`${ra.name}: ${parts.join(', ')}`)
  }
  for (const ra of rev.attributes) if (!claimed.has(ra.id)) out.push(`+ ${ra.name}`)
  // A different choice of key (a renamed key attribute is reported above). A key that only went
  // away with its attribute (a child of an inheritance takes its parent's) needs no second line.
  const bKey = primaryIdentifier(base)?.attributeIds ?? []
  const rKey = primaryIdentifier(rev)?.attributeIds ?? []
  const mapped = bKey.map((id) => pairs.get(id)?.id)
  const goneWithAttrs = rKey.length === 0 && mapped.every((x) => !x)
  if (!goneWithAttrs && (bKey.length !== rKey.length || mapped.some((x) => !x || !rKey.includes(x))))
    out.push(`identifier: ${piNames(base).join(' + ') || 'none'} → ${piNames(rev).join(' + ') || 'none'}`)
  const alt = (e: Entity) => e.identifiers.filter((i) => !i.isPrimary).length
  if (alt(rev) !== alt(base)) out.push(`alternate identifiers: ${alt(base)} → ${alt(rev)}`)
  return out
}

// ---------------------------------------------------------------- relationships

const relLabel = (r: Relationship, name: (id: Id) => string) => `${name(r.entityA)} — ${name(r.entityB)}${r.name ? ` (${r.name})` : ''}`

function relDetails(base: Relationship, rev: Relationship, toRev: (id: Id) => Id | undefined, revName: (id: Id) => string): string[] {
  const out: string[] = []
  if (normName(base.name) !== normName(rev.name)) out.push(`renamed from ${base.name}`)
  const a = toRev(base.entityA)
  const b = toRev(base.entityB)
  const sameEnds = (a === rev.entityA && b === rev.entityB) || (a === rev.entityB && b === rev.entityA)
  if (!sameEnds) {
    out.push(`now links ${revName(rev.entityA)} and ${revName(rev.entityB)}`)
    return out
  }
  // Read the revised relationship in the base's orientation.
  const flip = rev.entityA !== a
  const card = { A: flip ? rev.cardinalityB : rev.cardinalityA, B: flip ? rev.cardinalityA : rev.cardinalityB }
  for (const side of ['A', 'B'] as const) {
    const was = formatCardinality(side === 'A' ? base.cardinalityA : base.cardinalityB)
    const now = formatCardinality(card[side])
    if (was !== now) out.push(`card at ${revName(side === 'A' ? a! : b!)}: ${was} → ${now}`)
  }
  const dep = rev.dependentSide ? ((rev.dependentSide === 'A') !== flip ? 'A' : 'B') : null
  if (dep !== base.dependentSide)
    out.push(dep ? `${revName(dep === 'A' ? a! : b!)} now depends on ${revName(dep === 'A' ? b! : a!)}` : 'no longer a dependency')
  return out
}

// ---------------------------------------------------------------- the diff

export function diffModels(base: Model, rev: Model): ModelChanges {
  const match = matchEntities(rev, base) // base id → revised id
  const back = new Map([...match].map(([b, r]) => [r, b]))
  const bEnt = new Map(base.entities.map((e) => [e.id, e]))
  const rEnt = new Map(rev.entities.map((e) => [e.id, e]))
  const bName = (id: Id) => bEnt.get(id)?.name ?? '?'
  const rName = (id: Id) => rEnt.get(id)?.name ?? '?'
  const toRev = (id: Id) => match.get(id)
  const items: Omit<Change, 'n'>[] = []
  let kept = 0

  for (const e of rev.entities) {
    const b = bEnt.get(back.get(e.id) ?? '')
    if (!b) {
      items.push({ status: 'new', kind: 'entity', id: e.id, label: e.name, details: [], note: e.comment })
      continue
    }
    const details = entityDetails(b, e)
    if (details.length) items.push({ status: 'changed', kind: 'entity', id: e.id, baseId: b.id, label: e.name, details, note: e.comment })
    else kept++
  }
  for (const b of base.entities)
    if (!match.has(b.id)) items.push({ status: 'removed', kind: 'entity', baseId: b.id, label: b.name, details: [], note: b.comment })

  // Relationships: same pair of (matched) entities first, the same name second; then the same name
  // with other ends (a line moved to another entity).
  const used = new Set<Id>()
  const pairs = new Map<Id, Relationship>()
  const ends = (r: Relationship) => [r.entityA, r.entityB].sort().join('|')
  for (const pass of [0, 1]) {
    for (const b of base.relationships) {
      if (pairs.has(b.id)) continue
      const a = toRev(b.entityA)
      const z = toRev(b.entityB)
      const want = a && z ? [a, z].sort().join('|') : null
      const cands = rev.relationships.filter((r) =>
        used.has(r.id) ? false : pass === 0 ? want !== null && ends(r) === want : normName(r.name) === normName(b.name) && (r.entityA === a || r.entityB === a || r.entityA === z || r.entityB === z),
      )
      const best = cands.find((r) => normName(r.name) === normName(b.name)) ?? cands[0]
      if (best) {
        pairs.set(b.id, best)
        used.add(best.id)
      }
    }
  }
  const baseOf = new Map([...pairs].map(([b, r]) => [r.id, b]))
  for (const r of rev.relationships) {
    const bId = baseOf.get(r.id)
    const b = base.relationships.find((x) => x.id === bId)
    if (!b) {
      items.push({ status: 'new', kind: 'relationship', id: r.id, label: relLabel(r, rName), details: [], note: r.comment })
      continue
    }
    const details = relDetails(b, r, toRev, rName)
    if (details.length) items.push({ status: 'changed', kind: 'relationship', id: r.id, baseId: b.id, label: relLabel(r, rName), details, note: r.comment })
    else kept++
  }
  for (const b of base.relationships)
    if (!pairs.has(b.id)) items.push({ status: 'removed', kind: 'relationship', baseId: b.id, label: relLabel(b, bName), details: [], note: b.comment })

  // Inheritances: by their (matched) parent.
  const usedInh = new Set<Id>()
  for (const i of rev.inheritances) {
    const b = base.inheritances.find((x) => !usedInh.has(x.id) && toRev(x.parentId) === i.parentId)
    const label = `${rName(i.parentId)} → ${i.childIds.map(rName).join(', ')}`
    if (!b) {
      items.push({ status: 'new', kind: 'inheritance', id: i.id, label, details: [], note: i.comment })
      continue
    }
    usedInh.add(b.id)
    const details: string[] = []
    const kids = b.childIds.map(toRev)
    for (const c of i.childIds) if (!kids.includes(c)) details.push(`+ child ${rName(c)}`)
    b.childIds.forEach((c, k) => !i.childIds.includes(kids[k] ?? '') && details.push(`− child ${bName(c)}`))
    if (i.mutuallyExclusive !== b.mutuallyExclusive) details.push(i.mutuallyExclusive ? 'now mutually exclusive' : 'no longer mutually exclusive')
    if (i.complete !== b.complete) details.push(i.complete ? 'now complete' : 'no longer complete')
    if (details.length) items.push({ status: 'changed', kind: 'inheritance', id: i.id, baseId: b.id, label, details, note: i.comment })
    else kept++
  }
  for (const b of base.inheritances)
    if (!usedInh.has(b.id)) items.push({ status: 'removed', kind: 'inheritance', baseId: b.id, label: `${bName(b.parentId)} → ${b.childIds.map(bName).join(', ')}`, details: [], note: b.comment })

  // Lines that come with a new (or removed) entity.
  const newEnt = new Set(items.filter((c) => c.kind === 'entity' && c.status === 'new').map((c) => c.id!))
  const goneEnt = new Set(items.filter((c) => c.kind === 'entity' && c.status === 'removed').map((c) => c.baseId!))
  for (const c of items) {
    if (c.kind !== 'relationship') continue
    const r = c.status === 'new' ? rev.relationships.find((x) => x.id === c.id) : c.status === 'removed' ? base.relationships.find((x) => x.id === c.baseId) : undefined
    const ends = c.status === 'new' ? newEnt : goneEnt
    if (r) c.with = ends.has(r.entityB) ? r.entityB : ends.has(r.entityA) ? r.entityA : undefined
  }

  // Reading order on the canvas: by rows of ~120 px, then left to right.
  const where = (c: Omit<Change, 'n'>): { x: number; y: number } => {
    if (c.kind === 'entity') return rEnt.get(c.id!)!.position
    if (c.kind === 'inheritance') return rev.inheritances.find((i) => i.id === c.id)!.position
    const r = rev.relationships.find((x) => x.id === c.id)!
    const p = rEnt.get(r.entityA)!.position
    const q = rEnt.get(r.entityB)!.position
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
  }
  // Removed elements are not on the canvas: they keep their order at the end of the list.
  const own = items.filter((c) => !c.with)
  const placed = own.filter((c) => c.status !== 'removed').map((c) => ({ c, p: where(c) }))
  placed.sort((u, v) => Math.round(u.p.y / 120) - Math.round(v.p.y / 120) || u.p.x - v.p.x)
  const numbered = [...placed.map((x) => x.c), ...own.filter((c) => c.status === 'removed')].map((c, k) => ({ ...c, n: k + 1 }))
  const nOf = new Map(numbered.filter((c) => c.kind === 'entity').map((c) => [c.id ?? c.baseId!, c.n]))
  // Each entity is followed by the lines that come with it.
  const changes: Change[] = []
  for (const c of numbered) {
    changes.push(c)
    if (c.kind === 'entity') for (const r of items) if (r.with && r.with === (c.id ?? c.baseId)) changes.push({ ...r, n: nOf.get(r.with)! })
  }
  const counts: Record<ChangeStatus, number> = { new: 0, changed: 0, removed: 0 }
  for (const c of changes) if (!c.with) counts[c.status]++
  return { changes, kept, counts }
}
