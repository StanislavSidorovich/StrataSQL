// Export to a PowerDesigner physical model (.pdm), XML file format, for Microsoft SQL Server 2008 —
// the tables StrataSQL generates (cdm2pdm), so PowerDesigner shows the same PDM and DDL as we do.
//
// Written in the shape of the PD 16.0 .pdm files from the course (tests/fixtures/*.pdm):
// - a column holds the SQL Server type as text (`varchar(50)`), plus Length / Precision;
// - keys list their columns; the table points at its primary key;
// - a reference goes from ParentTable to ChildTable through ParentKey, and each join pairs the
//   parent's column (Object1) with the child's (Object2);
// - a reference symbol is drawn from the child table (source) to the parent (destination);
// - the DBMS is a shortcut to PD's own SQL Server 2008 definition (sqlsv2k8.xdb);
// - option blocks and display preferences are left out, so PowerDesigner uses its defaults.

import { generatePdm } from '../cdm2pdm'
import { sqlServerType } from '../ddl/sqlserver'
import type { Model, Point } from '../metamodel'
import { tablePosition, type PdmKey, type PdmTable } from '../pdm'
import { UNITS, boundsOf, center, compactLayout, crossed, esc, pdCode, points, randomGuid, rectText, routeAround, type ExportResult, type Rect } from './powerdesigner'

/** PD's definition of Microsoft SQL Server 2008, as referenced by the course's .pdm files. */
const SQLSERVER_2008 = { name: 'Microsoft SQL Server 2008', code: 'MSSQLSRV2008', id: 'F5C20738-B05A-4F70-BC90-9B5EB9437766', classId: '4BA9F647-DAB1-11D1-9944-006097355D9B', url: 'file:///%_DBMS%/sqlsv2k8.xdb' }
const PDM_TYPE = '{CDE44E21-9669-11D1-9914-006097355D9B}'

/** Approximate size of a table symbol in PD units, from its longest line and the number of columns. */
function tableSize(t: PdmTable): { w: number; h: number } {
  const lines = [t.name, ...t.columns.map((c) => `${c.name} ${sqlServerType(c)} not null <pk,fk1>`)]
  const longest = Math.max(...lines.map((l) => l.length))
  return { w: Math.max(6000, Math.round(longest * 330 + 1600)), h: 1800 + 900 * Math.max(1, t.columns.length) }
}

const sameColumns = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i])

export function exportPowerDesignerPdm(model: Model, opts: { guid?: () => string; now?: number; user?: string } = {}): ExportResult {
  const guid = opts.guid ?? randomGuid
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const user = esc(opts.user ?? 'Quaera Model')
  const pdm = generatePdm(model)
  const warnings: string[] = pdm.notes.filter((n) => n.level === 'warning').map((n) => n.message)
  let next = 1
  const id = () => `o${next++}`

  const stamp = () => `<a:CreationDate>${now}</a:CreationDate>\n<a:Creator>${user}</a:Creator>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Modifier>${user}</a:Modifier>\n`
  const named = (name: string, code: string) => `<a:ObjectID>${guid()}</a:ObjectID>\n<a:Name>${esc(name)}</a:Name>\n<a:Code>${esc(code)}</a:Code>\n${stamp()}`
  const comment = (c: string | undefined) => (c ? `<a:Comment>${esc(c)}</a:Comment>\n` : '')

  // Object ids first, so symbols and objects can point at each other.
  const rootId = id()
  const modelId = id()
  const dbmsId = id()
  const diagramId = id()
  const tableIds = new Map(pdm.tables.map((t) => [t.name, id()]))
  const tableSymIds = new Map(pdm.tables.map((t) => [t.name, id()]))
  const colIds = new Map(pdm.tables.flatMap((t) => t.columns.map((c) => [`${t.name}.${c.name}`, id()] as const)))
  const keyIds = new Map<PdmKey, string>()
  for (const t of pdm.tables) for (const k of [...(t.primaryKey ? [t.primaryKey] : []), ...t.alternateKeys]) keyIds.set(k, id())
  const refs = pdm.tables.flatMap((t) => t.foreignKeys.map((fk) => ({ t, fk, rid: id() })))

  // Diagram: the PDM view's layout pulled together like a PD-drawn one (compactLayout), y up, centred
  // on (0, 0) like the .cdm export.
  const placed = compactLayout(
    pdm.tables.map((t) => {
      const p = tablePosition(model, t)
      return { x: Math.round(p.x * UNITS), y: Math.round(p.y * UNITS), ...tableSize(t) }
    }),
  )
  const rects = new Map<string, Rect>(pdm.tables.map((t, i) => [t.name, { x1: placed[i].x, y1: -placed[i].y - placed[i].h, x2: placed[i].x + placed[i].w, y2: -placed[i].y }]))
  const corners = [...rects.values()].flatMap((r) => [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }])
  const mid = corners.length ? center(boundsOf(corners)) : { x: 0, y: 0 }
  for (const r of rects.values()) {
    r.x1 -= mid.x
    r.x2 -= mid.x
    r.y1 -= mid.y
    r.y2 -= mid.y
  }
  // Lines first, tables after (PD paints in file order); each line goes around the tables it does not join.
  const symbols: string[] = []
  // Reflexive: a loop out of the right side and back over the top. Taken first, so the other lines keep off it.
  const loop = (r: Rect): Point[] => {
    const out = { x: r.x2, y: center(r).y }
    return [out, { x: r.x2 + 2000, y: out.y }, { x: r.x2 + 2000, y: r.y2 + 2000 }, { x: center(r).x, y: r.y2 + 2000 }, { x: center(r).x, y: r.y2 }]
  }
  const taken: Point[][] = refs.filter(({ t, fk }) => t.name === fk.refTable).map(({ t }) => loop(rects.get(t.name)!))
  for (const { t, fk, rid } of refs) {
    const child = rects.get(t.name)!
    const parent = rects.get(fk.refTable)
    if (!parent) continue
    let path: Point[]
    if (child === parent) path = loop(child)
    else {
      const others = [...rects].filter(([name]) => name !== t.name && name !== fk.refTable)
      path = routeAround(child, parent, others.map(([, r]) => r), taken)
      const through = crossed(path, others.map(([, r]) => r)).map((i) => others[i][0])
      if (through.length) warnings.push(`Reference ${fk.name}: no free way around, so its line crosses ${through.join(', ')} in the PowerDesigner diagram. Move the tables apart, or route the line by hand in PowerDesigner.`)
      taken.push(path)
    }
    symbols.push(
      `<o:ReferenceSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(path))}</a:Rect>\n<a:ListOfPoints>${points(path)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>1</a:ArrowStyle>\n<a:LineColor>11184640</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<c:SourceSymbol>\n<o:TableSymbol Ref="${tableSymIds.get(t.name)}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:TableSymbol Ref="${tableSymIds.get(fk.refTable)}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:Reference Ref="${rid}"/>\n</c:Object>\n</o:ReferenceSymbol>`,
    )
  }
  for (const t of pdm.tables)
    symbols.push(
      `<o:TableSymbol Id="${tableSymIds.get(t.name)}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:IconMode>-1</a:IconMode>\n<a:Rect>${rectText(rects.get(t.name)!)}</a:Rect>\n<a:LineColor>11184640</a:LineColor>\n<a:FillColor>16777136</a:FillColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<a:BrushStyle>6</a:BrushStyle>\n<a:GradientFillMode>65</a:GradientFillMode>\n<a:GradientEndColor>16777215</a:GradientEndColor>\n<c:Object>\n<o:Table Ref="${tableIds.get(t.name)}"/>\n</c:Object>\n</o:TableSymbol>`,
    )

  const tableName = (t: PdmTable) => (t.source.kind === 'entity' ? (model.entities.find((e) => e.id === (t.source as { id: string }).id)?.name ?? t.name) : t.name)

  const tables = pdm.tables.map((t) => {
    const cols = t.columns.map((c) => {
      const full = sqlServerType(c)
      const identity = / identity$/.test(full)
      const type = identity ? full.slice(0, -' identity'.length) : full
      const size = /\((\d+)(?:,(\d+))?\)$/.exec(type)
      return (
        `<o:Column Id="${colIds.get(`${t.name}.${c.name}`)}">\n${named(c.name, c.name)}${comment(c.comment)}<a:DataType>${type}</a:DataType>\n` +
        (size ? `<a:Length>${size[1]}</a:Length>\n` : '') +
        (size?.[2] ? `<a:Precision>${size[2]}</a:Precision>\n` : '') +
        (identity ? '<a:Identity>1</a:Identity>\n' : '') +
        (c.nullable ? '' : '<a:Column.Mandatory>1</a:Column.Mandatory>\n') +
        `</o:Column>`
      )
    })
    const keys = [...(t.primaryKey ? [t.primaryKey] : []), ...t.alternateKeys].map(
      (k) =>
        `<o:Key Id="${keyIds.get(k)}">\n${named(k.name, pdCode(k.name))}<a:ConstraintName>${esc(k.name)}</a:ConstraintName>\n<c:Key.Columns>\n${k.columns.map((c) => `<o:Column Ref="${colIds.get(`${t.name}.${c}`)}"/>`).join('\n')}\n</c:Key.Columns>\n</o:Key>`,
    )
    if (t.checks.length) warnings.push(`${t.name}: the check ${t.checks.map((c) => `${c.name} (${c.expression})`).join(', ')} is not exported — add it on the table's Check tab in PowerDesigner.`)
    return (
      `<o:Table Id="${tableIds.get(t.name)}">\n${named(tableName(t), t.name)}${comment(t.comment)}` +
      (cols.length ? `<c:Columns>\n${cols.join('\n')}\n</c:Columns>\n` : '') +
      (keys.length ? `<c:Keys>\n${keys.join('\n')}\n</c:Keys>\n` : '') +
      (t.primaryKey ? `<c:PrimaryKey>\n<o:Key Ref="${keyIds.get(t.primaryKey)}"/>\n</c:PrimaryKey>\n` : '') +
      `</o:Table>`
    )
  })

  const refCode = (() => {
    const seen = new Set<string>()
    return (code: string) => {
      let c = code
      for (let n = 2; seen.has(c); n++) c = `${code}${n}`
      seen.add(c)
      return c
    }
  })()
  const references = refs.flatMap(({ t, fk, rid }) => {
    const parent = pdm.tables.find((p) => p.name === fk.refTable)
    if (!parent) return []
    const parentKey = [parent.primaryKey, ...parent.alternateKeys].find((k) => k && sameColumns(k.columns, fk.refColumns))
    // At most one child row per parent when the FK columns are themselves a key of the child.
    const oneToOne = [t.primaryKey, ...t.alternateKeys].some((k) => k && sameColumns(k.columns, fk.columns))
    const joins = fk.columns.map(
      (c, i) =>
        `<o:ReferenceJoin Id="${id()}">\n<a:ObjectID>${guid()}</a:ObjectID>\n${stamp()}<c:Object1>\n<o:Column Ref="${colIds.get(`${parent.name}.${fk.refColumns[i]}`)}"/>\n</c:Object1>\n<c:Object2>\n<o:Column Ref="${colIds.get(`${t.name}.${c}`)}"/>\n</c:Object2>\n</o:ReferenceJoin>`,
    )
    return [
      `<o:Reference Id="${rid}">\n${named(fk.name, refCode(pdCode(fk.name)))}<a:Cardinality>${oneToOne ? '0..1' : '0..*'}</a:Cardinality>\n<a:ForeignKeyConstraintName>${esc(fk.name)}</a:ForeignKeyConstraintName>\n` +
        `<c:ParentTable>\n<o:Table Ref="${tableIds.get(parent.name)}"/>\n</c:ParentTable>\n<c:ChildTable>\n<o:Table Ref="${tableIds.get(t.name)}"/>\n</c:ChildTable>\n` +
        (parentKey ? `<c:ParentKey>\n<o:Key Ref="${keyIds.get(parentKey)}"/>\n</c:ParentKey>\n` : '') +
        `<c:Joins>\n${joins.join('\n')}\n</c:Joins>\n</o:Reference>`,
    ]
  })

  const section = (tag: string, parts: string[]) => (parts.length ? `<c:${tag}>\n${parts.join('\n')}\n</c:${tag}>\n` : '')
  const modelGuid = guid()
  const db = SQLSERVER_2008
  const body =
    `<o:Model Id="${modelId}">\n<a:ObjectID>${modelGuid}</a:ObjectID>\n<a:Name>${esc(model.name)}</a:Name>\n<a:Code>${pdCode(model.name)}</a:Code>\n${stamp()}${comment(model.comment)}` +
    `<c:DBMS>\n<o:Shortcut Id="${dbmsId}">\n${named(db.name, db.code)}<a:TargetStereotype/>\n<a:TargetID>${db.id}</a:TargetID>\n<a:TargetClassID>${db.classId}</a:TargetClassID>\n</o:Shortcut>\n</c:DBMS>\n` +
    `<c:PhysicalDiagrams>\n<o:PhysicalDiagram Id="${diagramId}">\n${named('Diagram_1', 'DIAGRAM_1')}` +
    section('Symbols', symbols) +
    `</o:PhysicalDiagram>\n</c:PhysicalDiagrams>\n<c:DefaultDiagram>\n<o:PhysicalDiagram Ref="${diagramId}"/>\n</c:DefaultDiagram>\n` +
    section('Tables', tables) +
    section('References', references) +
    `<c:TargetModels>\n<o:TargetModel Id="${id()}">\n${named(db.name, db.code)}<a:TargetModelURL>${db.url}</a:TargetModelURL>\n<a:TargetModelID>${db.id}</a:TargetModelID>\n<a:TargetModelClassID>${db.classId}</a:TargetModelClassID>\n<c:SessionShortcuts>\n<o:Shortcut Ref="${dbmsId}"/>\n</c:SessionShortcuts>\n</o:TargetModel>\n</c:TargetModels>\n` +
    `</o:Model>`

  const objects = next - 1 - symbols.length
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?PowerDesigner AppLocale="UTF16" ID="{${modelGuid}}" Label="" LastModificationDate="${now}" Name="${esc(model.name)}" Objects="${objects}" Symbols="${symbols.length}" Target="${db.name}" Type="${PDM_TYPE}" signature="PDM_DATA_MODEL_XML" version="16.0.0.3488"?>\n` +
    `<!-- do not edit this file -->\n\n` +
    `<Model xmlns:a="attribute" xmlns:c="collection" xmlns:o="object">\n\n<o:RootObject Id="${rootId}">\n<c:Children>\n${body}\n</c:Children>\n</o:RootObject>\n\n</Model>\n`
  return { xml, warnings }
}
