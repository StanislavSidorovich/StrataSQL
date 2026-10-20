import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { arrowStyle, compactLayout, crossed, entitySize, exportPowerDesigner, pdCode, pdTypeCode, routeAround, routeOrthogonal, UNITS } from '../src/core/export/powerdesigner'
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

  it('keeps the layout: the same order across and down, aligned tables stay aligned', () => {
    for (const c of CASES) {
      const m = c.build()
      const back = roundTrip(m).model
      const pos = new Map(back.entities.map((e) => [e.name, e.position]))
      for (const a of m.entities)
        for (const b of m.entities) {
          const [pa, pb] = [pos.get(a.name)!, pos.get(b.name)!]
          for (const k of ['x', 'y'] as const) {
            if (a.position[k] < b.position[k]) expect(pa[k], `${c.title}: ${a.name} ${k} before ${b.name}`).toBeLessThan(pb[k])
            if (a.position[k] === b.position[k]) expect(Math.abs(pa[k] - pb[k]), `${c.title}: ${a.name} ${k} aligned with ${b.name}`).toBeLessThan(1)
          }
        }
    }
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

describe('PowerDesigner .cdm export: diagram geometry', () => {
  type R = { x1: number; y1: number; x2: number; y2: number }
  const nums = (t: string) => (t.match(/-?\d+/g) ?? []).map(Number)
  const onEdge = (p: { x: number; y: number }, r: R) =>
    p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2 && (p.x === r.x1 || p.x === r.x2 || p.y === r.y1 || p.y === r.y2)

  for (const [name, build] of [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
  ] as [string, () => Model][]) {
    it(`line ends lie on symbol edges and every segment is horizontal or vertical: ${name}`, () => {
      const { xml } = exportPowerDesigner(build())
      const rects = new Map<string, R>()
      for (const m of xml.matchAll(/<o:(EntitySymbol|InheritanceSymbol) Id="(o\d+)">[\s\S]*?<a:Rect>(.*?)<\/a:Rect>/g)) {
        const [x1, y1, x2, y2] = nums(m[3])
        rects.set(m[2], { x1, y1, x2, y2 })
      }
      let links = 0
      for (const m of xml.matchAll(/<o:(RelationshipSymbol|InheritanceRootLinkSymbol|InheritanceLinkSymbol) Id="o\d+">[\s\S]*?<\/o:\1>/g)) {
        const body = m[0]
        const ps = nums(body.match(/<a:ListOfPoints>(.*?)<\/a:ListOfPoints>/)![1])
        const pts = Array.from({ length: ps.length / 2 }, (_, i) => ({ x: ps[2 * i], y: ps[2 * i + 1] }))
        const src = rects.get(body.match(/<c:SourceSymbol>\s*<o:\w+ Ref="(o\d+)"/)![1])!
        const dst = rects.get(body.match(/<c:DestinationSymbol>\s*<o:\w+ Ref="(o\d+)"/)![1])!
        expect(onEdge(pts[0], src)).toBe(true)
        expect(onEdge(pts[pts.length - 1], dst)).toBe(true)
        for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
        links++
      }
      expect(links).toBeGreaterThan(0)
    })
  }

  for (const [name, build] of [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
    ['University.cdm', () => importPowerDesigner(fixture('university.cdm')).model],
  ] as [string, () => Model][]) {
    it(`no segment of any line runs through a symbol other than its own two: ${name}`, () => {
      const { xml, warnings } = exportPowerDesigner(build())
      const rects = new Map<string, R>()
      for (const m of xml.matchAll(/<o:(EntitySymbol|InheritanceSymbol) Id="(o\d+)">[\s\S]*?<a:Rect>(.*?)<\/a:Rect>/g)) {
        const [x1, y1, x2, y2] = nums(m[3])
        rects.set(m[2], { x1, y1, x2, y2 })
      }
      const through: string[] = []
      for (const m of xml.matchAll(/<o:(RelationshipSymbol|InheritanceRootLinkSymbol|InheritanceLinkSymbol) Id="(o\d+)">[\s\S]*?<\/o:\1>/g)) {
        const body = m[0]
        const ps = nums(body.match(/<a:ListOfPoints>(.*?)<\/a:ListOfPoints>/)![1])
        const pts = Array.from({ length: ps.length / 2 }, (_, i) => ({ x: ps[2 * i], y: ps[2 * i + 1] }))
        const own = [body.match(/<c:SourceSymbol>\s*<o:\w+ Ref="(o\d+)"/)![1], body.match(/<c:DestinationSymbol>\s*<o:\w+ Ref="(o\d+)"/)![1]]
        for (const [sid, r] of rects) {
          if (own.includes(sid)) continue
          for (let i = 1; i < pts.length; i++) {
            const [p, q] = [pts[i - 1], pts[i]]
            if (Math.min(p.x, q.x) < r.x2 && Math.max(p.x, q.x) > r.x1 && Math.min(p.y, q.y) < r.y2 && Math.max(p.y, q.y) > r.y1) through.push(`${m[2]} through ${sid}`)
          }
        }
      }
      expect(through).toEqual([])
      expect(warnings.filter((w) => /crosses/.test(w))).toEqual([])
    })
  }

  for (const [name, build] of [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
    ['University.cdm', () => importPowerDesigner(fixture('university.cdm')).model],
  ] as [string, () => Model][]) {
    it(`no two lines run alongside each other closer than 800 units (PD shows them as one): ${name}`, () => {
      const { xml } = exportPowerDesigner(build())
      // Lines that meet at one inheritance symbol may run together into it, as in PD.
      const blocks = [...xml.matchAll(/<o:(RelationshipSymbol|InheritanceRootLinkSymbol|InheritanceLinkSymbol) Id="o\d+">[\s\S]*?<\/o:\1>/g)].map((x) => x[0])
      const lines = blocks.map((b) => {
        const n = nums(b.match(/<a:ListOfPoints>(.*?)<\/a:ListOfPoints>/)![1])
        return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }))
      })
      const inh = blocks.map((b) => b.match(/<o:InheritanceSymbol Ref="(o\d+)"/)?.[1])
      const segs = lines.flatMap((l, k) => l.slice(1).map((q, i) => ({ k, p: l[i], q })))
      const close: string[] = []
      for (const s of segs)
        for (const u of segs) {
          if (u.k <= s.k || (inh[s.k] && inh[s.k] === inh[u.k])) continue
          for (const [n, t] of [['y', 'x'], ['x', 'y']] as const)
            if (s.p[n] === s.q[n] && u.p[n] === u.q[n] && Math.abs(s.p[n] - u.p[n]) < 800 &&
              Math.min(Math.max(s.p[t], s.q[t]), Math.max(u.p[t], u.q[t])) > Math.max(Math.min(s.p[t], s.q[t]), Math.min(u.p[t], u.q[t])))
              close.push(`line ${s.k} and line ${u.k} at ${n} ${s.p[n]} / ${u.p[n]}`)
        }
      expect(lines.length).toBeGreaterThan(0)
      expect(close).toEqual([])
    })
  }

  it('goes around a table that sits between the two it joins, and says so when it cannot', () => {
    const a = { x1: 0, y1: 0, x2: 9000, y2: 4000 }
    const b = { x1: 30000, y1: 0, x2: 39000, y2: 4000 }
    const wall = { x1: 15000, y1: -2000, x2: 24000, y2: 6000 }
    const path = routeAround(a, b, [wall])
    expect(routeOrthogonal(a, b)).toHaveLength(2)
    expect(crossed(routeOrthogonal(a, b), [wall])).toEqual([0])
    expect(crossed(path, [wall])).toEqual([])
    expect(path.length).toBe(4)
    // Boxed in on every side: the route crosses as few symbols as it can and the export can warn.
    const box = [
      { x1: -3000, y1: -3000, x2: 12000, y2: -1000 },
      { x1: -3000, y1: 5000, x2: 12000, y2: 7000 },
      { x1: -3000, y1: -1000, x2: -1000, y2: 5000 },
      { x1: 11000, y1: -1000, x2: 13000, y2: 5000 },
    ]
    expect(crossed(routeAround(a, b, box), box)).toHaveLength(1)
  })

  it('pulls the canvas spacing together to PD density, keeping room between neighbours', () => {
    // A 3 × 3 grid with canvas gaps of 400 px across and 250 px down: about 33 000 and 21 000 PD units unpacked.
    const boxes = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 600 * UNITS, y: Math.floor(i / 3) * 330 * UNITS, w: 16000, h: 6000 }))
    const out = compactLayout(boxes)
    const across = out[1].x - (out[0].x + out[0].w)
    const down = out[3].y - (out[0].y + out[0].h)
    expect(across).toBeGreaterThan(9000)
    expect(across).toBeLessThan(15000)
    expect(down).toBeGreaterThan(4000)
    expect(down).toBeLessThan(9000)
    // Rows and columns stay straight.
    expect(new Set(out.map((b) => b.x)).size).toBe(3)
    expect(new Set(out.map((b) => b.y)).size).toBe(3)
    // A gap already tighter than PD's is kept; a diagonal neighbour pulled into the same column is kept apart down.
    const tight = compactLayout([{ x: 0, y: 0, w: 16000, h: 6000 }, { x: 18000, y: 0, w: 16000, h: 6000 }])
    expect(tight[1].x - tight[0].w).toBe(2000)
    const diag = compactLayout([{ x: 0, y: 0, w: 16000, h: 6000 }, { x: 30000, y: 20000, w: 16000, h: 6000 }])
    const apartX = diag[1].x >= diag[0].x + diag[0].w
    const apartY = diag[1].y >= diag[0].y + diag[0].h
    expect(apartX || apartY).toBe(true)
  })

  for (const [name, build] of [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
    ['University.cdm', () => importPowerDesigner(fixture('university.cdm')).model],
  ] as [string, () => Model][]) {
    it(`side-by-side tables keep at least 3000 units between them (or the canvas gap, when smaller), no new overlaps: ${name}`, () => {
      const m = build()
      const { xml } = exportPowerDesigner(m)
      const rs = [...xml.matchAll(/<o:EntitySymbol Id="o\d+">[\s\S]*?<a:Rect>(.*?)<\/a:Rect>/g)].map((x) => nums(x[1]))
      const canvas = m.entities.map((e) => ({ x: e.position.x * UNITS, y: e.position.y * UNITS }))
      const sizes = m.entities.map(entitySize)
      for (let i = 0; i < rs.length; i++)
        for (let j = 0; j < rs.length; j++) {
          const [a, b] = [rs[i], rs[j]]
          const overlapY = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0
          const overlapX = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0
          if (overlapY && b[0] >= a[0] && i !== j) expect(b[0] - a[2]).toBeGreaterThanOrEqual(Math.min(3000, Math.round(canvas[j].x - canvas[i].x - sizes[i].w) - 1))
          if (overlapX && b[3] <= a[3] && i !== j) expect(a[1] - b[3]).toBeGreaterThanOrEqual(Math.min(2500, Math.round(canvas[j].y - canvas[i].y - sizes[i].h) - 1))
          // No new overlap: only tables already too close for their PD width on the canvas may touch.
          const before =
            Math.min(canvas[i].x + sizes[i].w, canvas[j].x + sizes[j].w) > Math.max(canvas[i].x, canvas[j].x) &&
            Math.min(canvas[i].y + sizes[i].h, canvas[j].y + sizes[j].h) > Math.max(canvas[i].y, canvas[j].y)
          if (i !== j && !before) expect(overlapX && overlapY, `${m.entities[i].name} on ${m.entities[j].name}`).toBe(false)
        }
    })
  }

  it('sizes a table like PD: 960 units per row and wide enough for its longest row', () => {
    const m = CASES[0].build()
    const { xml } = exportPowerDesigner(m)
    const first = nums(xml.match(/<o:EntitySymbol Id="o\d+">[\s\S]*?<a:Rect>(.*?)<\/a:Rect>/)![1])
    expect(first[3] - first[1]).toBe(Math.max(3999, 2819 + 960 * m.entities[0].attributes.length))
  })
})

describe('PowerDesigner .cdm export: styles', () => {
  for (const [name, build] of [
    ...CASES.map((c) => [c.title, c.build] as [string, () => Model]),
    ['TV Show.cdm', () => importPowerDesigner(fixture('tv-show.cdm')).model],
  ] as [string, () => Model][]) {
    it(`diagram has display preferences and page setup, every symbol a FontList, every relationship an ArrowStyle: ${name}`, () => {
      const { xml } = exportPowerDesigner(build())
      expect(() => parseXml(xml)).not.toThrow()
      expect(xml).toMatch(/<a:DisplayPreferences>\[DisplayPreferences\]/)
      expect(xml).toContain('Adjust to text=Yes')
      expect(xml).toContain('<a:PaperSize>')
      expect(xml).toContain('<a:PageMargins>')
      let symbols = 0
      for (const m of xml.matchAll(/<o:(\w+Symbol) Id="o\d+">[\s\S]*?<\/o:\1>/g)) {
        symbols++
        expect(m[0], m[1]).toContain('<a:FontList>')
        if (m[1] === 'EntitySymbol') expect(m[0]).toContain('EntityPrimaryAttribute 0 Arial,8,U')
        if (m[1] === 'RelationshipSymbol') expect(m[0]).toMatch(/<a:ArrowStyle>\d+<\/a:ArrowStyle>/)
      }
      expect(symbols).toBeGreaterThan(0)
    })

    it(`lines come before boxes, so PD paints tables over the ends of the crow's feet: ${name}`, () => {
      const { xml } = exportPowerDesigner(build())
      const kinds = [...xml.matchAll(/<o:(\w+Symbol) Id="o\d+">/g)].map((m) => m[1])
      const lastLine = Math.max(...kinds.map((k, i) => (k.endsWith('LinkSymbol') || k === 'RelationshipSymbol' ? i : -1)))
      const firstBox = kinds.findIndex((k) => k === 'EntitySymbol' || k === 'InheritanceSymbol')
      expect(firstBox).toBeGreaterThan(lastLine)
    })
  }

  it('carries no personal data in the display preferences', () => {
    const { xml } = exportPowerDesigner(CASES[0].build())
    const prefs = xml.match(/<a:DisplayPreferences>([\s\S]*?)<\/a:DisplayPreferences>/)![1]
    expect(prefs).not.toMatch(/Users|joana|FPI|[A-Z]:\\/)
  })

  it('ArrowStyle follows the cardinalities and the dependent side, as in a PD file', () => {
    const c = (min: 0 | 1, max: 1 | 'n') => ({ min, max })
    // [cardinalityA = Entity2→Entity1, cardinalityB = Entity1→Entity2, dependentSide] → PD value
    const cases: [ReturnType<typeof c>, ReturnType<typeof c>, 'A' | 'B' | null, number][] = [
      [c(1, 1), c(0, 'n'), null, 4627],
      [c(1, 1), c(0, 1), null, 4625],
      [c(0, 1), c(0, 'n'), null, 4371],
      [c(1, 'n'), c(1, 'n'), null, 5140],
      [c(1, 1), c(0, 'n'), 'B', 4631],
      [c(1, 1), c(1, 'n'), 'B', 4632],
      [c(0, 1), c(1, 1), 'A', 5394],
      [c(0, 'n'), c(1, 1), 'A', 5906],
    ]
    for (const [a, b, dep, want] of cases) expect(arrowStyle({ cardinalityA: a, cardinalityB: b, dependentSide: dep })).toBe(want)
  })
})
