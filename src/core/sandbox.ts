// SQL sandbox logic (stage 2.5): run statements against the generated schema and explain every
// rejection in terms of the PDM constraint — and the CDM element — that caused it.
// The database engine is injected (`SqlEngine`), so this module stays pure and testable.

import { PG_MAX_IDENT, generatePostgres, pgIdent, postgresType } from './ddl/postgres'
import { findColumn, type Pdm, type PdmColumn, type PdmSource, type PdmTable } from './pdm'

export interface SqlResult {
  columns: string[]
  rows: (string | null)[][]
  /** Rows inserted / updated / deleted, for statements that change data. */
  affected?: number
}

/** Error as reported by the engine (Postgres error fields). */
export interface DbError {
  message: string
  code?: string
  constraint?: string
  table?: string
  column?: string
  detail?: string
}

export interface SqlEngine {
  /** Runs one or more statements as one implicit transaction; a failing statement rolls back all. */
  run(sql: string): Promise<SqlResult[]>
}

export type ViolationKind = 'primaryKey' | 'alternateKey' | 'foreignKey' | 'check' | 'notNull' | 'type' | 'other'

export interface Violation {
  kind: ViolationKind
  /**
   * What rejected the row: the constraint name as in the PDM (`AK_ROOM_TIME`), or
   * `NOT NULL TABLE.column`. Scenarios compare against it.
   */
  rejectedBy?: string
  table?: string
  columns: string[]
  /** CDM element that produced the constraint. */
  source?: PdmSource
  title: string
  explanation: string
  /** Raw engine message (and detail), for the curious. */
  engineMessage: string
}

export type RunOutcome = { ok: true; results: SqlResult[] } | { ok: false; violation: Violation }

// ---------------------------------------------------------------- schema

/** Drops everything and creates the schema of `pdm` (the sandbox always starts empty). */
export async function resetDatabase(engine: SqlEngine, pdm: Pdm): Promise<void> {
  await engine.run('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  if (pdm.tables.length) await engine.run(generatePostgres(pdm))
}

export async function run(engine: SqlEngine, pdm: Pdm, sql: string): Promise<RunOutcome> {
  try {
    return { ok: true, results: await engine.run(sql) }
  } catch (e) {
    return { ok: false, violation: explainError(pdm, toDbError(e)) }
  }
}

export function toDbError(e: unknown): DbError {
  if (e && typeof e === 'object' && 'message' in e) {
    const x = e as Record<string, unknown>
    const s = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : undefined)
    return { message: String(x.message), code: s('code'), constraint: s('constraint'), table: s('table'), column: s('column'), detail: s('detail') }
  }
  return { message: String(e) }
}

// ---------------------------------------------------------------- statements

/** SQL literal for a value typed in a grid cell; empty → NULL. Postgres casts the quoted text to the column type. */
export function sqlLiteral(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}

/** INSERT for the filled cells only (empty cells are left out, so they become NULL). */
export function insertStatement(table: PdmTable, values: Record<string, string>): string {
  const cols = table.columns.filter((c) => (values[c.name] ?? '').trim() !== '')
  if (!cols.length) return `INSERT INTO ${pgIdent(table.name)} DEFAULT VALUES;`
  return `INSERT INTO ${pgIdent(table.name)} (${cols.map((c) => pgIdent(c.name)).join(', ')})\nVALUES (${cols.map((c) => sqlLiteral(values[c.name])).join(', ')});`
}

/** DELETE of one row by its primary key; null when the table has no PK. */
export function deleteStatement(table: PdmTable, row: Record<string, string | null>): string | null {
  const pk = table.primaryKey?.columns
  if (!pk?.length) return null
  const where = pk.map((c) => `${pgIdent(c)} = ${sqlLiteral(row[c] ?? row[c.toLowerCase()])}`).join(' AND ')
  return `DELETE FROM ${pgIdent(table.name)} WHERE ${where};`
}

/** Rows of a table in PK order (keys first, so related rows sit together). */
export function selectStatement(table: PdmTable, limit = 200): string {
  const order = table.primaryKey?.columns.length ? ` ORDER BY ${table.primaryKey.columns.map(pgIdent).join(', ')}` : ''
  return `SELECT ${table.columns.map((c) => pgIdent(c.name)).join(', ')} FROM ${pgIdent(table.name)}${order} LIMIT ${limit};`
}

/** The table the last INSERT / UPDATE / DELETE of `sql` writes to (the grid then shows it). */
export function touchedTable(pdm: Pdm, sql: string): string | undefined {
  const names = [...sql.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"([^"]+)"|(\w+))/gi)].map((m) => m[1] ?? m[2])
  const name = names.at(-1)
  return name ? pdm.tables.find((t) => t.name.toLowerCase() === name.toLowerCase())?.name : undefined
}

/** Hint shown in an empty grid cell: type and whether the value is required. */
export function cellHint(c: PdmColumn): string {
  return `${postgresType(c)}${c.nullable ? '' : ' *'}`
}

// ---------------------------------------------------------------- explanations

const sameIdent = (pgName: string | undefined, pdmName: string) =>
  !!pgName && pgName.toLowerCase() === pdmName.toLowerCase().slice(0, PG_MAX_IDENT)

const tuple = (cols: string[]) => (cols.length === 1 ? cols[0] : `(${cols.join(', ')})`)

/** Turns an engine error into the constraint that fired and a plain-language reason. */
export function explainError(pdm: Pdm, err: DbError): Violation {
  const engineMessage = err.detail ? `${err.message}\n${err.detail}` : err.message
  const table = err.table ? pdm.tables.find((t) => sameIdent(err.table, t.name)) : undefined
  const base = { engineMessage, columns: [] as string[] }

  if (err.constraint) {
    for (const t of table ? [table, ...pdm.tables] : pdm.tables) {
      if (t.primaryKey && sameIdent(err.constraint, t.primaryKey.name)) return explainPk(t, base)
      const ak = t.alternateKeys.find((k) => sameIdent(err.constraint, k.name))
      if (ak) {
        return {
          ...base,
          kind: 'alternateKey',
          rejectedBy: ak.name,
          table: t.name,
          columns: ak.columns,
          source: ak.source ?? t.source,
          title: `Unique key ${ak.name} rejected the row`,
          explanation: `Another ${t.name} row already has the same ${tuple(ak.columns)}. An alternate key says this combination may appear only once.`,
        }
      }
      const fk = t.foreignKeys.find((k) => sameIdent(err.constraint, k.name))
      if (fk) {
        const deleting = /^update or delete/i.test(err.message)
        return {
          ...base,
          kind: 'foreignKey',
          rejectedBy: fk.name,
          table: t.name,
          columns: fk.columns,
          source: fk.source,
          title: `Foreign key ${fk.name} rejected the ${deleting ? 'change' : 'row'}`,
          explanation: deleting
            ? `Rows of ${t.name} still reference this ${fk.refTable} row through ${tuple(fk.columns)}. Delete or change them first.`
            : `${t.name}.${tuple(fk.columns)} must match an existing row of ${fk.refTable} ${tuple(fk.refColumns)} — and no such row exists.` +
              (fk.identifying ? ` The key is part of the primary key: a ${t.name} row cannot exist without its ${fk.refTable}.` : ''),
        }
      }
      const ck = t.checks.find((k) => sameIdent(err.constraint, k.name))
      if (ck) {
        return {
          ...base,
          kind: 'check',
          rejectedBy: ck.name,
          table: t.name,
          source: ck.source,
          title: `Check ${ck.name} rejected the row`,
          explanation: `The row must satisfy ${ck.expression}.`,
        }
      }
    }
  }

  if (err.code === '23502' && table) {
    const col = err.column ? findColumn(table, err.column) : undefined
    const name = col?.name ?? err.column ?? '?'
    const fk = table.foreignKeys.find((k) => k.columns.includes(name))
    const inPk = table.primaryKey?.columns.includes(name)
    const why = inPk
      ? 'it is part of the primary key, and key columns can never be empty.'
      : fk
        ? `every ${table.name} must reference a ${fk.refTable} (minimum cardinality 1 in the conceptual model).`
        : 'the attribute is mandatory (<M>) in the conceptual model.'
    return {
      ...base,
      kind: 'notNull',
      rejectedBy: `NOT NULL ${table.name}.${name}`,
      table: table.name,
      columns: [name],
      source: fk?.source ?? col?.source,
      title: `${table.name}.${name} cannot be empty`,
      explanation: `The column is NOT NULL: ${why}`,
    }
  }

  if (err.code?.startsWith('22'))
    return {
      ...base,
      kind: 'type',
      title: 'Value does not fit the column type',
      explanation: `${err.message.replace(/^./, (c) => c.toUpperCase())}. Each column accepts only values of its data type (and length).`,
    }

  return { ...base, kind: 'other', title: 'The statement failed', explanation: err.message }
}

function explainPk(t: PdmTable, base: { engineMessage: string; columns: string[] }): Violation {
  const pk = t.primaryKey!
  const migrated = pk.columns.filter((c) => findColumn(t, c)?.migrated)
  const parents = [...new Set(t.foreignKeys.filter((fk) => fk.identifying || fk.columns.every((c) => pk.columns.includes(c))).map((fk) => fk.refTable))]
  let explanation = `A row of ${t.name} with the same ${tuple(pk.columns)} already exists. The primary key identifies each row, so it must be unique.`
  if (migrated.length && parents.length)
    explanation += ` ${tuple(migrated)} came from ${parents.join(' and ')}: within one ${parents.join(' + ')} the rest of the key must differ.`
  return {
    ...base,
    kind: 'primaryKey',
    rejectedBy: pk.name,
    table: t.name,
    columns: pk.columns,
    source: pk.source ?? t.source,
    title: `Primary key ${pk.name} rejected the row`,
    explanation,
  }
}
