// Physical Data Model (PDM) — the tables generated from a CDM (SPEC §6).
// DBMS-independent: columns keep the conceptual type; each DDL dialect maps it to SQL.

import type { DataType, Id } from './metamodel'

/** Where a PDM element comes from in the CDM, so the UI can point back to it. */
export type PdmSource =
  | { kind: 'entity'; id: Id }
  | { kind: 'attribute'; entityId: Id; attributeId: Id }
  | { kind: 'relationship'; id: Id }
  | { kind: 'inheritance'; id: Id }
  | { kind: 'identifier'; entityId: Id; identifierId: Id }
  | { kind: 'physicalKey'; entityId: Id; keyId: Id }

export interface PdmColumn {
  name: string
  dataType: DataType
  length?: number
  precision?: number
  nullable: boolean
  /**
   * Identity of the value the column holds: the id of the attribute it started from, plus the
   * relationships whose role prefixed it. Two FKs bringing the same origin share one column.
   */
  origin: string
  /** True when the column arrived through a FK (it is not an attribute of this table's entity). */
  migrated: boolean
  source: PdmSource
  comment?: string
}

export interface PdmKey {
  name: string
  columns: string[]
  source?: PdmSource
}

export interface PdmForeignKey {
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
  /** All FK columns are part of the PK (dependent entity / inheritance child). */
  identifying: boolean
  /** NOT NULL: every row must reference a parent row. */
  mandatory: boolean
  source: PdmSource
}

export interface PdmCheck {
  name: string
  /** Condition in portable SQL (`kind IN ('A', 'B')`). */
  expression: string
  source: PdmSource
}

export interface PdmTable {
  name: string
  /** Entity the table was generated from; join tables point at their relationship instead. */
  source: PdmSource
  comment?: string
  columns: PdmColumn[]
  primaryKey: PdmKey | null
  alternateKeys: PdmKey[]
  foreignKeys: PdmForeignKey[]
  checks: PdmCheck[]
}

export type PdmNoteLevel = 'info' | 'warning'

/** Explains a generation decision or a CDM construct that could not be generated as drawn. */
export interface PdmNote {
  level: PdmNoteLevel
  message: string
  table?: string
  source?: PdmSource
}

export interface Pdm {
  name: string
  tables: PdmTable[]
  notes: PdmNote[]
}

export function findTable(pdm: Pdm, name: string): PdmTable | undefined {
  const n = name.toUpperCase()
  return pdm.tables.find((t) => t.name.toUpperCase() === n)
}

export function findColumn(table: PdmTable, name: string): PdmColumn | undefined {
  const n = name.toLowerCase()
  return table.columns.find((c) => c.name.toLowerCase() === n)
}

/**
 * PowerDesigner-style key flags per column: `pk`, `fk1`, `ak2`… (numbered by order in the table;
 * the number is dropped when the table has only one key of that kind).
 */
export function columnFlags(table: PdmTable): Map<string, string[]> {
  const flags = new Map<string, string[]>(table.columns.map((c) => [c.name, []]))
  const push = (col: string, flag: string) => flags.get(col)?.push(flag)
  for (const c of table.primaryKey?.columns ?? []) push(c, 'pk')
  table.foreignKeys.forEach((fk, i) => fk.columns.forEach((c) => push(c, table.foreignKeys.length > 1 ? `fk${i + 1}` : 'fk')))
  table.alternateKeys.forEach((ak, i) => ak.columns.forEach((c) => push(c, table.alternateKeys.length > 1 ? `ak${i + 1}` : 'ak')))
  return flags
}
