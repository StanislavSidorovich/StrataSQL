// Save/load of `*.strata.json` files. Loading validates shape and referential integrity so a
// hand-edited or corrupted file fails with a readable message instead of breaking the canvas.

import {
  DATA_TYPES,
  MODEL_FORMAT,
  MODEL_VERSION,
  type Attribute,
  type Cardinality,
  type Domain,
  type Entity,
  type Identifier,
  type Inheritance,
  type Model,
  type PhysicalKey,
  type Point,
  type Relationship,
} from './metamodel'

export const FILE_EXTENSION = '.strata.json'

export class ModelFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelFormatError'
  }
}

/** The trainer task a model was saved from, so opening the file can continue it. */
export interface SavedTask {
  /** Case or exercise id (`hotel`, `my-task`…). */
  id: string
  level: number
}

/** Canonical JSON: fixed key order, so save → load → save is byte-identical. `task` is written last. */
export function serializeModel(m: Model, task?: SavedTask): string {
  const out: Record<string, unknown> = { ...buildModel(m) }
  if (task) out.task = { id: task.id, level: task.level }
  return JSON.stringify(out, null, 2) + '\n'
}

/** The task stored in a model file, if any (a malformed one is ignored: the model still opens). */
export function readSavedTask(input: string): SavedTask | null {
  try {
    const t = (JSON.parse(input) as { task?: Partial<SavedTask> }).task
    return t && typeof t.id === 'string' && typeof t.level === 'number' ? { id: t.id, level: t.level } : null
  } catch {
    return null
  }
}

export function parseModel(input: string | unknown): Model {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch (e) {
      throw new ModelFormatError(`Not valid JSON: ${(e as Error).message}`)
    }
  }
  const model = buildModel(raw)
  const problems = integrityProblems(model)
  if (problems.length) throw new ModelFormatError(`Inconsistent model:\n- ${problems.join('\n- ')}`)
  return model
}

function buildModel(raw: unknown): Model {
  const o = obj(raw, 'model')
  if (o.format !== MODEL_FORMAT) throw new ModelFormatError(`Not a StrataSQL model (format = ${String(o.format)})`)
  if (o.version !== MODEL_VERSION) throw new ModelFormatError(`Unsupported model version ${String(o.version)}`)
  return {
    format: MODEL_FORMAT,
    version: MODEL_VERSION,
    name: str(o.name, 'model.name'),
    comment: optStr(o.comment, 'model.comment'),
    domains: arr(o.domains, 'model.domains').map((d, i) => parseDomain(d, `domains[${i}]`)),
    entities: arr(o.entities, 'model.entities').map((e, i) => parseEntity(e, `entities[${i}]`)),
    relationships: arr(o.relationships, 'model.relationships').map((r, i) => parseRelationship(r, `relationships[${i}]`)),
    inheritances: arr(o.inheritances, 'model.inheritances').map((h, i) => parseInheritance(h, `inheritances[${i}]`)),
  }
}

/** Structural problems that make a model unusable (dangling references, duplicate ids…). */
export function integrityProblems(m: Model): string[] {
  const out: string[] = []
  const ids = new Set<string>()
  const seen = (id: string, where: string) => {
    if (ids.has(id)) out.push(`duplicate id ${id} (${where})`)
    ids.add(id)
  }
  const entityIds = new Set(m.entities.map((e) => e.id))
  const domainIds = new Set(m.domains.map((d) => d.id))
  for (const d of m.domains) seen(d.id, `domain ${d.name}`)
  for (const e of m.entities) {
    seen(e.id, `entity ${e.name}`)
    const attrIds = new Set(e.attributes.map((a) => a.id))
    for (const a of e.attributes) {
      seen(a.id, `attribute ${e.name}.${a.name}`)
      if (a.domainId && !domainIds.has(a.domainId)) out.push(`${e.name}.${a.name} uses unknown domain ${a.domainId}`)
    }
    if (e.identifiers.filter((i) => i.isPrimary).length > 1) out.push(`${e.name} has several primary identifiers`)
    for (const i of e.identifiers) {
      seen(i.id, `identifier ${e.name}.${i.name}`)
      for (const a of i.attributeIds)
        if (!attrIds.has(a)) out.push(`identifier ${e.name}.${i.name} references unknown attribute ${a}`)
    }
    for (const k of e.physicalKeys ?? []) seen(k.id, `physical key ${e.name}.${k.name}`)
  }
  for (const r of m.relationships) {
    seen(r.id, `relationship ${r.name}`)
    if (!entityIds.has(r.entityA)) out.push(`relationship ${r.name} references unknown entity ${r.entityA}`)
    if (!entityIds.has(r.entityB)) out.push(`relationship ${r.name} references unknown entity ${r.entityB}`)
  }
  const childOf = new Map<string, string>()
  for (const h of m.inheritances) {
    seen(h.id, `inheritance ${h.name}`)
    if (!entityIds.has(h.parentId)) out.push(`inheritance ${h.name} references unknown parent ${h.parentId}`)
    for (const c of h.childIds) {
      if (!entityIds.has(c)) out.push(`inheritance ${h.name} references unknown child ${c}`)
      if (c === h.parentId) out.push(`inheritance ${h.name}: entity inherits from itself`)
      if (childOf.has(c)) out.push(`entity ${c} is a child in two inheritances`)
      childOf.set(c, h.parentId)
    }
  }
  for (const start of childOf.keys()) {
    const visited = new Set<string>()
    let cur: string | undefined = start
    while (cur !== undefined) {
      if (visited.has(cur)) {
        out.push(`inheritance cycle through ${start}`)
        break
      }
      visited.add(cur)
      cur = childOf.get(cur)
    }
  }
  return out
}

// ---------------------------------------------------------------- element parsers

function parseDomain(raw: unknown, at: string): Domain {
  const o = obj(raw, at)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    dataType: dataType(o.dataType, `${at}.dataType`),
    length: optNum(o.length, `${at}.length`),
    precision: optNum(o.precision, `${at}.precision`),
  }
}

function parseEntity(raw: unknown, at: string): Entity {
  const o = obj(raw, at)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    code: str(o.code, `${at}.code`),
    comment: optStr(o.comment, `${at}.comment`),
    position: point(o.position, `${at}.position`),
    attributes: arr(o.attributes, `${at}.attributes`).map((a, i) => parseAttribute(a, `${at}.attributes[${i}]`)),
    identifiers: arr(o.identifiers, `${at}.identifiers`).map((x, i) => parseIdentifier(x, `${at}.identifiers[${i}]`)),
    physicalKeys: optArr(o.physicalKeys, `${at}.physicalKeys`)?.map((x, i) => parsePhysicalKey(x, `${at}.physicalKeys[${i}]`)),
  }
}

function parsePhysicalKey(raw: unknown, at: string): PhysicalKey {
  const o = obj(raw, at)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    columns: arr(o.columns, `${at}.columns`).map((x, i) => str(x, `${at}.columns[${i}]`)),
  }
}

function parseAttribute(raw: unknown, at: string): Attribute {
  const o = obj(raw, at)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    code: str(o.code, `${at}.code`),
    dataType: dataType(o.dataType, `${at}.dataType`),
    length: optNum(o.length, `${at}.length`),
    precision: optNum(o.precision, `${at}.precision`),
    domainId: optStr(o.domainId, `${at}.domainId`),
    mandatory: bool(o.mandatory, `${at}.mandatory`),
    comment: optStr(o.comment, `${at}.comment`),
  }
}

function parseIdentifier(raw: unknown, at: string): Identifier {
  const o = obj(raw, at)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    isPrimary: bool(o.isPrimary, `${at}.isPrimary`),
    attributeIds: arr(o.attributeIds, `${at}.attributeIds`).map((x, i) => str(x, `${at}.attributeIds[${i}]`)),
  }
}

function parseRelationship(raw: unknown, at: string): Relationship {
  const o = obj(raw, at)
  const dep = o.dependentSide
  if (dep !== null && dep !== undefined && dep !== 'A' && dep !== 'B')
    throw new ModelFormatError(`${at}.dependentSide must be "A", "B" or null`)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    entityA: str(o.entityA, `${at}.entityA`),
    entityB: str(o.entityB, `${at}.entityB`),
    cardinalityA: cardinality(o.cardinalityA, `${at}.cardinalityA`),
    cardinalityB: cardinality(o.cardinalityB, `${at}.cardinalityB`),
    roleA: optStr(o.roleA, `${at}.roleA`),
    roleB: optStr(o.roleB, `${at}.roleB`),
    dependentSide: dep ?? null,
    foreignKeySide: side(o.foreignKeySide, `${at}.foreignKeySide`),
    comment: optStr(o.comment, `${at}.comment`),
  }
}

function parseInheritance(raw: unknown, at: string): Inheritance {
  const o = obj(raw, at)
  const gen = o.generation
  if (gen !== 'parent' && gen !== 'children' && gen !== 'both')
    throw new ModelFormatError(`${at}.generation must be "parent", "children" or "both"`)
  return {
    id: str(o.id, `${at}.id`),
    name: str(o.name, `${at}.name`),
    parentId: str(o.parentId, `${at}.parentId`),
    childIds: arr(o.childIds, `${at}.childIds`).map((x, i) => str(x, `${at}.childIds[${i}]`)),
    mutuallyExclusive: bool(o.mutuallyExclusive, `${at}.mutuallyExclusive`),
    complete: bool(o.complete, `${at}.complete`),
    generation: gen,
    ...(o.inheritAll === undefined ? {} : { inheritAll: bool(o.inheritAll, `${at}.inheritAll`) }),
    discriminator: optStr(o.discriminator, `${at}.discriminator`),
    position: point(o.position, `${at}.position`),
    comment: optStr(o.comment, `${at}.comment`),
  }
}

// ---------------------------------------------------------------- primitives

function obj(v: unknown, at: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ModelFormatError(`${at} must be an object`)
  return v as Record<string, unknown>
}
function arr(v: unknown, at: string): unknown[] {
  if (!Array.isArray(v)) throw new ModelFormatError(`${at} must be an array`)
  return v
}
/** Optional array: missing or empty → undefined, so files without it stay byte-identical. */
function optArr(v: unknown, at: string): unknown[] | undefined {
  if (v === undefined || v === null) return undefined
  const a = arr(v, at)
  return a.length ? a : undefined
}
function side(v: unknown, at: string): 'A' | 'B' | undefined {
  if (v === undefined || v === null) return undefined
  if (v !== 'A' && v !== 'B') throw new ModelFormatError(`${at} must be "A" or "B"`)
  return v
}
function str(v: unknown, at: string): string {
  if (typeof v !== 'string') throw new ModelFormatError(`${at} must be a string`)
  return v
}
function optStr(v: unknown, at: string): string | undefined {
  return v === undefined || v === null ? undefined : str(v, at)
}
function bool(v: unknown, at: string): boolean {
  if (typeof v !== 'boolean') throw new ModelFormatError(`${at} must be true or false`)
  return v
}
function optNum(v: unknown, at: string): number | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ModelFormatError(`${at} must be a number`)
  return v
}
function point(v: unknown, at: string): Point {
  const o = obj(v, at)
  const x = optNum(o.x, `${at}.x`)
  const y = optNum(o.y, `${at}.y`)
  if (x === undefined || y === undefined) throw new ModelFormatError(`${at} must have x and y`)
  return { x, y }
}
function dataType(v: unknown, at: string): Attribute['dataType'] {
  if (typeof v !== 'string' || !(DATA_TYPES as readonly string[]).includes(v))
    throw new ModelFormatError(`${at}: unknown data type ${String(v)}`)
  return v as Attribute['dataType']
}
function cardinality(v: unknown, at: string): Cardinality {
  const o = obj(v, at)
  if (o.min !== 0 && o.min !== 1) throw new ModelFormatError(`${at}.min must be 0 or 1`)
  if (o.max !== 1 && o.max !== 'n') throw new ModelFormatError(`${at}.max must be 1 or "n"`)
  return { min: o.min, max: o.max }
}
