// Reads the tables of a PowerDesigner physical model (.pdm XML): columns, PK, alternate keys and
// references (FKs). Used to cross-check our CDM → PDM generation against PowerDesigner's own, and
// the first half of a future `.pdm` → CDM reverse import.

import { child, children, descendants, parseXml, textOf, type XmlElement } from './xml'

export interface PdColumn {
  code: string
  /** SQL type as PowerDesigner wrote it: `int`, `varchar(50)`, `datetime`. */
  type: string
  mandatory: boolean
}

export interface PdTable {
  code: string
  columns: PdColumn[]
  primaryKey: string[]
  /** Keys other than the primary one (UNIQUE). */
  alternateKeys: string[][]
  foreignKeys: { code: string; parent: string; columns: string[]; parentColumns: string[] }[]
}

const ref = (el: XmlElement | undefined) => el?.children[0]?.attrs.Ref

export function readPdTables(src: string): PdTable[] {
  const doc = parseXml(src)
  const model = descendants(doc, 'o:Model')[0]
  if (!model) throw new Error('Not a PowerDesigner model file')
  const tableEls = children(child(model, 'c:Tables'), 'o:Table')
  const colCode = new Map<string, string>()
  const tableCode = new Map<string, string>()
  const keyCols = new Map<string, string[]>()
  const tables = new Map<string, PdTable>()
  for (const t of tableEls) {
    const code = textOf(t, 'a:Code') ?? '?'
    tableCode.set(t.attrs.Id, code)
    const columns = children(child(t, 'c:Columns'), 'o:Column').map((c) => {
      colCode.set(c.attrs.Id, textOf(c, 'a:Code') ?? '?')
      return { code: textOf(c, 'a:Code') ?? '?', type: textOf(c, 'a:DataType') ?? '', mandatory: textOf(c, 'a:Column.Mandatory') === '1' }
    })
    for (const k of children(child(t, 'c:Keys'), 'o:Key'))
      keyCols.set(k.attrs.Id, children(child(k, 'c:Key.Columns'), 'o:Column').map((c) => colCode.get(c.attrs.Ref) ?? '?'))
    const pkId = ref(child(t, 'c:PrimaryKey'))
    tables.set(t.attrs.Id, {
      code,
      columns,
      primaryKey: pkId ? keyCols.get(pkId) ?? [] : [],
      alternateKeys: children(child(t, 'c:Keys'), 'o:Key')
        .filter((k) => k.attrs.Id !== pkId)
        .map((k) => keyCols.get(k.attrs.Id) ?? []),
      foreignKeys: [],
    })
  }
  for (const r of children(child(model, 'c:References'), 'o:Reference')) {
    const childT = tables.get(ref(child(r, 'c:ChildTable')) ?? '')
    const parent = tableCode.get(ref(child(r, 'c:ParentTable')) ?? '')
    if (!childT || !parent) continue
    const joins = children(child(r, 'c:Joins'), 'o:ReferenceJoin')
    childT.foreignKeys.push({
      code: textOf(r, 'a:Code') ?? '?',
      parent,
      parentColumns: joins.map((j) => colCode.get(ref(child(j, 'c:Object1')) ?? '') ?? '?'),
      columns: joins.map((j) => colCode.get(ref(child(j, 'c:Object2')) ?? '') ?? '?'),
    })
  }
  return [...tables.values()]
}
