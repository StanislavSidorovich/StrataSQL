// SQL tables → conceptual model: the CDM → PDM rules (SPEC §6) read backwards.
//   table                         → entity (code = table name, so the table keeps its name)
//   column that is not in a FK    → attribute (NOT NULL → mandatory)
//   PK over own columns           → primary identifier <pi>
//   UNIQUE over own columns       → alternate identifier <ai>; over migrated columns → a physical key
//   FOREIGN KEY                   → relationship; its columns are migrated, so no attributes:
//       FK NOT NULL               → the referenced end has min 1, else 0
//       FK columns UNIQUE (or PK) → one-to-one, else one-to-many
//       FK columns inside the PK  → the table's entity is dependent (identified through the other)
//       `role_col` for `col`      → the role (reflexive links, two links to the same table)
//   two FKs that are the whole PK → an intermediate entity (the course's way to model many-to-many)
// SQL cannot say how many rows of the referencing table a referenced row must have: that minimum
// is set to 0 and the report says so.
//
// `applySqlScript` mutates the model it is given (ops style), so it runs on an immer draft too:
// into an empty model for File → Open, or into the current one from the Sandbox console.

import { generatePdm } from '../cdm2pdm'
import type { Cardinality, Entity, Id, Model, Point } from '../metamodel'
import {
  addAttribute,
  addIdentifier,
  addPhysicalKey,
  addEntity,
  addRelationship,
  getEntity,
  removeAttribute,
  setAttributeInPrimary,
  setForeignKeySide,
} from '../ops'
import type { SqlColumn, SqlForeignKey, SqlKey, SqlScript, SqlTable } from './sql-reader'

export interface SqlApplyReport {
  /** What was added, one line each, in the order it was done. */
  changes: string[]
  /** What was skipped or guessed. */
  warnings: string[]
  counts: { entities: number; attributes: number; relationships: number; identifiers: number }
  /** Ids of the entities created, for selecting / centring them. */
  entityIds: Id[]
  /** The first relationship added (one end-many example for the minimums note). */
  example?: { one: string; many: string }
}

/** A table the script can refer to: one already generated from the model, or one created here. */
interface Known {
  entityId: Id | null
  /** The model's table that belongs to a relationship (M:N join table): no entity to link to. */
  join?: boolean
  pk: string[]
  columns: string[]
  /** Foreign keys and unique keys the table already has (so a pasted script adds nothing twice). */
  fks: { columns: string[]; refTable: string }[]
  uniques: string[][]
}

const lower = (s: string) => s.toLowerCase()
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.some((y) => lower(x) === lower(y)))
const subset = (a: string[], b: string[]) => a.length > 0 && a.every((x) => b.some((y) => lower(x) === lower(y)))
const has = (list: string[], x: string) => list.some((y) => lower(y) === lower(x))

/** `BOOKED_ROOM` → `Booked Room`, `TVShow` stays, `order_line` → `Order Line`. */
export function entityNameFromTable(table: string): string {
  if (!/[_\s]/.test(table) && /[a-z]/.test(table) && /[A-Z]/.test(table)) return table
  return table
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** The middle of a generated FK name: `FK_EPISODE_HAS_TVSHOW` (holder EPISODE, target TVSHOW) → `HAS`. */
function labelOf(fk: SqlForeignKey, holder: string, target: string): string | null {
  const m = /^FK_(.+)$/i.exec(fk.name ?? '')
  if (!m) return null
  let rest = m[1]
  if (lower(rest).startsWith(lower(holder) + '_')) rest = rest.slice(holder.length + 1)
  if (lower(rest).endsWith('_' + lower(target))) rest = rest.slice(0, -(target.length + 1))
  return rest || null
}

/** `home_team_id` referencing `team_id` → `home`; null when the columns carry no common prefix. */
function rolePrefix(columns: string[], refColumns: string[]): string | null {
  let prefix: string | null = null
  for (let i = 0; i < columns.length; i++) {
    const col = lower(columns[i])
    const ref = lower(refColumns[i] ?? '')
    if (!ref || col === ref || !col.endsWith('_' + ref)) return null
    const p = col.slice(0, -(ref.length + 1))
    if (prefix !== null && p !== prefix) return null
    prefix = p
  }
  return prefix
}

const card = (min: 0 | 1, max: 1 | 'n'): Cardinality => ({ min, max })

export function applySqlScript(m: Model, script: SqlScript): SqlApplyReport {
  const report: SqlApplyReport = { changes: [], warnings: [...script.warnings], counts: { entities: 0, attributes: 0, relationships: 0, identifiers: 0 }, entityIds: [] }
  const warn = (w: string) => report.warnings.push(w)

  // Tables the model generates today.
  const known = new Map<string, Known>()
  for (const t of generatePdm(m).tables)
    known.set(lower(t.name), {
      entityId: t.source.kind === 'entity' ? t.source.id : null,
      join: t.source.kind !== 'entity',
      pk: t.primaryKey?.columns ?? [],
      columns: t.columns.map((c) => c.name),
      fks: t.foreignKeys.map((fk) => ({ columns: fk.columns, refTable: fk.refTable })),
      uniques: t.alternateKeys.map((k) => k.columns),
    })

  // 1. An entity per new table.
  const created: { table: SqlTable; entity: Entity }[] = []
  const already: string[] = []
  for (const table of script.tables) {
    if (known.has(lower(table.name))) {
      already.push(table.name)
      continue
    }
    const entity = addEntity(m, { name: entityNameFromTable(table.name), code: table.name, comment: table.comment })
    created.push({ table, entity })
    known.set(lower(table.name), { entityId: entity.id, pk: table.primaryKey?.columns ?? [], columns: table.columns.map((c) => c.name), fks: [], uniques: [] })
    report.entityIds.push(entity.id)
    report.counts.entities++
  }

  if (already.length)
    warn(
      already.length === 1
        ? `Table ${already[0]} is already in the model; its CREATE TABLE was skipped. Add columns with ALTER TABLE ${already[0]} ADD …`
        : `${already.length} tables are already in the model (${already.join(', ')}); their CREATE TABLEs were skipped.`,
    )

  /** The FK's target entity, or null (with a warning) when it cannot become a relationship. */
  const resolve = (holder: string, fk: SqlForeignKey): { target: Known & { entityId: Id }; refColumns: string[] } | null => {
    const target = known.get(lower(fk.refTable))
    const what = `${holder} (${fk.columns.join(', ')}) → ${fk.refTable}`
    if (!target) {
      warn(`${what}: table ${fk.refTable} is neither in the script nor in the model, so this foreign key stays plain columns.`)
      return null
    }
    if (!target.entityId) {
      warn(`${what}: ${fk.refTable} is the join table of a many-to-many relationship; an entity cannot reference it. Turn that relationship into an intermediate entity first.`)
      return null
    }
    const refColumns = fk.refColumns.length ? fk.refColumns : target.pk
    if (target.pk.length && !sameSet(refColumns, target.pk))
      warn(`${what}: it references (${refColumns.join(', ')}), not the primary key of ${fk.refTable}; the relationship will reference the primary key.`)
    if (fk.columns.length !== refColumns.length && refColumns.length) warn(`${what}: ${fk.columns.length} column(s) reference ${refColumns.length}; check the relationship.`)
    return { target: target as Known & { entityId: Id }, refColumns }
  }

  // 2. Attributes and identifiers of the new tables.
  const fksOf = new Map<Entity, { fk: SqlForeignKey; target: Id; refColumns: string[] }[]>()
  for (const { table, entity } of created) {
    const fks = table.foreignKeys.flatMap((fk) => {
      const r = resolve(table.name, fk)
      return r ? [{ fk, target: r.target.entityId, refColumns: r.refColumns }] : []
    })
    fksOf.set(entity, fks)
    const migrated = fks.flatMap((f) => f.fk.columns)
    const pk = table.primaryKey?.columns ?? []
    const own = table.columns.filter((c) => !has(migrated, c.name))
    for (const col of own) addColumnAttribute(m, entity, col, has(pk, col.name), report)
    for (const col of table.columns) if (!col.knownType) warn(`${table.name}.${col.name}: type ${col.type} is not known; read as Variable characters(50).`)
    const pkMigrated = pk.filter((c) => has(migrated, c))
    const covered = fks.filter((f) => subset(f.fk.columns, pk)).flatMap((f) => f.fk.columns)
    if (pkMigrated.some((c) => !has(covered, c)))
      warn(`${table.name}: its primary key holds only part of a foreign key; the model cannot express that, so check the dependency.`)
    if (!pk.length && !fks.some((f) => subset(f.fk.columns, pk))) warn(`${table.name} has no primary key: give ${entity.name} an identifier.`)
    for (const key of table.uniques) addUniqueKey(m, entity, key, migrated, fks.map((f) => f.fk.columns), report)
    if (table.checks) warn(`${table.name}: ${table.checks} CHECK constraint(s) skipped — the conceptual model has no place for them.`)
    const attrs = entity.attributes.length
    report.changes.push(`Entity ${entity.name} (table ${table.name})${attrs ? ` with ${attrs} attribute${attrs > 1 ? 's' : ''}` : ''}`)
  }

  // 3. Relationships of the new tables.
  for (const { table, entity } of created) {
    const pk = table.primaryKey?.columns ?? []
    for (const f of fksOf.get(entity)!) {
      const cols = table.columns.filter((c) => has(f.fk.columns, c.name))
      const identifying = subset(f.fk.columns, pk)
      addFkRelationship(m, entity, table.name, f.fk, f.target, f.refColumns, report, {
        identifying,
        mandatory: identifying || (cols.length > 0 && cols.every((c) => !c.nullable)),
        unique: sameSet(f.fk.columns, pk) || table.uniques.some((u) => sameSet(u.columns, f.fk.columns)),
        keyIsFk: sameSet(f.fk.columns, pk),
      })
    }
  }

  // 4. ALTER TABLE … ADD on tables the model already has.
  for (const alter of script.alters) {
    const target = known.get(lower(alter.name))
    if (!target) {
      warn(`ALTER TABLE ${alter.name}: there is no table ${alter.name} in the model or the script; skipped.`)
      continue
    }
    if (!target.entityId) {
      warn(`ALTER TABLE ${alter.name}: ${alter.name} is the join table of a many-to-many relationship; turn it into an intermediate entity to give it columns. Skipped.`)
      continue
    }
    const entity = getEntity(m, target.entityId)
    for (const col of alter.columns) {
      if (has(target.columns, col.name)) {
        warn(`${alter.name}.${col.name} already exists; skipped.`)
        continue
      }
      addColumnAttribute(m, entity, col, false, report)
      report.changes.push(`Attribute ${entity.name}.${col.name} (${col.type || 'varchar'}${col.nullable ? '' : ', mandatory'})`)
    }
    if (alter.primaryKey) {
      const cols = alter.primaryKey.columns
      const attrs = cols.map((c) => entity.attributes.find((a) => lower(a.code || a.name) === lower(c)))
      if (target.pk.length) warn(`${alter.name} already has a primary key (${target.pk.join(', ')}): it comes from ${entity.name}'s identifier. Change the identifier on the diagram instead.`)
      else if (attrs.every(Boolean)) {
        for (const a of attrs) setAttributeInPrimary(m, entity.id, a!.id, true)
        report.changes.push(`Primary identifier of ${entity.name}: ${cols.join(', ')}`)
        report.counts.identifiers++
      } else warn(`${alter.name}: primary key (${cols.join(', ')}) names columns that are not attributes of ${entity.name}; skipped.`)
    }
    const newFks = alter.foreignKeys.filter((fk) => {
      const dup = target.fks.some((x) => lower(x.refTable) === lower(fk.refTable) && sameSet(x.columns, fk.columns))
      if (dup) warn(`${alter.name} (${fk.columns.join(', ')}) → ${fk.refTable} is already in the model; skipped.`)
      return !dup
    })
    const fks = newFks.flatMap((fk) => {
      const r = resolve(alter.name, fk)
      return r ? [{ fk, ...r }] : []
    })
    for (const { fk, target: t, refColumns } of fks) {
      // Columns typed as attributes become migrated ones: the relationship brings them.
      const identifying = subset(fk.columns, target.pk)
      let mandatory = identifying
      for (const col of fk.columns) {
        const a = entity.attributes.find((x) => lower(x.code || x.name) === lower(col))
        if (!a) continue
        mandatory ||= a.mandatory
        removeAttribute(m, entity.id, a.id)
        report.changes.push(`Attribute ${entity.name}.${a.name} removed: the relationship to ${getEntity(m, t.entityId).name} brings ${col} as a foreign key`)
      }
      addFkRelationship(m, entity, alter.name, fk, t.entityId, refColumns, report, {
        identifying,
        mandatory,
        unique: sameSet(fk.columns, target.pk) || alter.uniques.some((u) => sameSet(u.columns, fk.columns)),
        keyIsFk: sameSet(fk.columns, target.pk),
      })
    }
    const migrated = [...fks.flatMap((f) => f.fk.columns), ...target.columns.filter((c) => !entity.attributes.some((a) => lower(a.code || a.name) === lower(c)))]
    for (const key of alter.uniques) {
      if ([target.pk, ...target.uniques].some((k) => sameSet(k, key.columns))) warn(`${alter.name}: UNIQUE (${key.columns.join(', ')}) is already a key of the table; skipped.`)
      else addUniqueKey(m, entity, key, migrated, fks.map((f) => f.fk.columns), report)
    }
    if (alter.checks) warn(`${alter.name}: CHECK constraint(s) skipped — the conceptual model has no place for them.`)
  }

  if (report.example)
    warn(
      `SQL cannot say whether every ${report.example.one} must have at least one ${report.example.many}: the minimum at that end of each relationship is set to 0. Check them against the text.`,
    )

  layout(m, report.entityIds)
  return report
}

function addColumnAttribute(m: Model, entity: Entity, col: SqlColumn, inPk: boolean, report: SqlApplyReport): void {
  addAttribute(m, entity.id, { name: col.name, code: col.name, ...col.sqlType, mandatory: !col.nullable || inPk, primary: inPk })
  report.counts.attributes++
}

/** A UNIQUE key: an alternate identifier over own attributes, a physical key over migrated columns. */
function addUniqueKey(m: Model, entity: Entity, key: SqlKey, migrated: string[], fkColumns: string[][], report: SqlApplyReport): void {
  if (!key.columns.length) return
  if (fkColumns.some((cols) => sameSet(cols, key.columns))) return // the one-to-one relationship says it
  if (!key.columns.some((c) => has(migrated, c))) {
    const ids = key.columns.map((c) => entity.attributes.find((a) => lower(a.code || a.name) === lower(c))?.id)
    if (ids.every(Boolean)) {
      const name = /^AK_(.+)_/i.exec(key.name ?? '')?.[1] ?? key.name
      addIdentifier(m, entity.id, { name: name ? name[0] + name.slice(1).toLowerCase() : undefined, isPrimary: false, attributeIds: ids as Id[] })
      report.changes.push(`Alternate identifier <ai> of ${entity.name}: ${key.columns.join(', ')}`)
      report.counts.identifiers++
      return
    }
  }
  addPhysicalKey(m, entity.id, { name: key.name, columns: key.columns })
  report.changes.push(`Unique key ${key.name ?? ''} on ${entity.name} (${key.columns.join(', ')}), over columns that come through foreign keys`.replace('  ', ' '))
  report.counts.identifiers++
}

function addFkRelationship(
  m: Model,
  holder: Entity,
  holderTable: string,
  fk: SqlForeignKey,
  targetId: Id,
  refColumns: string[],
  report: SqlApplyReport,
  { identifying, mandatory, unique, keyIsFk }: { identifying: boolean; mandatory: boolean; unique: boolean; keyIsFk: boolean },
): void {
  const target = getEntity(m, targetId)
  const role = rolePrefix(fk.columns, refColumns)
  const label = labelOf(fk, holderTable, target.code || target.name)
  // Not made unique: both links of an intermediate entity (and all children of one inheritance) share
  // the name the FK constraints carry, which keeps the regenerated constraint names the same.
  const name = label ? label.toLowerCase() : (role ?? `${target.name}_${holder.name}`.replace(/\s+/g, '_'))
  const rel = addRelationship(m, target.id, holder.id, {
    name,
    cardinalityA: card(mandatory ? 1 : 0, 1),
    cardinalityB: card(0, unique ? 1 : 'n'),
    roleA: role ?? undefined,
    dependentSide: identifying ? 'B' : null,
  })
  if (unique) setForeignKeySide(m, rel.id, 'B')
  report.example ??= { one: target.name, many: holder.name }
  report.counts.relationships++
  const kind = unique ? 'one-to-one' : 'one-to-many'
  report.changes.push(
    `Relationship ${name}: ${target.name} ${mandatory ? '1,1' : '0,1'} — 0,${unique ? '1' : 'n'} ${holder.name} (${kind}${identifying ? `, ${holder.name} is dependent` : ''}${role ? `, role ${role}` : ''})`,
  )
  if (identifying && keyIsFk)
    report.warnings.push(
      `${holder.name}: its key is its foreign key to ${target.name}, so it was read as a dependent one-to-one. If every ${holder.name} is a kind of ${target.name}, replace the relationship with an inheritance.`,
    )
  if (!role && fk.columns.some((c, i) => refColumns[i] && lower(c) !== lower(refColumns[i])) && fk.columns.length === refColumns.length)
    report.warnings.push(
      `${holder.name}.${fk.columns.join(', ')} references ${target.name}.${refColumns.join(', ')} under another name; the generated table will use ${refColumns.join(', ')}. Give the relationship a role to keep a prefix.`,
    )
}

/** New entities in columns by dependency (referenced tables left), to the right of what is there. */
function layout(m: Model, ids: Id[]): void {
  if (!ids.length) return
  const fresh = new Set(ids)
  const others = m.entities.filter((e) => !fresh.has(e.id))
  const x0 = others.length ? Math.max(...others.map((e) => e.position.x)) + 320 : 40
  const y0 = others.length ? Math.min(...others.map((e) => e.position.y)) : 40
  const level = new Map<Id, number>(ids.map((id) => [id, 0]))
  // Longest path from a referenced entity; bounded so a cycle cannot loop.
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false
    for (const r of m.relationships) {
      const from = r.entityA
      const to = r.entityB
      if (!fresh.has(to) || from === to || !fresh.has(from)) continue
      const l = level.get(from)! + 1
      if (l > level.get(to)! && l < ids.length) {
        level.set(to, l)
        changed = true
      }
    }
    if (!changed) break
  }
  const y = new Map<number, number>()
  for (const id of ids) {
    const e = m.entities.find((x) => x.id === id)!
    const l = level.get(id)!
    const top = y.get(l) ?? y0
    e.position = { x: x0 + l * 320, y: top } satisfies Point
    y.set(l, top + 70 + 22 * Math.max(1, e.attributes.length) + 50)
  }
}
