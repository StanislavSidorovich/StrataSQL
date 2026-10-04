// Export to a PowerDesigner conceptual model (.cdm), XML file format — the reverse of import/powerdesigner.ts.
//
// Written in the shape of the PD 16.0 files from the course (same facts as the importer):
// - a relationship stores Entity1 (our A) as <c:Object2> and Entity2 (our B) as <c:Object1>;
// - `Entity1ToEntity2RoleCardinality` is the cardinality drawn at Entity2's end (our cardinalityB);
// - each entity attribute points to a data item that holds its name, code and type;
// - only non-default flags are written; option blocks (model options, display preferences) are left
//   out, so PowerDesigner uses its defaults;
// - diagram coordinates are in 1/100 mm with the y axis pointing up.

import { DATA_TYPE_CODES, TYPES_WITH_LENGTH, TYPES_WITH_PRECISION, formatCardinality, type Attribute, type DataType, type Entity, type Model, type Point } from '../metamodel'

export interface ExportResult {
  xml: string
  /** Things PowerDesigner's CDM cannot hold, in plain words. */
  warnings: string[]
}

/** PD type code for a conceptual type with its size (`VA50`, `DC10,2`, `I`). */
export function pdTypeCode(t: { dataType: DataType; length?: number; precision?: number }): string {
  const code = DATA_TYPE_CODES[t.dataType]
  if (TYPES_WITH_PRECISION.includes(t.dataType) && t.length !== undefined) return t.precision !== undefined ? `${code}${t.length},${t.precision}` : `${code}${t.length}`
  if (TYPES_WITH_LENGTH.includes(t.dataType) && t.length !== undefined) return `${code}${t.length}`
  return code
}

/** Canvas pixels → PD units (the importer's SCALE is 0.012). */
const UNITS = 1 / 0.012

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** PD codes: upper case, letters/digits/underscore. */
export function pdCode(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || 'OBJECT'
  )
}

function randomGuid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID().toUpperCase()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 3) | 8).toString(16).toUpperCase()
  })
}

interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

const rectText = (r: Rect) => `((${r.x1},${r.y1}), (${r.x2},${r.y2}))`
const center = (r: Rect): Point => ({ x: Math.round((r.x1 + r.x2) / 2), y: Math.round((r.y1 + r.y2) / 2) })

/** Where the line from the rectangle's centre towards `to` leaves the rectangle. */
function border(r: Rect, to: Point): Point {
  const c = center(r)
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = (r.x2 - r.x1) / 2
  const hh = (r.y2 - r.y1) / 2
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity)
  return { x: Math.round(c.x + dx * t), y: Math.round(c.y + dy * t) }
}

function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x1: Math.min(...xs) - 400, y1: Math.min(...ys) - 400, x2: Math.max(...xs) + 400, y2: Math.max(...ys) + 400 }
}

const points = (ps: Point[]) => `(${ps.map((p) => `(${p.x},${p.y})`).join(',')})`

/** Approximate size of an entity symbol in PD units, from its longest line and the number of lines. */
function entitySize(e: Entity): { w: number; h: number } {
  const lines = [e.name, ...e.attributes.map((a) => `${a.name} <pi> ${pdTypeCode(a)} <M>`), ...e.identifiers.map((i) => `${i.name} <pi>`)]
  const longest = Math.max(...lines.map((l) => l.length))
  return { w: Math.max(6000, Math.round(longest * 330 + 1600)), h: 1800 + 900 * Math.max(1, e.attributes.length) + 900 * e.identifiers.length }
}

export function exportPowerDesigner(model: Model, opts: { guid?: () => string; now?: number; user?: string } = {}): ExportResult {
  const guid = opts.guid ?? randomGuid
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const user = esc(opts.user ?? 'StrataSQL')
  const warnings: string[] = []
  let next = 1
  const id = () => `o${next++}`

  const stamp = () => `<a:CreationDate>${now}</a:CreationDate>\n<a:Creator>${user}</a:Creator>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Modifier>${user}</a:Modifier>\n`
  const named = (name: string, code: string) => `<a:ObjectID>${guid()}</a:ObjectID>\n<a:Name>${esc(name)}</a:Name>\n<a:Code>${esc(code)}</a:Code>\n${stamp()}`
  const comment = (c: string | undefined) => (c ? `<a:Comment>${esc(c)}</a:Comment>\n` : '')

  // PD wants unique codes per kind; make them unique the way PD does (a digit appended).
  const uniq = () => {
    const seen = new Set<string>()
    return (code: string) => {
      let c = code
      for (let n = 2; seen.has(c); n++) c = `${code}${n}`
      seen.add(c)
      return c
    }
  }
  const entityCode = uniq()
  const itemCode = uniq()
  const relCode = uniq()
  const inhCode = uniq()

  // Object ids first, so symbols and objects can point at each other.
  const rootId = id()
  const modelId = id()
  const diagramId = id()
  const entityIds = new Map(model.entities.map((e) => [e.id, id()]))
  const entitySymIds = new Map(model.entities.map((e) => [e.id, id()]))
  const attrIds = new Map<string, string>()
  // Data items are shared, as in PD: attributes with the same name, code, type, domain and comment
  // (Title in Book and in Film) point to one data item; its comment is the first one's. PD requires unique data item codes.
  const itemIds = new Map<string, string>()
  const itemByKey = new Map<string, string>()
  const itemDefs: { pid: string; a: Attribute; e: Entity }[] = []
  for (const e of model.entities)
    for (const a of e.attributes) {
      attrIds.set(a.id, id())
      const key = [a.name, a.code, pdTypeCode(a), a.domainId ?? ''].join('|')
      let pid = itemByKey.get(key)
      if (!pid) {
        pid = id()
        itemByKey.set(key, pid)
        itemDefs.push({ pid, a, e })
      }
      itemIds.set(a.id, pid)
    }
  const domainIds = new Map(model.domains.map((d) => [d.id, id()]))
  const relIds = new Map(model.relationships.map((r) => [r.id, id()]))
  const inhIds = new Map(model.inheritances.map((i) => [i.id, id()]))
  const inhSymIds = new Map(model.inheritances.map((i) => [i.id, id()]))
  const linkIds = new Map(model.inheritances.flatMap((i) => i.childIds.map((c) => [`${i.id}:${c}`, id()] as const)))

  // Diagram: our y grows downwards, PD's upwards.
  const rects = new Map<string, Rect>()
  for (const e of model.entities) {
    const { w, h } = entitySize(e)
    const x1 = Math.round(e.position.x * UNITS)
    const y2 = -Math.round(e.position.y * UNITS)
    rects.set(e.id, { x1, y1: y2 - h, x2: x1 + w, y2 })
  }
  const symbols: string[] = []
  for (const e of model.entities) {
    symbols.push(
      `<o:EntitySymbol Id="${entitySymIds.get(e.id)}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:IconMode>-1</a:IconMode>\n<a:Rect>${rectText(rects.get(e.id)!)}</a:Rect>\n<a:LineColor>11184640</a:LineColor>\n<a:FillColor>16777136</a:FillColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<a:BrushStyle>6</a:BrushStyle>\n<a:GradientFillMode>65</a:GradientFillMode>\n<a:GradientEndColor>16777215</a:GradientEndColor>\n<c:Object>\n<o:Entity Ref="${entityIds.get(e.id)}"/>\n</c:Object>\n</o:EntitySymbol>`,
    )
  }
  for (const r of model.relationships) {
    const ra = rects.get(r.entityA)!
    const rb = rects.get(r.entityB)!
    let path: Point[]
    if (r.entityA === r.entityB) {
      // Reflexive: a loop out of the right side and back over the top.
      const out = { x: ra.x2, y: center(ra).y }
      path = [out, { x: ra.x2 + 2000, y: out.y }, { x: ra.x2 + 2000, y: ra.y2 + 2000 }, { x: center(ra).x, y: ra.y2 + 2000 }, { x: center(ra).x, y: ra.y2 }]
    } else path = [border(ra, center(rb)), border(rb, center(ra))]
    symbols.push(
      `<o:RelationshipSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(path))}</a:Rect>\n<a:ListOfPoints>${points(path)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:LineColor>11184640</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<c:SourceSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(r.entityA)}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(r.entityB)}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:Relationship Ref="${relIds.get(r.id)}"/>\n</c:Object>\n</o:RelationshipSymbol>`,
    )
  }
  for (const inh of model.inheritances) {
    const x1 = Math.round(inh.position.x * UNITS)
    const y2 = -Math.round(inh.position.y * UNITS)
    const sym: Rect = { x1, y1: y2 - 1000, x2: x1 + 1600, y2 }
    const symId = inhSymIds.get(inh.id)!
    symbols.push(
      `<o:InheritanceSymbol Id="${symId}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:IconMode>-1</a:IconMode>\n<a:Rect>${rectText(sym)}</a:Rect>\n<a:LineColor>16744576</a:LineColor>\n<a:FillColor>16777136</a:FillColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<a:BrushStyle>6</a:BrushStyle>\n<a:GradientFillMode>65</a:GradientFillMode>\n<a:GradientEndColor>16777215</a:GradientEndColor>\n<a:KeepSize>1</a:KeepSize>\n<c:Object>\n<o:Inheritance Ref="${inhIds.get(inh.id)}"/>\n</c:Object>\n</o:InheritanceSymbol>`,
    )
    const parent = rects.get(inh.parentId)!
    const up = [border(sym, center(parent)), border(parent, center(sym))]
    symbols.push(
      `<o:InheritanceRootLinkSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(up))}</a:Rect>\n<a:ListOfPoints>${points(up)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>1</a:ArrowStyle>\n<a:LineColor>16744576</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<c:SourceSymbol>\n<o:InheritanceSymbol Ref="${symId}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(inh.parentId)}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:Inheritance Ref="${inhIds.get(inh.id)}"/>\n</c:Object>\n</o:InheritanceRootLinkSymbol>`,
    )
    for (const c of inh.childIds) {
      const kid = rects.get(c)!
      const down = [border(kid, center(sym)), border(sym, center(kid))]
      symbols.push(
        `<o:InheritanceLinkSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(down))}</a:Rect>\n<a:ListOfPoints>${points(down)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>0</a:ArrowStyle>\n<a:LineColor>16744576</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n<c:SourceSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(c)}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:InheritanceSymbol Ref="${symId}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:InheritanceLink Ref="${linkIds.get(`${inh.id}:${c}`)}"/>\n</c:Object>\n</o:InheritanceLinkSymbol>`,
      )
    }
  }

  // Entities with their attributes and identifiers.
  const entities = model.entities.map((e) => {
    const ids = e.identifiers.map((i) => ({ i, pid: id() }))
    const primary = ids.find((x) => x.i.isPrimary)
    const idXml = ids
      .map(
        ({ i, pid }) =>
          `<o:Identifier Id="${pid}">\n${named(i.name, pdCode(i.name))}<c:Identifier.Attributes>\n${i.attributeIds.map((a) => `<o:EntityAttribute Ref="${attrIds.get(a)}"/>`).join('\n')}\n</c:Identifier.Attributes>\n</o:Identifier>`,
      )
      .join('\n')
    const attrXml = e.attributes
      .map(
        (a) =>
          `<o:EntityAttribute Id="${attrIds.get(a.id)}">\n<a:ObjectID>${guid()}</a:ObjectID>\n${stamp()}${a.mandatory ? '<a:BaseAttribute.Mandatory>1</a:BaseAttribute.Mandatory>\n' : ''}<c:DataItem>\n<o:DataItem Ref="${itemIds.get(a.id)}"/>\n</c:DataItem>\n</o:EntityAttribute>`,
      )
      .join('\n')
    if (e.physicalKeys?.length) warnings.push(`${e.name}: alternate keys over table columns (${e.physicalKeys.map((k) => k.name).join(', ')}) are not part of a PowerDesigner CDM — add them in the PDM.`)
    return (
      `<o:Entity Id="${entityIds.get(e.id)}">\n${named(e.name, entityCode(e.code || pdCode(e.name)))}${comment(e.comment)}` +
      (ids.length ? `<c:Identifiers>\n${idXml}\n</c:Identifiers>\n` : '') +
      (primary ? `<c:PrimaryIdentifier>\n<o:Identifier Ref="${primary.pid}"/>\n</c:PrimaryIdentifier>\n` : '') +
      (e.attributes.length ? `<c:Attributes>\n${attrXml}\n</c:Attributes>\n` : '') +
      `</o:Entity>`
    )
  })

  const typeXml = (t: { dataType: DataType; length?: number; precision?: number }) =>
    `<a:DataType>${pdTypeCode(t)}</a:DataType>\n` +
    (t.length !== undefined && t.dataType !== 'Text' ? `<a:Length>${t.length}</a:Length>\n` : '') +
    (t.precision !== undefined ? `<a:Precision>${t.precision}</a:Precision>\n` : '')

  const items = itemDefs.map(({ pid, a, e }) => {
    const dom = a.domainId ? model.domains.find((d) => d.id === a.domainId) : undefined
    const code = a.code || pdCode(a.name)
    const unique = itemCode(code)
    if (unique !== code) warnings.push(`${e.name}.${a.name}: another entity has an attribute with the code ${code} but a different type; PowerDesigner needs one data item per code, so this one is ${unique} (its column too). Give both the same type, or rename one.`)
    return `<o:DataItem Id="${pid}">
${named(a.name, unique)}${comment(a.comment)}${typeXml(dom ?? a)}${dom ? `<c:Domain>
<o:Domain Ref="${domainIds.get(dom.id)}"/>
</c:Domain>
` : ''}</o:DataItem>`
  })

  const domainCode = uniq()
  const domains = model.domains.map((d) => `<o:Domain Id="${domainIds.get(d.id)}">\n${named(d.name, domainCode(pdCode(d.name)))}${typeXml(d)}</o:Domain>`)

  const nameOf = (eid: string) => model.entities.find((e) => e.id === eid)?.name ?? '?'
  const rels = model.relationships.map((r) => {
    const dominant = r.foreignKeySide ? `<a:DominantRole>${r.foreignKeySide === 'B' ? 'A' : 'B'}</a:DominantRole>\n` : ''
    // Our roles are FK column prefixes; PD roles are verb phrases that do not name columns. Keep ours in the comment.
    const roles = [r.roleA && `${nameOf(r.entityA)}: ${r.roleA}`, r.roleB && `${nameOf(r.entityB)}: ${r.roleB}`].filter(Boolean).join(', ')
    if (roles) warnings.push(`${r.name}: the role names (${roles}) are kept only in the comment; PowerDesigner names the foreign key columns itself.`)
    const relComment = [r.comment, roles && `StrataSQL roles (FK prefixes): ${roles}`].filter(Boolean).join('\n')
    return (
      `<o:Relationship Id="${relIds.get(r.id)}">\n${named(r.name, relCode(pdCode(r.name)))}${comment(relComment)}` +
      (r.dependentSide ? `<a:DependentRole>${r.dependentSide}</a:DependentRole>\n` : '') +
      dominant +
      `<a:Entity1ToEntity2RoleCardinality>${formatCardinality(r.cardinalityB)}</a:Entity1ToEntity2RoleCardinality>\n<a:Entity2ToEntity1RoleCardinality>${formatCardinality(r.cardinalityA)}</a:Entity2ToEntity1RoleCardinality>\n` +
      `<c:Object1>\n<o:Entity Ref="${entityIds.get(r.entityB)}"/>\n</c:Object1>\n<c:Object2>\n<o:Entity Ref="${entityIds.get(r.entityA)}"/>\n</c:Object2>\n</o:Relationship>`
    )
  })

  const inhs = model.inheritances.map((inh) => {
    const flags =
      (inh.mutuallyExclusive ? '<a:MutuallyExclusive>1</a:MutuallyExclusive>\n' : '') +
      (inh.complete ? '' : '<a:BaseLogicalInheritance.Complete>0</a:BaseLogicalInheritance.Complete>\n') +
      (inh.generation === 'children' ? '<a:GenerateParent>0</a:GenerateParent>\n' : '') +
      (inh.generation === 'parent' ? '<a:GenerateChildren>0</a:GenerateChildren>\n' : '') +
      (inh.generation === 'both' && !inh.inheritAll ? '<a:InheritAll>0</a:InheritAll>\n' : '')
    if (inh.discriminator) warnings.push(`${inh.name}: the discriminator column ${inh.discriminator} is not exported — set it in PowerDesigner's inheritance properties.`)
    return `<o:Inheritance Id="${inhIds.get(inh.id)}">\n${named(inh.name, inhCode(pdCode(inh.name)))}${comment(inh.comment)}${flags}<c:ParentEntity>\n<o:Entity Ref="${entityIds.get(inh.parentId)}"/>\n</c:ParentEntity>\n</o:Inheritance>`
  })
  const links = model.inheritances.flatMap((inh) =>
    inh.childIds.map(
      (c) =>
        `<o:InheritanceLink Id="${linkIds.get(`${inh.id}:${c}`)}">\n<a:ObjectID>${guid()}</a:ObjectID>\n${stamp()}<c:Object1>\n<o:Inheritance Ref="${inhIds.get(inh.id)}"/>\n</c:Object1>\n<c:Object2>\n<o:Entity Ref="${entityIds.get(c)}"/>\n</c:Object2>\n</o:InheritanceLink>`,
    ),
  )

  const section = (tag: string, parts: string[]) => (parts.length ? `<c:${tag}>\n${parts.join('\n')}\n</c:${tag}>\n` : '')
  const modelGuid = guid()
  const body =
    `<o:Model Id="${modelId}">\n<a:ObjectID>${modelGuid}</a:ObjectID>\n<a:Name>${esc(model.name)}</a:Name>\n<a:Code>${pdCode(model.name)}</a:Code>\n${stamp()}${comment(model.comment)}` +
    `<c:ConceptualDiagrams>\n<o:ConceptualDiagram Id="${diagramId}">\n${named('Diagram_1', 'DIAGRAM_1')}` +
    section('Symbols', symbols) +
    `</o:ConceptualDiagram>\n</c:ConceptualDiagrams>\n<c:DefaultDiagram>\n<o:ConceptualDiagram Ref="${diagramId}"/>\n</c:DefaultDiagram>\n` +
    section('Domains', domains) +
    section('Entities', entities) +
    section('Relationships', rels) +
    section('Inheritances', inhs) +
    section('DataItems', items) +
    section('InheritanceLinks', links) +
    `</o:Model>`

  const objects = next - 1 - symbols.length
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?PowerDesigner AppLocale="UTF16" ID="{${modelGuid}}" Label="" LastModificationDate="${now}" Name="${esc(model.name)}" Objects="${objects}" Symbols="${symbols.length}" Type="{1E597170-9350-11D1-AB3C-0020AF71E433}" signature="CDM_DATA_MODEL_XML" version="16.0.0.3488"?>\n` +
    `<!-- do not edit this file -->\n\n` +
    `<Model xmlns:a="attribute" xmlns:c="collection" xmlns:o="object">\n\n<o:RootObject Id="${rootId}">\n<c:Children>\n${body}\n</c:Children>\n</o:RootObject>\n\n</Model>\n`
  return { xml, warnings }
}
