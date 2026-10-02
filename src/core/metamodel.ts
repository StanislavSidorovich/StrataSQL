// Conceptual Data Model (CDM) metamodel — SPEC §5.
// Pure data types: no behaviour, no React.

export type Id = string

export interface Point {
  x: number
  y: number
}

/** Conceptual data types (PowerDesigner CDM style). Mapped to SQL types in the PDM stage. */
export const DATA_TYPES = [
  'Integer',
  'Short integer',
  'Long integer',
  'Decimal',
  'Float',
  'Money',
  'Boolean',
  'Characters',
  'Variable characters',
  'Text',
  'Date',
  'Time',
  'Date & time',
  'Binary',
] as const
export type DataType = (typeof DATA_TYPES)[number]

/** Types that take a length (characters) or precision/scale (numbers). */
export const TYPES_WITH_LENGTH: readonly DataType[] = ['Characters', 'Variable characters', 'Binary']
export const TYPES_WITH_PRECISION: readonly DataType[] = ['Decimal', 'Money']

/** PowerDesigner type codes, used for compact display on the canvas (`VA50`, `DC10,2`). */
export const DATA_TYPE_CODES: Record<DataType, string> = {
  Integer: 'I',
  'Short integer': 'SI',
  'Long integer': 'LI',
  Decimal: 'DC',
  Float: 'F',
  Money: 'MN',
  Boolean: 'BL',
  Characters: 'A',
  'Variable characters': 'VA',
  Text: 'TXT',
  Date: 'D',
  Time: 'T',
  'Date & time': 'DT',
  Binary: 'BIN',
}

export function formatDataType(t: { dataType: DataType; length?: number; precision?: number }): string {
  const code = DATA_TYPE_CODES[t.dataType]
  if (TYPES_WITH_PRECISION.includes(t.dataType) && t.length !== undefined)
    return t.precision !== undefined ? `${code}${t.length},${t.precision}` : `${code}${t.length}`
  if (TYPES_WITH_LENGTH.includes(t.dataType) && t.length !== undefined) return `${code}${t.length}`
  return code
}

export interface Domain {
  id: Id
  name: string
  dataType: DataType
  length?: number
  precision?: number
}

export interface Attribute {
  id: Id
  name: string
  code: string
  dataType: DataType
  length?: number
  precision?: number
  /** When set, the attribute takes its type from the domain. */
  domainId?: Id
  mandatory: boolean
  comment?: string
}

export interface Identifier {
  id: Id
  name: string
  isPrimary: boolean
  attributeIds: Id[]
}

/**
 * An alternate key declared on the generated table, over PDM column names. It can use columns that
 * only exist after CDM → PDM migration (Timetables: `room_id` arrives in CLASSSLOT through Class).
 */
export interface PhysicalKey {
  id: Id
  name: string
  columns: string[]
}

export interface Entity {
  id: Id
  name: string
  code: string
  comment?: string
  position: Point
  attributes: Attribute[]
  identifiers: Identifier[]
  /** Alternate keys over PDM columns (incl. migrated ones). */
  physicalKeys?: PhysicalKey[]
}

/** PD-style cardinality of one relationship end: `min,max`. */
export interface Cardinality {
  min: 0 | 1
  max: 1 | 'n'
}

export type Side = 'A' | 'B'

/**
 * A binary relationship.
 * `cardinalityA` is drawn at A's end: how many A instances one B is related to.
 * Example (TV Shows): A = TVShow `1,1`, B = Episode `1,n` — every episode has exactly one show,
 * a show has one or more episodes.
 * `dependentSide` names the entity that is identified *through* the other one.
 */
export interface Relationship {
  id: Id
  name: string
  entityA: Id
  entityB: Id
  cardinalityA: Cardinality
  cardinalityB: Cardinality
  roleA?: string
  roleB?: string
  dependentSide: Side | null
  /** One-to-one only: the entity whose table holds the FK. Default: see cdm2pdm `foreignKeyHolder`. */
  foreignKeySide?: Side
  comment?: string
}

export type InheritanceGeneration = 'parent' | 'children' | 'both'

export interface Inheritance {
  id: Id
  name: string
  parentId: Id
  childIds: Id[]
  mutuallyExclusive: boolean
  complete: boolean
  generation: InheritanceGeneration
  /** Optional discriminator column name, used with generation = parent. */
  discriminator?: string
  /** Position of the inheritance symbol on the canvas. */
  position: Point
  comment?: string
}

export const MODEL_FORMAT = 'strata-cdm'
export const MODEL_VERSION = 1

export interface Model {
  format: typeof MODEL_FORMAT
  version: typeof MODEL_VERSION
  name: string
  comment?: string
  domains: Domain[]
  entities: Entity[]
  relationships: Relationship[]
  inheritances: Inheritance[]
}

export const CARD = {
  zeroOne: { min: 0, max: 1 },
  oneOne: { min: 1, max: 1 },
  zeroMany: { min: 0, max: 'n' },
  oneMany: { min: 1, max: 'n' },
} as const satisfies Record<string, Cardinality>

export function formatCardinality(c: Cardinality): string {
  return `${c.min},${c.max}`
}

export function parseCardinality(text: string): Cardinality | null {
  const m = /^\s*([01])\s*,\s*(1|n)\s*$/i.exec(text)
  if (!m) return null
  return { min: m[1] === '1' ? 1 : 0, max: m[2].toLowerCase() === 'n' ? 'n' : 1 }
}

export function otherSide(side: Side): Side {
  return side === 'A' ? 'B' : 'A'
}

export function entityOf(rel: Relationship, side: Side): Id {
  return side === 'A' ? rel.entityA : rel.entityB
}

export function cardinalityOf(rel: Relationship, side: Side): Cardinality {
  return side === 'A' ? rel.cardinalityA : rel.cardinalityB
}

export function primaryIdentifier(entity: Entity): Identifier | undefined {
  return entity.identifiers.find((i) => i.isPrimary)
}

export function emptyModel(name = 'Untitled model'): Model {
  return {
    format: MODEL_FORMAT,
    version: MODEL_VERSION,
    name,
    domains: [],
    entities: [],
    relationships: [],
    inheritances: [],
  }
}
