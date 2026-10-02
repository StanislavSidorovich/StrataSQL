// SqlEngine backed by PGlite (PostgreSQL compiled to WebAssembly, Apache-2.0).
// Loaded on demand: the ~4 MB engine is fetched only when the sandbox is opened.

import type { SqlEngine, SqlResult } from './sandbox'

// Keep dates, times and decimals as the text Postgres prints (no JS Date / float conversion).
const RAW_TYPES = [1082 /* date */, 1083 /* time */, 1114 /* timestamp */, 1184 /* timestamptz */, 1700 /* numeric */]

function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Uint8Array) return `\\x${[...v].map((b) => b.toString(16).padStart(2, '0')).join('')}`
  return String(v)
}

export async function createPgliteEngine(): Promise<SqlEngine> {
  const { PGlite } = await import('@electric-sql/pglite')
  const parsers = Object.fromEntries(RAW_TYPES.map((oid) => [oid, (x: string) => x]))
  const db = await PGlite.create({ parsers })
  return {
    async run(sql: string): Promise<SqlResult[]> {
      const results = await db.exec(sql, { rowMode: 'array' })
      return results.map((r) => ({
        columns: r.fields.map((f) => f.name),
        rows: (r.rows as unknown[][]).map((row) => row.map(cell)),
        affected: r.affectedRows,
      }))
    },
  }
}
