import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { sqlServerType } from '../src/core/ddl/sqlserver'
import { exportPowerDesignerPdm } from '../src/core/export/powerdesigner-pdm'
import { importPowerDesigner } from '../src/core/import/powerdesigner'
import { readPdTables } from '../src/core/import/pdm-reader'
import { parseXml } from '../src/core/import/xml'
import type { Model } from '../src/core/metamodel'
import { CASES } from '../src/data/cases'

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf-8')

describe('PowerDesigner .pdm export', () => {
  it('is a PD physical model for SQL Server 2008 in well-formed XML, with unique object ids', () => {
    const { xml } = exportPowerDesignerPdm(CASES[0].build())
    expect(xml).toMatch(/signature="PDM_DATA_MODEL_XML"/)
    expect(xml).toMatch(/Target="Microsoft SQL Server 2008"/)
    expect(() => parseXml(xml)).not.toThrow()
    const ids = [...xml.matchAll(/ Id="(o\d+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    const refs = [...xml.matchAll(/ Ref="(o\d+)"/g)].map((m) => m[1])
    expect(refs.filter((r) => !ids.includes(r))).toEqual([])
  })

  // Read back with the reader used for the PowerDesigner cross-check: the same tables as our PDM view.
  const models: [string, () => Model][] = [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
    ['University.cdm', () => importPowerDesigner(fixture('university.cdm')).model],
  ]
  for (const [name, build] of models) {
    it(`holds the generated tables: ${name}`, () => {
      const m = build()
      const pdm = generatePdm(m)
      const back = readPdTables(exportPowerDesignerPdm(m).xml)
      expect(back.map((t) => t.code)).toEqual(pdm.tables.map((t) => t.name))
      for (const [i, t] of pdm.tables.entries()) {
        const b = back[i]
        expect(b.columns).toEqual(t.columns.map((c) => ({ code: c.name, type: sqlServerType(c), mandatory: !c.nullable })))
        expect(b.primaryKey).toEqual(t.primaryKey?.columns ?? [])
        expect(b.alternateKeys).toEqual(t.alternateKeys.map((k) => k.columns))
        expect(b.foreignKeys.map((f) => [f.parent, f.columns, f.parentColumns])).toEqual(t.foreignKeys.map((f) => [f.refTable, f.columns, f.refColumns]))
      }
    })
  }

  it('says what it leaves out (check constraints)', () => {
    const withCheck = models.map(([, b]) => b()).find((m) => generatePdm(m).tables.some((t) => t.checks.length))
    if (withCheck) expect(exportPowerDesignerPdm(withCheck).warnings.some((w) => /check/.test(w))).toBe(true)
  })
})
