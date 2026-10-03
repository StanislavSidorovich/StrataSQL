// CDM → PDM generation (SPEC §6). Pure function of the model: the PDM is never edited directly;
// the few physical choices (1:1 FK side, AKs over migrated columns) live in the CDM.
//
// Order of work:
//   1. which entity gets a table (inheritance generation modes)
//   2. every reference that becomes a FK (relationships + inheritance "both"), and its role prefix
//   3. the key of every entity, following dependencies (a dependent's key includes its parents' keys)
//   4. tables: key columns, attributes, FKs, AKs, checks; then join tables for M:N relationships

import {
  cardinalityOf,
  entityOf,
  otherSide,
  primaryIdentifier,
  type Attribute,
  type Entity,
  type Id,
  type Inheritance,
  type Model,
  type Relationship,
  type Side,
} from './metamodel'
import { toAttributeCode, toEntityCode, uniqueName } from './ops'
import type { Pdm, PdmColumn, PdmForeignKey, PdmNote, PdmSource, PdmTable } from './pdm'

/** A CDM link that becomes a foreign key: `holder`'s table references `target`'s table. */
export interface Reference {
  source: PdmSource
  holder: Id
  target: Id
  /** The FK columns join the holder's primary key (dependent entity, inheritance child). */
  identifying: boolean
  /** NOT NULL — the target end has min 1. */
  mandatory: boolean
  /** One-to-one: the FK columns get a UNIQUE constraint. */
  unique: boolean
  /** Column prefix (`from` → `from_stop_id`) when needed to tell two references apart. */
  prefix: string | null
  /** Middle part of the FK constraint name: role or relationship name. */
  label: string
}

export type RelationshipKind = 'one-to-many' | 'one-to-one' | 'many-to-many'

export function relationshipKind(r: Relationship): RelationshipKind {
  if (r.cardinalityA.max === 'n' && r.cardinalityB.max === 'n') return 'many-to-many'
  if (r.cardinalityA.max === 1 && r.cardinalityB.max === 1) return 'one-to-one'
  return 'one-to-many'
}

/**
 * The side whose table holds the FK (`null` for many-to-many: a join table holds both).
 * One-to-many: the "many" side. Dependent: the dependent side. One-to-one: the side chosen by the
 * user, else the side that must have a partner (its FK is then NOT NULL), else B.
 */
export function foreignKeyHolder(r: Relationship): Side | null {
  const kind = relationshipKind(r)
  if (kind === 'many-to-many') return null
  if (r.dependentSide) return r.dependentSide
  if (kind === 'one-to-many') return r.cardinalityA.max === 1 ? 'B' : 'A'
  if (r.foreignKeySide) return r.foreignKeySide
  if (r.cardinalityA.min === 1 && r.cardinalityB.min === 0) return 'B'
  if (r.cardinalityB.min === 1 && r.cardinalityA.min === 0) return 'A'
  return 'B'
}

function roleOf(r: Relationship, side: Side): string | undefined {
  return (side === 'A' ? r.roleA : r.roleB)?.trim() || undefined
}

/** SQL constraint-name part: `has episodes` → `HAS_EPISODES`. */
function namePart(text: string): string {
  return toEntityCode(text) || 'REF'
}

// ---------------------------------------------------------------- column set

/**
 * The columns of one table (or key) under construction. A column whose origin is already present
 * is shared instead of duplicated; a different column with a taken name is renamed.
 */
class ColumnSet {
  readonly columns: PdmColumn[] = []

  /** `reserved`: names of attributes that will be added later (lower-case name → origin). */
  constructor(private readonly reserved = new Map<string, string>()) {}

  byOrigin(origin: string): PdmColumn | undefined {
    return this.columns.find((c) => c.origin === origin)
  }

  private taken(name: string, origin: string): boolean {
    const n = name.toLowerCase()
    if (this.columns.some((c) => c.name.toLowerCase() === n)) return true
    const r = this.reserved.get(n)
    return r !== undefined && r !== origin
  }

  /** Adds the column, or merges it into the column with the same origin. Returns the column used. */
  add(col: PdmColumn, renamePrefix: string): { column: PdmColumn; shared: boolean; renamed: boolean } {
    const existing = this.byOrigin(col.origin)
    if (existing) {
      existing.nullable &&= col.nullable
      return { column: existing, shared: true, renamed: false }
    }
    let name = col.name
    if (this.taken(name, col.origin)) {
      name = `${renamePrefix}_${col.name}`
      for (let i = 2; this.taken(name, col.origin); i++) name = `${renamePrefix}_${col.name}_${i}`
    }
    const added = { ...col, name }
    this.columns.push(added)
    return { column: added, shared: false, renamed: name !== col.name }
  }
}

function attributeColumn(e: Entity, a: Attribute, nullable: boolean): PdmColumn {
  return {
    name: a.code || toAttributeCode(a.name),
    dataType: a.dataType,
    length: a.length,
    precision: a.precision,
    nullable,
    origin: a.id,
    migrated: false,
    source: { kind: 'attribute', entityId: e.id, attributeId: a.id },
    comment: a.comment,
  }
}

/** A column of `key` as it arrives through a reference (prefixed when the reference needs it). */
function migratedColumn(key: PdmColumn, ref: { prefix: string | null; source: PdmSource }, nullable: boolean): PdmColumn {
  const via = ref.source.kind === 'relationship' || ref.source.kind === 'inheritance' ? ref.source.id : ''
  return {
    ...key,
    name: ref.prefix ? `${ref.prefix}_${key.name}` : key.name,
    origin: ref.prefix ? `${via}~${key.origin}` : key.origin,
    nullable,
    migrated: true,
    comment: undefined,
  }
}

// ---------------------------------------------------------------- generator

export function generatePdm(m: Model): Pdm {
  return new Generator(m).run()
}

class Generator {
  private readonly entities = new Map<Id, Entity>()
  private readonly childInh = new Map<Id, Inheritance>()
  private readonly parentInh = new Map<Id, Inheritance>()
  private readonly notes: PdmNote[] = []
  private readonly refs: Reference[] = []
  private readonly keys = new Map<Id, PdmColumn[]>()
  private readonly visiting = new Set<Id>()
  private readonly tableNames = new Map<Id, string>()
  private readonly constraintNames = new Set<string>()
  private readonly reported = new Set<string>()

  constructor(private readonly m: Model) {
    for (const e of m.entities) this.entities.set(e.id, e)
    for (const inh of m.inheritances) {
      if (!this.parentInh.has(inh.parentId)) this.parentInh.set(inh.parentId, inh)
      for (const c of inh.childIds) this.childInh.set(c, inh)
    }
  }

  run(): Pdm {
    const tableEntities = this.m.entities.filter((e) => this.tableEntity(e.id) === e.id)
    const usedTableNames: string[] = []
    for (const e of tableEntities) {
      const name = uniqueName(e.code || toEntityCode(e.name) || 'TABLE', usedTableNames)
      if (name.toLowerCase() !== (e.code || toEntityCode(e.name)).toLowerCase())
        this.note('warning', `Two entities have the code ${e.code}; the table of ${e.name} is named ${name}.`, name, { kind: 'entity', id: e.id })
      usedTableNames.push(name)
      this.tableNames.set(e.id, name)
    }
    this.collectReferences()
    const tables = tableEntities.map((e) => this.buildTable(e))
    for (const r of this.m.relationships) {
      if (relationshipKind(r) !== 'many-to-many') continue
      const t = this.buildJoinTable(r, usedTableNames)
      if (t) tables.push(t)
    }
    // FKs point at the referenced table's actual PK columns (renames happen per table).
    const byName = new Map(tables.map((t) => [t.name, t]))
    for (const t of tables) for (const fk of t.foreignKeys) fk.refColumns = byName.get(fk.refTable)?.primaryKey?.columns ?? fk.refColumns
    return { name: this.m.name, tables, notes: this.notes }
  }

  private note(level: PdmNote['level'], message: string, table?: string, source?: PdmSource): void {
    if (this.reported.has(message)) return
    this.reported.add(message)
    this.notes.push({ level, message, table, source })
  }

  private entity(id: Id): Entity {
    return this.entities.get(id)!
  }

  private constraintName(base: string): string {
    const name = uniqueName(base, this.constraintNames)
    this.constraintNames.add(name)
    return name
  }

  // ------------------------------------------------------------ 1. tables and inheritance

  /** The entity whose table stores this entity's rows; `null` when it has no table. */
  tableEntity(id: Id): Id | null {
    const inh = this.childInh.get(id)
    if (inh?.generation === 'parent') return this.tableEntity(inh.parentId)
    if (this.parentInh.get(id)?.generation === 'children') return null
    return id
  }

  /** Tables that hold this entity's columns and FKs (several for a "children only" parent). */
  private tablesOf(id: Id): Id[] {
    const t = this.tableEntity(id)
    if (t) return [t]
    return (this.parentInh.get(id)?.childIds ?? []).flatMap((c) => this.tablesOf(c))
  }

  private tableName(entityId: Id): string {
    return this.tableNames.get(entityId)!
  }

  // ------------------------------------------------------------ 2. references

  private collectReferences(): void {
    for (const inh of this.m.inheritances) {
      if (inh.generation !== 'both') continue
      for (const c of inh.childIds)
        this.refs.push({
          source: { kind: 'inheritance', id: inh.id },
          holder: c,
          target: inh.parentId,
          identifying: true,
          mandatory: true,
          unique: false,
          prefix: null,
          label: namePart(inh.name),
        })
    }
    const fromRelationships: Reference[] = []
    const targetRole = new Map<Reference, { r: Relationship; role?: string }>()
    for (const r of this.m.relationships) {
      const holderSide = foreignKeyHolder(r)
      if (!holderSide) continue
      const targetSide = otherSide(holderSide)
      const role = roleOf(r, targetSide) ?? roleOf(r, holderSide)
      const ref: Reference = {
        source: { kind: 'relationship', id: r.id },
        holder: entityOf(r, holderSide),
        target: entityOf(r, targetSide),
        identifying: r.dependentSide === holderSide,
        mandatory: cardinalityOf(r, targetSide).min === 1,
        unique: relationshipKind(r) === 'one-to-one',
        prefix: null,
        label: namePart(role ?? r.name),
      }
      fromRelationships.push(ref)
      targetRole.set(ref, { r, role: roleOf(r, targetSide) })
    }
    // Same neighbour twice (or reflexive) → each reference prefixes its columns with its role.
    const tableKey = (id: Id) => this.tableEntity(id) ?? id
    const group = new Map<string, Reference[]>()
    for (const ref of [...this.refs, ...fromRelationships]) {
      const k = `${tableKey(ref.holder)}→${tableKey(ref.target)}`
      group.set(k, [...(group.get(k) ?? []), ref])
    }
    for (const ref of fromRelationships) {
      const reflexive = tableKey(ref.holder) === tableKey(ref.target)
      const siblings = group.get(`${tableKey(ref.holder)}→${tableKey(ref.target)}`)!
      if (!reflexive && siblings.length < 2) continue
      const { r, role } = targetRole.get(ref)!
      const taken = siblings.filter((s) => s !== ref && s.prefix).map((s) => s.prefix!)
      ref.prefix = uniqueName(toAttributeCode(role ?? r.name) || 'ref', taken)
      if (!role)
        this.note(
          'warning',
          `${r.name}: ${this.entity(ref.holder).name} references ${this.entity(ref.target).name} more than once` +
            `${reflexive ? ' (reflexive)' : ''}; its columns are prefixed with the relationship name. Give the relationship roles.`,
          undefined,
          ref.source,
        )
    }
    this.refs.push(...fromRelationships)
  }

  // ------------------------------------------------------------ 3. keys

  /** Primary key columns of an entity, following dependencies and inheritance. */
  keyOf(id: Id): PdmColumn[] {
    const cached = this.keys.get(id)
    if (cached) return cached
    const e = this.entity(id)
    if (this.visiting.has(id)) {
      this.note('warning', `Dependency cycle through ${e.name}: an entity cannot be identified through itself.`, undefined, { kind: 'entity', id })
      return []
    }
    this.visiting.add(id)
    let key: PdmColumn[]
    const inh = this.childInh.get(id)
    if (inh) {
      // An inheritance child is identified like its parent.
      key = this.keyOf(inh.parentId).map((c) => ({ ...c, migrated: c.migrated || inh.generation === 'both' }))
      if (primaryIdentifier(e)?.attributeIds.length)
        this.note('info', `${e.name} inherits the identifier of ${this.entity(inh.parentId).name}; its own primary identifier becomes an alternate key.`, undefined, { kind: 'entity', id })
    } else {
      const set = new ColumnSet(this.reservedNames(id))
      for (const ref of this.refs) {
        if (!ref.identifying || ref.holder !== id || ref.source.kind !== 'relationship') continue
        const targetTable = this.tableEntity(ref.target)
        for (const c of this.keyOf(ref.target)) set.add(migratedColumn(c, ref, false), targetTable ? this.tableName(targetTable).toLowerCase() : 'ref')
      }
      const pi = primaryIdentifier(e)
      for (const aid of pi?.attributeIds ?? []) {
        const a = e.attributes.find((x) => x.id === aid)
        if (a) set.add(attributeColumn(e, a, false), toAttributeCode(e.name))
      }
      key = set.columns
    }
    this.visiting.delete(id)
    this.keys.set(id, key)
    return key
  }

  // ------------------------------------------------------------ 4. tables

  /** Entities whose attributes land in the table of `t`, with whether they become nullable. */
  private contributors(t: Id): { entity: Entity; forceNullable: boolean }[] {
    const ancestors: Entity[] = []
    // Generation = children copies the parent's attributes; so does generation = both with “inherit all”.
    for (let inh = this.childInh.get(t); inh && (inh.generation === 'children' || (inh.generation === 'both' && inh.inheritAll)); inh = this.childInh.get(inh.parentId))
      ancestors.unshift(this.entity(inh.parentId))
    const merged: Entity[] = []
    const collect = (id: Id) => {
      const inh = this.parentInh.get(id)
      if (inh?.generation !== 'parent') return
      for (const c of inh.childIds) {
        merged.push(this.entity(c))
        collect(c)
      }
    }
    collect(t)
    return [
      ...ancestors.map((entity) => ({ entity, forceNullable: false })),
      { entity: this.entity(t), forceNullable: false },
      ...merged.map((entity) => ({ entity, forceNullable: true })),
    ]
  }

  /** Attribute names of a table, so migrated columns get renamed instead of the attributes. */
  private reservedNames(id: Id): Map<string, string> {
    const out = new Map<string, string>()
    for (const { entity } of this.contributors(id)) for (const a of entity.attributes) out.set((a.code || a.name).toLowerCase(), a.id)
    return out
  }

  private buildTable(e: Entity): PdmTable {
    const name = this.tableName(e.id)
    const contributors = this.contributors(e.id)
    const set = new ColumnSet(this.reservedNames(e.id))
    const prefixFor = (entity: Entity) => toAttributeCode(entity.name)

    const key = this.keyOf(e.id)
    for (const c of key) set.add({ ...c, nullable: false }, 'pk')
    for (const { entity, forceNullable } of contributors)
      for (const a of entity.attributes) set.add(attributeColumn(entity, a, forceNullable || !a.mandatory), prefixFor(entity))

    if (forceNullableNote(contributors))
      this.note('info', `${contributors.filter((c) => c.forceNullable).map((c) => c.entity.name).join(', ')} stored in ${name} (generation = parent): their columns are nullable.`, name, { kind: 'entity', id: e.id })

    const table: PdmTable = {
      name,
      source: { kind: 'entity', id: e.id },
      comment: e.comment,
      columns: set.columns,
      primaryKey: null,
      alternateKeys: [],
      foreignKeys: [],
      checks: [],
    }

    // Discriminator of a single-table inheritance.
    const ownInh = this.parentInh.get(e.id)
    if (ownInh?.generation === 'parent' && ownInh.discriminator?.trim()) {
      const col = set.add(
        {
          name: toAttributeCode(ownInh.discriminator),
          dataType: 'Variable characters',
          length: Math.max(10, ...ownInh.childIds.map((c) => this.entity(c).name.length)),
          nullable: !ownInh.complete,
          origin: `${ownInh.id}~discriminator`,
          migrated: false,
          source: { kind: 'inheritance', id: ownInh.id },
          comment: `Which kind of ${e.name} the row is`,
        },
        'type',
      ).column
      if (ownInh.mutuallyExclusive) {
        const values = ownInh.childIds.map((c) => `'${this.entity(c).name.replace(/'/g, "''")}'`).join(', ')
        table.checks.push({
          name: this.constraintName(`CK_${name}_${namePart(col.name)}`),
          expression: `${col.name} IN (${values})`,
          source: { kind: 'inheritance', id: ownInh.id },
        })
      }
    }

    // Foreign keys.
    const usedBy = new Map<PdmColumn, string[]>()
    for (const ref of this.refs) {
      if (!this.tablesOf(ref.holder).includes(e.id)) continue
      const fk = this.buildForeignKey(table, set, ref)
      if (!fk) continue
      table.foreignKeys.push(fk)
      for (const c of fk.columns) {
        const col = set.columns.find((x) => x.name === c)!
        usedBy.set(col, [...(usedBy.get(col) ?? []), fk.name])
      }
      if (ref.unique && !sameColumns(fk.columns, key.map((c) => set.byOrigin(c.origin)?.name ?? c.name)))
        table.alternateKeys.push({ name: this.constraintName(`AK_${ref.label}_${name}`), columns: fk.columns, source: ref.source })
    }
    for (const [col, fks] of usedBy)
      if (fks.length > 1)
        this.note('info', `${name}.${col.name} is one shared column for ${fks.join(' and ')}: both references must agree on it.`, name, col.source)

    // Column order as in PowerDesigner: key columns, then the other foreign key columns, then attributes.
    const pkOrigins = new Set(key.map((c) => c.origin))
    const fkCols = new Set(usedBy.keys())
    const rank = (c: PdmColumn) => (pkOrigins.has(c.origin) ? 0 : fkCols.has(c) ? 1 : 2)
    const ordered = [...set.columns].sort((x, y) => rank(x) - rank(y))
    set.columns.splice(0, set.columns.length, ...ordered)

    // Primary key.
    if (key.length) table.primaryKey = { name: this.constraintName(`PK_${name}`), columns: key.map((c) => set.byOrigin(c.origin)!.name) }
    else this.note('warning', `${name} has no primary key: ${e.name} has no primary identifier and is not dependent.`, name, { kind: 'entity', id: e.id })

    // Alternate keys: CDM alternate identifiers, then keys over PDM columns.
    for (const { entity } of contributors) {
      const inherits = this.childInh.has(entity.id)
      for (const ident of entity.identifiers) {
        if (ident.isPrimary && !inherits) continue
        const cols = ident.attributeIds.map((a) => set.byOrigin(a)?.name).filter((c): c is string => !!c)
        if (!cols.length) continue
        table.alternateKeys.push({
          name: this.constraintName(`AK_${namePart(ident.name)}_${name}`),
          columns: cols,
          source: { kind: 'identifier', entityId: entity.id, identifierId: ident.id },
        })
      }
      for (const k of entity.physicalKeys ?? []) {
        const cols = k.columns.map((c) => set.columns.find((x) => x.name.toLowerCase() === c.toLowerCase())?.name)
        const missing = k.columns.filter((_, i) => !cols[i])
        const source: PdmSource = { kind: 'physicalKey', entityId: entity.id, keyId: k.id }
        if (missing.length || !cols.length) {
          this.note('warning', `Key ${k.name} on ${name} skipped: ${missing.length ? `no column ${missing.join(', ')}` : 'no columns'}.`, name, source)
          continue
        }
        table.alternateKeys.push({ name: this.constraintName(k.name), columns: cols as string[], source })
      }
    }
    for (const ak of table.alternateKeys)
      if (ak.columns.some((c) => set.columns.find((x) => x.name === c)?.nullable))
        this.note('info', `${ak.name} includes nullable columns; SQL Server allows only one row with NULL in a UNIQUE key.`, name, ak.source)
    return table
  }

  private buildForeignKey(table: PdmTable, set: ColumnSet, ref: Reference): PdmForeignKey | null {
    const targetTable = this.tableEntity(ref.target)
    const what = ref.source.kind === 'relationship' ? (this.m.relationships.find((r) => r.id === (ref.source as { id: Id }).id)?.name ?? '') : 'inheritance'
    if (!targetTable) {
      this.note('warning', `${what}: ${this.entity(ref.target).name} has no table (inheritance generation = children), so no FK can reference it.`, table.name, ref.source)
      return null
    }
    const targetKey = this.keyOf(targetTable)
    if (!targetKey.length) {
      this.note('warning', `${what}: ${this.tableName(targetTable)} has no primary key, so no FK can reference it.`, table.name, ref.source)
      return null
    }
    const holderMerged = this.tableEntity(ref.holder) !== null && this.tableEntity(ref.holder) !== ref.holder
    const nullable = !ref.identifying && (!ref.mandatory || holderMerged)
    const refTableName = this.tableName(targetTable)
    const columns = targetKey.map((c) => set.add(migratedColumn(c, ref, nullable), refTableName.toLowerCase()).column.name)
    return {
      name: this.constraintName(`FK_${table.name}_${ref.label}_${refTableName}`),
      columns,
      refTable: refTableName,
      refColumns: targetKey.map((c) => c.name),
      identifying: ref.identifying,
      mandatory: !nullable,
      source: ref.source,
    }
  }

  /** Many-to-many → join table whose PK is both FKs. */
  private buildJoinTable(r: Relationship, usedTableNames: string[]): PdmTable | null {
    const ends = (['A', 'B'] as const).map((side) => {
      const id = entityOf(r, side)
      const t = this.tableEntity(id)
      return { side, entity: this.entity(id), table: t, key: t ? this.keyOf(t) : [] }
    })
    for (const end of ends)
      if (!end.table || !end.key.length) {
        this.note('warning', `${r.name}: ${end.entity.name} has no ${end.table ? 'primary key' : 'table'}, so its join table cannot be generated.`, undefined, { kind: 'relationship', id: r.id })
        return null
      }
    const name = uniqueName(toEntityCode(r.name) || 'JOIN', usedTableNames)
    usedTableNames.push(name)
    const origins = new Set(ends[0].key.map((c) => c.origin))
    const clash = ends[0].table === ends[1].table || ends[1].key.some((c) => origins.has(c.origin))
    const set = new ColumnSet()
    const source: PdmSource = { kind: 'relationship', id: r.id }
    const table: PdmTable = {
      name,
      source,
      comment: r.comment ?? `Join table of the many-to-many relationship ${r.name} (${ends[0].entity.name} — ${ends[1].entity.name}).`,
      columns: set.columns,
      primaryKey: null,
      alternateKeys: [],
      foreignKeys: [],
      checks: [],
    }
    for (const end of ends) {
      const role = roleOf(r, end.side)
      const prefix = clash ? toAttributeCode(role ?? end.entity.name) + (ends[0].entity === ends[1].entity && !role ? `_${end.side.toLowerCase()}` : '') : null
      const refTableName = this.tableName(end.table!)
      const columns = end.key.map((c) => set.add(migratedColumn(c, { prefix, source: { kind: 'relationship', id: `${r.id}:${end.side}` } }, false), refTableName.toLowerCase()).column.name)
      table.foreignKeys.push({
        name: this.constraintName(`FK_${name}_${namePart(role ?? r.name)}_${refTableName}`),
        columns,
        refTable: refTableName,
        refColumns: end.key.map((c) => c.name),
        identifying: true,
        mandatory: true,
        source,
      })
    }
    for (const c of set.columns) c.source = source
    table.primaryKey = { name: this.constraintName(`PK_${name}`), columns: set.columns.map((c) => c.name) }
    this.note('info', `${r.name} is many-to-many: it becomes the join table ${name} with PK (${table.primaryKey.columns.join(', ')}).`, name, source)
    return table
  }
}

function forceNullableNote(contributors: { forceNullable: boolean; entity: Entity }[]): boolean {
  return contributors.some((c) => c.forceNullable && c.entity.attributes.length > 0)
}

function sameColumns(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c))
}
