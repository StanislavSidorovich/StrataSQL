// Import of PowerDesigner conceptual models (.cdm, and its backup copy .cdb), XML file format.
//
// PowerDesigner facts this relies on (checked on PD 16.0 files from the course):
// - a relationship stores Entity1 as <c:Object2> and Entity2 as <c:Object1>;
// - `Entity1ToEntity2RoleCardinality` = how many Entity2 one Entity1 has, i.e. the cardinality drawn
//   at Entity2's end; `DependentRole` B = Entity2 is identified through Entity1;
// - only non-default values are stored: no `MutuallyExclusive` = not exclusive, no `Complete` = complete;
// - attribute names and types live in shared data items, an entity attribute points to one;
// - diagram coordinates are in 1/100 mm with the y axis pointing up.

import { foreignKeyHolder, relationshipKind } from '../cdm2pdm'
import { CARD, emptyModel, parseCardinality, type Cardinality, type DataType, type Entity, type Model, type Point, type Side } from '../metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addInheritance, addRelationship, setForeignKeySide } from '../ops'
import { child, children, descendants, parseXml, textOf, type XmlElement } from './xml'

export interface ImportResult {
  model: Model
  /** Things that were skipped or guessed, in plain words. */
  warnings: string[]
}

export const POWERDESIGNER_EXTENSIONS = ['.cdm', '.cdb', '.pdm', '.pdb'] as const

/** PD type code prefix → conceptual type. */
const PD_TYPES: Record<string, DataType> = {
  I: 'Integer',
  SI: 'Short integer',
  BT: 'Short integer',
  LI: 'Long integer',
  NO: 'Serial', // PowerDesigner's own code for Serial
  SN: 'Serial', // written by v0.10.8 only
  N: 'Decimal',
  DC: 'Decimal',
  F: 'Float',
  SF: 'Float',
  LF: 'Float',
  MN: 'Money',
  BL: 'Boolean',
  A: 'Characters',
  VA: 'Variable characters',
  LA: 'Text',
  LVA: 'Text',
  TXT: 'Text',
  D: 'Date',
  T: 'Time',
  DT: 'Date & time',
  TS: 'Date & time',
  BIN: 'Binary',
  LBIN: 'Binary',
  VBIN: 'Binary',
  MBT: 'Characters',
  VMBT: 'Variable characters',
  PIC: 'Binary',
  OLE: 'Binary',
}

export function parsePdType(code: string | undefined): { dataType: DataType; length?: number; precision?: number } | null {
  if (!code) return null
  const m = /^([A-Z]+)(\d+)?(?:,(\d+))?$/.exec(code.trim())
  const dataType = m && PD_TYPES[m[1]]
  if (!m || !dataType) return null
  const out: { dataType: DataType; length?: number; precision?: number } = { dataType }
  if (m[2] && dataType !== 'Text') out.length = Number(m[2])
  if (m[3]) out.precision = Number(m[3])
  return out
}

/** Scale from PD units (1/100 mm) to canvas pixels. */
const SCALE = 0.012

/** Clear space kept between canvas boxes after an import: room for a relationship's marks and name. */
const SPREAD_GAP = 40

/**
 * Size of an entity box on our canvas, on the large side (measured at the default text size, plus 30 %
 * for the larger ones). PD draws its boxes smaller than ours, so a dense PD diagram placed as it is
 * would put our boxes on top of each other.
 */
export function canvasSize(e: Entity): { w: number; h: number } {
  const ids = e.identifiers.length
  const h = 37 + 17 * e.attributes.length + (ids ? 8 + 16 * ids : 0)
  const w = Math.max(170, 7.5 * e.name.length + 60, 6.5 * Math.max(0, ...e.attributes.map((a) => a.name.length)) + 95)
  return { w: Math.round(1.3 * w), h: Math.round(1.3 * h) }
}

/** A canvas box with its top and bottom in the PD diagram. */
export interface SpreadBox {
  x: number
  y: number
  w: number
  h: number
  row: [number, number]
}

/**
 * Moves boxes apart until no two overlap and each pair keeps `gap` between them, the reverse of the
 * export's compactLayout: left edges, then top edges, are mapped monotonically, so the order and the
 * alignment of the PD diagram are kept and gaps that are already wide enough stay as they are.
 * Across, only boxes in one row of the PD diagram (`row`: their top and bottom there) are pushed apart,
 * so a column whose boxes sit a few pixels off each other is not scattered sideways; down, every box
 * that still shares a column with another after that.
 */
export function spreadLayout(boxes: SpreadBox[], gap = SPREAD_GAP): SpreadBox[] {
  const out = boxes.map((b) => ({ ...b }))
  const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1) > 0
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'w' : 'h'
    const side = (a: SpreadBox, b: SpreadBox) => (axis === 'x' ? overlap(a.row[0], a.row[1], b.row[0], b.row[1]) : overlap(a.x, a.x + a.w, b.x, b.x + b.w))
    const edges = [...new Set(out.map((b) => b[axis]))].sort((p, q) => p - q)
    const moved = new Map<number, number>()
    edges.forEach((v, i) => {
      let n = i ? moved.get(edges[i - 1])! + (v - edges[i - 1]) : v
      for (const b of out)
        if (b[axis] === v)
          for (const a of out)
            if (a[axis] < v && side(a, b) && v - (a[axis] + a[size]) < gap) n = Math.max(n, moved.get(a[axis])! + a[size] + gap)
      moved.set(v, n)
    })
    for (const b of out) b[axis] = Math.round(moved.get(b[axis])!)
  }
  return out
}

function ref(el: XmlElement | undefined): string | undefined {
  return el?.children[0]?.attrs.Ref
}

function parseRect(text: string | undefined): { x1: number; y1: number; x2: number; y2: number } | null {
  const n = text?.match(/-?\d+/g)?.map(Number)
  if (!n || n.length < 4) return null
  return { x1: Math.min(n[0], n[2]), x2: Math.max(n[0], n[2]), y1: Math.min(n[1], n[3]), y2: Math.max(n[1], n[3]) }
}

export function importPowerDesigner(src: string, fileName = ''): ImportResult {
  const text = src.replace(/^﻿/, '').trimStart()
  if (!text.startsWith('<')) {
    throw new Error('This PowerDesigner file is saved in the binary format. In PowerDesigner use File → Save As… and choose the XML type, then import that file.')
  }
  const signature = /signature="([^"]+)"/.exec(text.slice(0, 2000))?.[1]
  if (signature?.startsWith('PDM')) throw new Error('This is a physical model (.pdm). Import the conceptual model (.cdm) instead — Quaera Model generates the physical model from it.')
  if (signature && !signature.startsWith('CDM')) throw new Error(`Not a PowerDesigner conceptual model (${signature}).`)

  const doc = parseXml(text)
  const pdModel = descendants(doc, 'o:Model').find((e) => e.attrs.Id)
  if (!pdModel) throw new Error(`${fileName || 'The file'} is not a PowerDesigner model: no <o:Model> found.`)

  const warnings: string[] = []
  const m = emptyModel(textOf(pdModel, 'a:Name') || 'Imported model')
  const comment = textOf(pdModel, 'a:Comment')
  m.comment = comment || `Imported from PowerDesigner${fileName ? ` (${fileName})` : ''}.`

  // Domains and data items (shared definitions).
  const domains = new Map<string, string>()
  for (const d of children(child(pdModel, 'c:Domains'), 'o:Domain')) {
    const t = parsePdType(textOf(d, 'a:DataType')) ?? { dataType: 'Variable characters' as DataType }
    const dom = addDomain(m, { name: textOf(d, 'a:Name') || 'Domain', ...t })
    domains.set(d.attrs.Id, dom.id)
  }
  const dataItems = new Map<string, XmlElement>()
  for (const d of children(child(pdModel, 'c:DataItems'), 'o:DataItem')) dataItems.set(d.attrs.Id, d)

  // Diagram positions: the default diagram first, then any other diagram.
  const diagrams = children(child(pdModel, 'c:ConceptualDiagrams'), 'o:ConceptualDiagram')
  const defaultId = ref(child(pdModel, 'c:DefaultDiagram'))
  diagrams.sort((a, b) => Number(b.attrs.Id === defaultId) - Number(a.attrs.Id === defaultId))
  const rects = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()
  for (const dg of diagrams) {
    for (const sym of child(dg, 'c:Symbols')?.children ?? []) {
      const target = ref(child(sym, 'c:Object'))
      const r = parseRect(textOf(sym, 'a:Rect'))
      if (target && r && !rects.has(target)) rects.set(target, r)
    }
  }
  const all = [...rects.values()]
  const minX = Math.min(...all.map((r) => r.x1))
  const maxY = Math.max(...all.map((r) => r.y2))
  // Each placed position's top and bottom in the PD diagram, in canvas pixels.
  const pdRow = new Map<Point, [number, number]>()
  const pos = (pdId: string, fallback: Point): Point => {
    const r = rects.get(pdId)
    if (!r) return fallback
    const p = { x: Math.round((r.x1 - minX) * SCALE) + 40, y: Math.round((maxY - r.y2) * SCALE) + 40 }
    pdRow.set(p, [p.y, Math.round((maxY - r.y1) * SCALE) + 40])
    return p
  }

  // Entities with attributes and identifiers.
  const entities = new Map<string, string>()
  const pdEntities = children(child(pdModel, 'c:Entities'), 'o:Entity')
  pdEntities.forEach((pe, i) => {
    const name = textOf(pe, 'a:Name') || `Entity_${i + 1}`
    const e = addEntity(m, { name, code: textOf(pe, 'a:Code'), comment: textOf(pe, 'a:Comment'), position: pos(pe.attrs.Id, { x: 40 + (i % 5) * 280, y: 40 + Math.floor(i / 5) * 220 }) })
    entities.set(pe.attrs.Id, e.id)
    const attrs = new Map<string, string>()
    for (const pa of children(child(pe, 'c:Attributes'), 'o:EntityAttribute')) {
      const item = dataItems.get(ref(child(pa, 'c:DataItem')) ?? '')
      if (!item) {
        warnings.push(`${name}: an attribute without a data item was skipped.`)
        continue
      }
      const typeCode = textOf(item, 'a:DataType')
      const t = parsePdType(typeCode)
      if (typeCode && !t) warnings.push(`${name}.${textOf(item, 'a:Name')}: type ${typeCode} is not known, imported as Variable characters.`)
      const domainId = domains.get(ref(child(item, 'c:Domain')) ?? '')
      const a = addAttribute(m, e.id, {
        name: textOf(item, 'a:Name'),
        code: textOf(item, 'a:Code'),
        ...(t ?? { dataType: 'Variable characters', length: 50 }),
        domainId,
        mandatory: textOf(pa, 'a:BaseAttribute.Mandatory') === '1',
        comment: textOf(item, 'a:Comment'),
      })
      attrs.set(pa.attrs.Id, a.id)
    }
    const primaryId = ref(child(pe, 'c:PrimaryIdentifier'))
    for (const pi of children(child(pe, 'c:Identifiers'), 'o:Identifier')) {
      const ids = children(child(pi, 'c:Identifier.Attributes'), 'o:EntityAttribute')
        .map((x) => attrs.get(x.attrs.Ref))
        .filter((x): x is string => !!x)
      if (ids.length === 0) continue
      addIdentifier(m, e.id, { name: textOf(pi, 'a:Name'), isPrimary: pi.attrs.Id === primaryId, attributeIds: ids })
    }
  })
  const shortcuts = children(child(pdModel, 'c:Entities'), 'o:Shortcut').length
  if (shortcuts) warnings.push(`${shortcuts} entity shortcut(s) to other models were skipped.`)

  // Relationships.
  for (const pr of children(child(pdModel, 'c:Relationships'), 'o:Relationship')) {
    const name = textOf(pr, 'a:Name') || 'Relationship'
    const e1 = entities.get(ref(child(pr, 'c:Object2')) ?? '')
    const e2 = entities.get(ref(child(pr, 'c:Object1')) ?? '')
    if (!e1 || !e2) {
      warnings.push(`Relationship ${name}: an end is not an entity of this model, skipped.`)
      continue
    }
    const card = (t: string | undefined, fallback: Cardinality): Cardinality => {
      const c = t ? parseCardinality(t) : null
      if (t && !c) warnings.push(`Relationship ${name}: cardinality ${t} is not supported, used ${fallback.min},${fallback.max}.`)
      return c ?? fallback
    }
    const dep = textOf(pr, 'a:DependentRole')
    const dependentSide: Side | null = dep === 'A' ? 'A' : dep === 'B' ? 'B' : null
    const roles = [textOf(pr, 'a:Entity1ToEntity2Role'), textOf(pr, 'a:Entity2ToEntity1Role')].filter(Boolean)
    try {
      const rel = addRelationship(m, e1, e2, {
        name,
        cardinalityB: card(textOf(pr, 'a:Entity1ToEntity2RoleCardinality'), CARD.zeroMany),
        cardinalityA: card(textOf(pr, 'a:Entity2ToEntity1RoleCardinality'), CARD.zeroOne),
        dependentSide,
        comment: [textOf(pr, 'a:Comment'), roles.length ? `PowerDesigner roles: ${roles.join(' / ')}` : ''].filter(Boolean).join('\n') || undefined,
      })
      const dominant = textOf(pr, 'a:DominantRole')
      // The dominant side is the parent; keep the choice only where it differs from the automatic one
      // (the export writes it for every one-to-one).
      const holder: Side | null = dominant === 'A' ? 'B' : dominant === 'B' ? 'A' : null
      if (holder && relationshipKind(rel) === 'one-to-one' && foreignKeyHolder(rel) !== holder) setForeignKeySide(m, rel.id, holder)
    } catch (err) {
      warnings.push(`Relationship ${name}: ${(err as Error).message}`)
    }
  }

  // Inheritances: children come from the inheritance links.
  const links = children(child(pdModel, 'c:InheritanceLinks'), 'o:InheritanceLink')
  for (const pi of children(child(pdModel, 'c:Inheritances'), 'o:Inheritance')) {
    const name = textOf(pi, 'a:Name') || 'Inheritance'
    const parent = entities.get(ref(child(pi, 'c:ParentEntity')) ?? '')
    const kids = links
      .filter((l) => ref(child(l, 'c:Object1')) === pi.attrs.Id)
      .map((l) => entities.get(ref(child(l, 'c:Object2')) ?? ''))
      .filter((x): x is string => !!x)
    if (!parent || kids.length === 0) {
      warnings.push(`Inheritance ${name}: no parent or no children, skipped.`)
      continue
    }
    try {
      const parentPos = m.entities.find((e) => e.id === parent)!.position
      // PD stores only non-default flags: generate parent and children, inherit all attributes.
      const gp = textOf(pi, 'a:GenerateParent') !== '0'
      const gc = textOf(pi, 'a:GenerateChildren') !== '0'
      const generation = gp && gc ? 'both' : gp ? 'parent' : 'children'
      addInheritance(m, parent, kids, {
        name,
        generation,
        inheritAll: generation === 'both' && textOf(pi, 'a:InheritAll') !== '0',
        mutuallyExclusive: textOf(pi, 'a:MutuallyExclusive') === '1',
        complete: textOf(pi, 'a:BaseLogicalInheritance.Complete') !== '0',
        position: pos(pi.attrs.Id, { x: parentPos.x + 60, y: parentPos.y + 160 }),
      })
    } catch (err) {
      warnings.push(`Inheritance ${name}: ${(err as Error).message}`)
    }
  }

  // PD's boxes are smaller than ours: spread the placed symbols so ours do not overlap.
  const placed = [
    ...m.entities.map((e) => ({ p: e.position, ...canvasSize(e) })),
    ...m.inheritances.map((i) => ({ p: i.position, w: 40, h: 24 })),
  ]
  spreadLayout(placed.map((b) => ({ x: b.p.x, y: b.p.y, w: b.w, h: b.h, row: pdRow.get(b.p) ?? [b.p.y, b.p.y + b.h] }))).forEach((b, k) => {
    placed[k].p.x = b.x
    placed[k].p.y = b.y
  })

  return { model: m, warnings }
}
