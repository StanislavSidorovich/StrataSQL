import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { exportPowerDesigner, pdCode, pdTypeCode } from '../src/core/export/powerdesigner'
import { importPowerDesigner } from '../src/core/import/powerdesigner'
import { parseXml } from '../src/core/import/xml'
import type { Model } from '../src/core/metamodel'
import { integrityProblems } from '../src/core/serialize'
import { CASES } from '../src/data/cases'

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf-8')
const ddl = (m: Model) => generateSqlServer(generatePdm(m)).replace(/^--.*$/gm, '')
const roundTrip = (m: Model) => importPowerDesigner(exportPowerDesigner(m).xml, 'x.cdm')

describe('PowerDesigner .cdm export', () => {
  it('writes PD type codes and codes', () => {
    expect(pdTypeCode({ dataType: 'Variable characters', length: 50 })).toBe('VA50')
    expect(pdTypeCode({ dataType: 'Decimal', length: 10, precision: 2 })).toBe('DC10,2')
    expect(pdTypeCode({ dataType: 'Integer' })).toBe('I')
    expect(pdCode('Book Author é-1')).toBe('BOOK_AUTHOR_E_1')
  })

  it('is a PD conceptual model in well-formed XML, with unique object ids', () => {
    const { xml } = exportPowerDesigner(CASES[0].build())
    expect(xml).toMatch(/signature="CDM_DATA_MODEL_XML"/)
    expect(() => parseXml(xml)).not.toThrow()
    const ids = [...xml.matchAll(/ Id="(o\d+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    const refs = [...xml.matchAll(/ Ref="(o\d+)"/g)].map((m) => m[1])
    expect(refs.filter((r) => !ids.includes(r))).toEqual([])
  })

  // Every reference case and both class files: export → our own .cdm import gives the same tables.
  const models: [string, () => Model][] = [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
    ['University.cdm', () => importPowerDesigner(fixture('university.cdm')).model],
  ]
  for (const [name, build] of models) {
    it(`round trip keeps the model: ${name}`, () => {
      const m = build()
      const back = roundTrip(m)
      expect(back.warnings.filter((w) => !/shortcut/.test(w))).toEqual([])
      expect(integrityProblems(back.model)).toEqual([])
      expect(back.model.entities.map((e) => e.name)).toEqual(m.entities.map((e) => e.name))
      expect(back.model.relationships.length).toBe(m.relationships.length)
      expect(back.model.inheritances.length).toBe(m.inheritances.length)
      // Exactly the same SQL unless the export said what PD cannot hold (AKs over columns, roles, clashing codes).
      if (exportPowerDesigner(m).warnings.length === 0) expect(ddl(back.model)).toBe(ddl(m))
    })
  }

  it('keeps the layout (relative positions)', () => {
    const m = CASES[0].build()
    const back = roundTrip(m).model
    const rel = (mm: Model) => {
      const x0 = Math.min(...mm.entities.map((e) => e.position.x))
      const y0 = Math.min(...mm.entities.map((e) => e.position.y))
      return mm.entities.map((e) => [Math.round((e.position.x - x0) / 5), Math.round((e.position.y - y0) / 5)])
    }
    expect(rel(back)).toEqual(rel(m))
  })

  it('warns about what a PD CDM cannot hold', () => {
    const withAk = CASES.map((c) => c.build()).find((m) => m.entities.some((e) => e.physicalKeys?.length))
    if (withAk) expect(exportPowerDesigner(withAk).warnings.join(' ')).toMatch(/alternate keys/)
  })
})

it('centres the diagram on (0, 0), where PowerDesigner lays out its pages', () => {
  for (const c of CASES) {
    const { xml } = exportPowerDesigner(c.build())
    const rects = [...xml.matchAll(/<o:EntitySymbol Id="[^"]+">[\s\S]*?<a:Rect>\(\((-?\d+),(-?\d+)\), \((-?\d+),(-?\d+)\)\)/g)].map((m) => m.slice(1, 5).map(Number))
    const xs = rects.flatMap((r) => [r[0], r[2]])
    const ys = rects.flatMap((r) => [r[1], r[3]])
    expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(1500)
    expect(Math.abs(Math.min(...ys) + Math.max(...ys))).toBeLessThan(1500)
  }
})
