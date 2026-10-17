// StrataLab's “Show as model” (its stage 2c): `#sql=<packed>&name=<label>` → a new model.
// The fixtures are what StrataLab sends for its five catalog datasets (written by its
// src/core/modelLink.ts from DuckDB's catalog after loading them).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { packText, sqlLinkFromHash, unpackText } from '../src/core/shareLink'
import { readSqlScript } from '../src/core/import/sql-reader'
import { modelFromStrataLab } from '../src/ui/sqlImport'

const fixture = (id: string) => readFileSync(`tests/fixtures/stratalab/${id}.sql`, 'utf8')

describe('tables from StrataLab', () => {
  it('reads the fragment and unpacks the script', async () => {
    const sql = 'CREATE TABLE a (id integer PRIMARY KEY);'
    const link = sqlLinkFromHash(`#sql=${await packText(sql)}&name=${encodeURIComponent('Kaiyo Trading (Quaera)')}`)
    expect(link?.name).toBe('Kaiyo Trading (Quaera)')
    expect(await unpackText(link!.data)).toBe(sql)
    expect(sqlLinkFromHash('#m=abc')).toBeNull()
    expect(sqlLinkFromHash('#sql=abc')?.name).toBe('From StrataLab')
  })

  it('refuses a damaged or oversized link', async () => {
    await expect(unpackText('not-a-link!')).rejects.toThrow(/damaged/)
    await expect(unpackText(await packText('x'.repeat(2000)), 1000)).rejects.toThrow(/too many/)
  })

  it.each([
    ['chinook', 11, 11],
    ['northwind', 13, 13],
    ['adventureworks', 10, 12],
    ['sakila', 15, 21],
    ['quaera', 13, 0],
  ])('builds the %s dataset: %i entities, %i relationships', (id, entities, relationships) => {
    const sql = fixture(id)
    const script = readSqlScript(sql)
    // every DuckDB type arrives under a name the reader knows
    expect(script.tables.flatMap((t) => t.columns.filter((c) => !c.knownType).map((c) => `${t.name}.${c.name}`))).toEqual([])
    const { model, notice } = modelFromStrataLab(sql, id)
    expect(model.name).toBe(id)
    expect(model.entities).toHaveLength(entities)
    expect(model.relationships).toHaveLength(relationships)
    expect(notice).toMatch(new RegExp(`^Built the conceptual model from the tables of “${id}” in StrataLab`))
  })

  it('keeps names with spaces (Northwind: Order Details)', () => {
    const { model } = modelFromStrataLab(fixture('northwind'), 'Northwind')
    expect(model.entities.map((e) => e.name)).toContain('Order Details')
  })
})
