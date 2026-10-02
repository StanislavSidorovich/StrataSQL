// Editing operations on a CDM. Every op mutates the model it is given (so it can run on an
// immer draft) and keeps the model consistent: deleting an entity removes its relationships,
// deleting an attribute removes it from identifiers, etc.

import {
  CARD,
  otherSide,
  type Attribute,
  type Cardinality,
  type DataType,
  type Domain,
  type Entity,
  type Id,
  type Identifier,
  type Inheritance,
  type InheritanceGeneration,
  type Model,
  type Point,
  type Relationship,
  type Side,
} from './metamodel'

export class ModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelError'
  }
}

let idCounter = 0
export function newId(prefix: string): Id {
  idCounter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`
}

/** PowerDesigner-like name → code conversion. `TV Show` → `TV_SHOW`. */
export function toEntityCode(name: string): string {
  return toCode(name).toUpperCase()
}

/** Attribute codes are kept lower-case, matching the course examples (`show_id`). */
export function toAttributeCode(name: string): string {
  return toCode(name).toLowerCase()
}

function toCode(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
}

export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((n) => n.toLowerCase()))
  if (!set.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`
    if (!set.has(candidate.toLowerCase())) return candidate
  }
}

// ---------------------------------------------------------------- lookups

export function getEntity(m: Model, id: Id): Entity {
  const e = m.entities.find((x) => x.id === id)
  if (!e) throw new ModelError(`Entity ${id} not found`)
  return e
}

export function findEntityByName(m: Model, name: string): Entity | undefined {
  const n = name.toLowerCase()
  return m.entities.find((e) => e.name.toLowerCase() === n)
}

export function getAttribute(entity: Entity, id: Id): Attribute {
  const a = entity.attributes.find((x) => x.id === id)
  if (!a) throw new ModelError(`Attribute ${id} not found in ${entity.name}`)
  return a
}

export function getRelationship(m: Model, id: Id): Relationship {
  const r = m.relationships.find((x) => x.id === id)
  if (!r) throw new ModelError(`Relationship ${id} not found`)
  return r
}

export function getInheritance(m: Model, id: Id): Inheritance {
  const i = m.inheritances.find((x) => x.id === id)
  if (!i) throw new ModelError(`Inheritance ${id} not found`)
  return i
}

export function inheritanceOfChild(m: Model, childId: Id): Inheritance | undefined {
  return m.inheritances.find((i) => i.childIds.includes(childId))
}

/** Ancestors through inheritance, nearest first. */
export function ancestorsOf(m: Model, entityId: Id): Id[] {
  const out: Id[] = []
  let current = inheritanceOfChild(m, entityId)
  while (current && !out.includes(current.parentId)) {
    out.push(current.parentId)
    current = inheritanceOfChild(m, current.parentId)
  }
  return out
}

// ---------------------------------------------------------------- entities

export interface NewEntity {
  name?: string
  code?: string
  comment?: string
  position?: Point
}

export function addEntity(m: Model, input: NewEntity = {}): Entity {
  const name = uniqueName(input.name?.trim() || 'Entity', m.entities.map((e) => e.name))
  const entity: Entity = {
    id: newId('ent'),
    name,
    code: input.code ?? toEntityCode(name),
    comment: input.comment,
    position: input.position ?? { x: 0, y: 0 },
    attributes: [],
    identifiers: [],
  }
  m.entities.push(entity)
  return entity
}

export function updateEntity(
  m: Model,
  id: Id,
  patch: Partial<Pick<Entity, 'name' | 'code' | 'comment' | 'position'>>,
): void {
  const e = getEntity(m, id)
  if (patch.name !== undefined && patch.name !== e.name) {
    // Keep the code in sync while the user hasn't customised it.
    if (patch.code === undefined && e.code === toEntityCode(e.name)) e.code = toEntityCode(patch.name)
    e.name = patch.name
  }
  if (patch.code !== undefined) e.code = patch.code
  if (patch.comment !== undefined) e.comment = patch.comment || undefined
  if (patch.position !== undefined) e.position = { ...patch.position }
}

export function removeEntity(m: Model, id: Id): void {
  getEntity(m, id)
  m.entities = m.entities.filter((e) => e.id !== id)
  m.relationships = m.relationships.filter((r) => r.entityA !== id && r.entityB !== id)
  for (const inh of m.inheritances) inh.childIds = inh.childIds.filter((c) => c !== id)
  m.inheritances = m.inheritances.filter((i) => i.parentId !== id && i.childIds.length > 0)
}

// ---------------------------------------------------------------- attributes

export interface NewAttribute {
  name?: string
  code?: string
  dataType?: DataType
  length?: number
  precision?: number
  domainId?: Id
  mandatory?: boolean
  comment?: string
  /** Shortcut: put the attribute into the primary identifier (creating it if needed). */
  primary?: boolean
}

export function addAttribute(m: Model, entityId: Id, input: NewAttribute = {}): Attribute {
  const e = getEntity(m, entityId)
  const name = uniqueName(input.name?.trim() || 'attribute', e.attributes.map((a) => a.name))
  const attr: Attribute = {
    id: newId('att'),
    name,
    code: input.code ?? toAttributeCode(name),
    dataType: input.dataType ?? 'Variable characters',
    length: input.length,
    precision: input.precision,
    domainId: input.domainId,
    mandatory: input.mandatory ?? false,
    comment: input.comment,
  }
  if (input.dataType === undefined && input.length === undefined) attr.length = 50
  if (attr.domainId) applyDomain(attr, getDomain(m, attr.domainId))
  e.attributes.push(attr)
  if (input.primary) setAttributeInPrimary(m, entityId, attr.id, true)
  return attr
}

export function updateAttribute(
  m: Model,
  entityId: Id,
  attrId: Id,
  patch: Partial<Omit<Attribute, 'id'>>,
): void {
  const e = getEntity(m, entityId)
  const a = getAttribute(e, attrId)
  if (patch.name !== undefined && patch.name !== a.name) {
    if (patch.code === undefined && a.code === toAttributeCode(a.name)) a.code = toAttributeCode(patch.name)
    a.name = patch.name
  }
  if (patch.code !== undefined) a.code = patch.code
  if (patch.dataType !== undefined) {
    a.dataType = patch.dataType
    a.domainId = undefined
  }
  if ('length' in patch) a.length = patch.length
  if ('precision' in patch) a.precision = patch.precision
  if (patch.mandatory !== undefined) {
    if (!patch.mandatory && isInPrimary(e, attrId))
      throw new ModelError(`${a.name} is part of the primary identifier and must be mandatory`)
    a.mandatory = patch.mandatory
  }
  if ('comment' in patch) a.comment = patch.comment || undefined
  if ('domainId' in patch) {
    a.domainId = patch.domainId
    if (patch.domainId) applyDomain(a, getDomain(m, patch.domainId))
  }
}

export function removeAttribute(m: Model, entityId: Id, attrId: Id): void {
  const e = getEntity(m, entityId)
  getAttribute(e, attrId)
  e.attributes = e.attributes.filter((a) => a.id !== attrId)
  for (const ident of e.identifiers) ident.attributeIds = ident.attributeIds.filter((x) => x !== attrId)
  e.identifiers = e.identifiers.filter((i) => i.attributeIds.length > 0)
}

export function moveAttribute(m: Model, entityId: Id, attrId: Id, delta: number): void {
  const e = getEntity(m, entityId)
  const from = e.attributes.findIndex((a) => a.id === attrId)
  if (from < 0) throw new ModelError(`Attribute ${attrId} not found in ${e.name}`)
  const to = Math.max(0, Math.min(e.attributes.length - 1, from + delta))
  if (to === from) return
  const [a] = e.attributes.splice(from, 1)
  e.attributes.splice(to, 0, a)
}

// ---------------------------------------------------------------- identifiers

function isInPrimary(e: Entity, attrId: Id): boolean {
  return e.identifiers.some((i) => i.isPrimary && i.attributeIds.includes(attrId))
}

export function addIdentifier(
  m: Model,
  entityId: Id,
  input: { name?: string; isPrimary?: boolean; attributeIds?: Id[] } = {},
): Identifier {
  const e = getEntity(m, entityId)
  const isPrimary = input.isPrimary ?? !e.identifiers.some((i) => i.isPrimary)
  const ident: Identifier = {
    id: newId('idf'),
    name: uniqueName(input.name?.trim() || `Identifier_${e.identifiers.length + 1}`, e.identifiers.map((i) => i.name)),
    isPrimary: false,
    attributeIds: [],
  }
  e.identifiers.push(ident)
  for (const a of input.attributeIds ?? []) toggleIdentifierAttribute(m, entityId, ident.id, a, true)
  if (isPrimary) setPrimaryIdentifier(m, entityId, ident.id)
  return ident
}

export function getIdentifier(e: Entity, id: Id): Identifier {
  const i = e.identifiers.find((x) => x.id === id)
  if (!i) throw new ModelError(`Identifier ${id} not found in ${e.name}`)
  return i
}

export function renameIdentifier(m: Model, entityId: Id, identId: Id, name: string): void {
  getIdentifier(getEntity(m, entityId), identId).name = name
}

/** Makes the identifier primary; the previous primary becomes an alternate identifier. */
export function setPrimaryIdentifier(m: Model, entityId: Id, identId: Id): void {
  const e = getEntity(m, entityId)
  const target = getIdentifier(e, identId)
  for (const i of e.identifiers) i.isPrimary = i === target
  for (const a of target.attributeIds) getAttribute(e, a).mandatory = true
}

export function removeIdentifier(m: Model, entityId: Id, identId: Id): void {
  const e = getEntity(m, entityId)
  getIdentifier(e, identId)
  e.identifiers = e.identifiers.filter((i) => i.id !== identId)
}

export function toggleIdentifierAttribute(m: Model, entityId: Id, identId: Id, attrId: Id, on?: boolean): void {
  const e = getEntity(m, entityId)
  const ident = getIdentifier(e, identId)
  const attr = getAttribute(e, attrId)
  const has = ident.attributeIds.includes(attrId)
  const want = on ?? !has
  if (want && !has) {
    ident.attributeIds.push(attrId)
    if (ident.isPrimary) attr.mandatory = true
  } else if (!want && has) {
    ident.attributeIds = ident.attributeIds.filter((x) => x !== attrId)
  }
}

/** Adds/removes an attribute to the primary identifier, creating the identifier when needed. */
export function setAttributeInPrimary(m: Model, entityId: Id, attrId: Id, on: boolean): void {
  const e = getEntity(m, entityId)
  let pi = e.identifiers.find((i) => i.isPrimary)
  if (!pi) {
    if (!on) return
    pi = addIdentifier(m, entityId, { isPrimary: true })
  }
  toggleIdentifierAttribute(m, entityId, pi.id, attrId, on)
  // An empty primary identifier is dropped: dependent entities may legitimately have none.
  if (pi.attributeIds.length === 0) removeIdentifier(m, entityId, pi.id)
}

// ---------------------------------------------------------------- domains

export function getDomain(m: Model, id: Id): Domain {
  const d = m.domains.find((x) => x.id === id)
  if (!d) throw new ModelError(`Domain ${id} not found`)
  return d
}

function applyDomain(a: Attribute, d: Domain): void {
  a.dataType = d.dataType
  a.length = d.length
  a.precision = d.precision
}

export function addDomain(m: Model, input: Partial<Omit<Domain, 'id'>> = {}): Domain {
  const d: Domain = {
    id: newId('dom'),
    name: uniqueName(input.name?.trim() || 'Domain', m.domains.map((x) => x.name)),
    dataType: input.dataType ?? 'Variable characters',
    length: input.length,
    precision: input.precision,
  }
  m.domains.push(d)
  return d
}

/** Updates a domain and re-applies its type to every attribute using it. */
export function updateDomain(m: Model, id: Id, patch: Partial<Omit<Domain, 'id'>>): void {
  const d = getDomain(m, id)
  Object.assign(d, patch)
  for (const e of m.entities) for (const a of e.attributes) if (a.domainId === id) applyDomain(a, d)
}

export function removeDomain(m: Model, id: Id): void {
  getDomain(m, id)
  m.domains = m.domains.filter((d) => d.id !== id)
  for (const e of m.entities) for (const a of e.attributes) if (a.domainId === id) a.domainId = undefined
}

// ---------------------------------------------------------------- relationships

export interface NewRelationship {
  name?: string
  cardinalityA?: Cardinality
  cardinalityB?: Cardinality
  roleA?: string
  roleB?: string
  dependentSide?: Side | null
  comment?: string
}

/** Default: A `1,1` — B `0,n`, i.e. one A has many B (drag from the "one" side to the "many" side). */
export function addRelationship(m: Model, entityA: Id, entityB: Id, input: NewRelationship = {}): Relationship {
  const a = getEntity(m, entityA)
  const b = getEntity(m, entityB)
  const rel: Relationship = {
    id: newId('rel'),
    name: input.name ?? uniqueName(`${a.name}_${b.name}`, m.relationships.map((r) => r.name)),
    entityA,
    entityB,
    cardinalityA: { ...(input.cardinalityA ?? CARD.oneOne) },
    cardinalityB: { ...(input.cardinalityB ?? CARD.zeroMany) },
    roleA: input.roleA,
    roleB: input.roleB,
    dependentSide: null,
    comment: input.comment,
  }
  m.relationships.push(rel)
  if (input.dependentSide) setDependentSide(m, rel.id, input.dependentSide)
  return rel
}

export function updateRelationship(
  m: Model,
  id: Id,
  patch: Partial<
    Pick<Relationship, 'name' | 'entityA' | 'entityB' | 'cardinalityA' | 'cardinalityB' | 'roleA' | 'roleB' | 'comment'>
  >,
): void {
  const r = getRelationship(m, id)
  if (patch.name !== undefined) r.name = patch.name
  if (patch.entityA !== undefined) r.entityA = getEntity(m, patch.entityA).id
  if (patch.entityB !== undefined) r.entityB = getEntity(m, patch.entityB).id
  if (r.entityA === r.entityB) r.dependentSide = null
  if (patch.cardinalityA) r.cardinalityA = { ...patch.cardinalityA }
  if (patch.cardinalityB) r.cardinalityB = { ...patch.cardinalityB }
  if ('roleA' in patch) r.roleA = patch.roleA || undefined
  if ('roleB' in patch) r.roleB = patch.roleB || undefined
  if ('comment' in patch) r.comment = patch.comment || undefined
  // A dependent entity always has exactly one parent instance on that relationship.
  if (r.dependentSide) {
    const parentEnd = otherSide(r.dependentSide)
    const parentCard = parentEnd === 'A' ? r.cardinalityA : r.cardinalityB
    if (parentCard.min !== 1 || parentCard.max !== 1) r.dependentSide = null
  }
}

/**
 * Marks `side` as the dependent (weak) entity: it is identified through the other entity.
 * The parent end becomes `1,1` — every dependent row has exactly one parent.
 */
export function setDependentSide(m: Model, id: Id, side: Side | null): void {
  const r = getRelationship(m, id)
  if (side && r.entityA === r.entityB) throw new ModelError('A reflexive relationship cannot be dependent')
  r.dependentSide = side
  if (side === 'B') r.cardinalityA = { ...CARD.oneOne }
  if (side === 'A') r.cardinalityB = { ...CARD.oneOne }
}

/** Swaps A and B (with their cardinalities, roles and dependency). */
export function swapRelationshipSides(m: Model, id: Id): void {
  const r = getRelationship(m, id)
  ;[r.entityA, r.entityB] = [r.entityB, r.entityA]
  ;[r.cardinalityA, r.cardinalityB] = [r.cardinalityB, r.cardinalityA]
  ;[r.roleA, r.roleB] = [r.roleB, r.roleA]
  if (r.dependentSide) r.dependentSide = otherSide(r.dependentSide)
}

export function removeRelationship(m: Model, id: Id): void {
  getRelationship(m, id)
  m.relationships = m.relationships.filter((r) => r.id !== id)
}

// ---------------------------------------------------------------- inheritance

export interface NewInheritance {
  name?: string
  mutuallyExclusive?: boolean
  complete?: boolean
  generation?: InheritanceGeneration
  discriminator?: string
  position?: Point
}

function assertCanBeChild(m: Model, parentId: Id, childId: Id): void {
  const child = getEntity(m, childId)
  if (childId === parentId) throw new ModelError(`${child.name} cannot inherit from itself`)
  const existing = inheritanceOfChild(m, childId)
  if (existing) {
    const p = getEntity(m, existing.parentId)
    throw new ModelError(`${child.name} already inherits from ${p.name}`)
  }
  if (ancestorsOf(m, parentId).includes(childId))
    throw new ModelError(`${child.name} is an ancestor of ${getEntity(m, parentId).name}: inheritance cycle`)
}

export function addInheritance(m: Model, parentId: Id, childIds: Id[], input: NewInheritance = {}): Inheritance {
  const parent = getEntity(m, parentId)
  const inh: Inheritance = {
    id: newId('inh'),
    name: input.name ?? uniqueName(`${parent.name}_inheritance`, m.inheritances.map((i) => i.name)),
    parentId,
    childIds: [],
    mutuallyExclusive: input.mutuallyExclusive ?? true,
    complete: input.complete ?? true,
    generation: input.generation ?? 'both',
    discriminator: input.discriminator,
    position: input.position ?? { x: parent.position.x + 60, y: parent.position.y + 160 },
  }
  for (const c of childIds) assertCanBeChild(m, parentId, c)
  if (new Set(childIds).size !== childIds.length) throw new ModelError('Duplicate child in inheritance')
  inh.childIds = [...childIds]
  m.inheritances.push(inh)
  return inh
}

export function addInheritanceChild(m: Model, inhId: Id, childId: Id): void {
  const inh = getInheritance(m, inhId)
  assertCanBeChild(m, inh.parentId, childId)
  inh.childIds.push(childId)
}

export function removeInheritanceChild(m: Model, inhId: Id, childId: Id): void {
  const inh = getInheritance(m, inhId)
  inh.childIds = inh.childIds.filter((c) => c !== childId)
  if (inh.childIds.length === 0) removeInheritance(m, inhId)
}

export function updateInheritance(
  m: Model,
  id: Id,
  patch: Partial<Pick<Inheritance, 'name' | 'mutuallyExclusive' | 'complete' | 'generation' | 'discriminator' | 'position' | 'comment'>>,
): void {
  const inh = getInheritance(m, id)
  if (patch.name !== undefined) inh.name = patch.name
  if (patch.mutuallyExclusive !== undefined) inh.mutuallyExclusive = patch.mutuallyExclusive
  if (patch.complete !== undefined) inh.complete = patch.complete
  if (patch.generation !== undefined) inh.generation = patch.generation
  if ('discriminator' in patch) inh.discriminator = patch.discriminator || undefined
  if (patch.position !== undefined) inh.position = { ...patch.position }
  if ('comment' in patch) inh.comment = patch.comment || undefined
}

export function removeInheritance(m: Model, id: Id): void {
  getInheritance(m, id)
  m.inheritances = m.inheritances.filter((i) => i.id !== id)
}

/** Makes `childId` inherit from `parentId`, reusing the parent's existing inheritance if any. */
export function linkInheritance(m: Model, childId: Id, parentId: Id): Inheritance {
  const existing = m.inheritances.find((i) => i.parentId === parentId)
  if (existing) {
    addInheritanceChild(m, existing.id, childId)
    return existing
  }
  return addInheritance(m, parentId, [childId])
}

// ---------------------------------------------------------------- model

export function renameModel(m: Model, name: string): void {
  m.name = name
}
