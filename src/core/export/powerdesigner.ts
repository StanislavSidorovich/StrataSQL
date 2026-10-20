// Export to a PowerDesigner conceptual model (.cdm), XML file format — the reverse of import/powerdesigner.ts.
//
// Written in the shape of the PD 16.0 files from the course (same facts as the importer):
// - a relationship stores Entity1 (our A) as <c:Object2> and Entity2 (our B) as <c:Object1>;
// - `Entity1ToEntity2RoleCardinality` is the cardinality drawn at Entity2's end (our cardinalityB);
// - each entity attribute points to a data item that holds its name, code and type;
// - only non-default flags are written; model options are left out, so PowerDesigner uses its defaults;
// - the diagram carries PD's default display preferences and every symbol its FontList (Arial 8): without
//   them PD takes larger fonts, stretches the entities to the text and the line ends fall inside them;
// - diagram coordinates are in 1/100 mm with the y axis pointing up.

import { PD_DISPLAY_PREFERENCES } from './pdDisplayPreferences'
import { DATA_TYPE_CODES, TYPES_WITH_LENGTH, TYPES_WITH_PRECISION, formatCardinality, type Attribute, type Cardinality, type DataType, type Entity, type Model, type Point } from '../metamodel'

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
export const UNITS = 1 / 0.012

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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

export function randomGuid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID().toUpperCase()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 3) | 8).toString(16).toUpperCase()
  })
}

export interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export const rectText = (r: Rect) => `((${r.x1},${r.y1}), (${r.x2},${r.y2}))`
export const center = (r: Rect): Point => ({ x: Math.round((r.x1 + r.x2) / 2), y: Math.round((r.y1 + r.y2) / 2) })

/** Where the line from the rectangle's centre towards `to` leaves the rectangle. */
export function border(r: Rect, to: Point): Point {
  const c = center(r)
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = (r.x2 - r.x1) / 2
  const hh = (r.y2 - r.y1) / 2
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity)
  return { x: Math.round(c.x + dx * t), y: Math.round(c.y + dy * t) }
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x1: Math.min(...xs) - 400, y1: Math.min(...ys) - 400, x2: Math.max(...xs) + 400, y2: Math.max(...ys) + 400 }
}

/** Font lists of PD symbols (Arial 8), as PD writes them. */
const FONTS = {
  entity: 'STRN 0 Arial,8,N\nDISPNAME 0 Arial,8,N\nAttributes 0 Arial,8,N\nEntityPrimaryAttribute 0 Arial,8,U\nIdentifiers 0 Arial,8,N\nLABL 0 Arial,8,N',
  relationship: 'CENTER 0 Arial,8,N\nSOURCE 0 Arial,8,N\nDESTINATION 0 Arial,8,N',
  inheritance: 'STRN 0 Arial,8,N\nDISPNAME 0 Arial,8,N',
  rootLink: 'DISPNAME 0 Arial,8,N',
  link: 'CENTER 0 Arial,8,N',
}
const fontList = (f: string) => `<a:FontList>${f}</a:FontList>\n`

/**
 * PD's ArrowStyle of a relationship symbol (which end marks to draw), decoded from a PD file:
 * 0x1010 + (code of the Entity2→Entity1 cardinality, +4 if A is the dependent side) * 256
 *        + (code of the Entity1→Entity2 cardinality, +4 if B is the dependent side),
 * codes 0,1 → 1; 1,1 → 2; 0,n → 3; 1,n → 4. Our A is PD's Entity1.
 */
export function arrowStyle(r: { cardinalityA: Cardinality; cardinalityB: Cardinality; dependentSide: 'A' | 'B' | null }): number {
  const code = (c: Cardinality) => (c.max === 'n' ? (c.min === 0 ? 3 : 4) : c.min === 0 ? 1 : 2)
  return 0x1010 + (code(r.cardinalityA) + (r.dependentSide === 'A' ? 4 : 0)) * 256 + code(r.cardinalityB) + (r.dependentSide === 'B' ? 4 : 0)
}

export const points = (ps: Point[]) => `(${ps.map((p) => `(${p.x},${p.y})`).join(',')})`

// Arial advance widths, 1/1000 em, for the characters that show up in names and type codes.
const ARIAL: Record<string, number> = { ' ': 278, '_': 556, '-': 333, '.': 278, ',': 278, '(': 333, ')': 333, '<': 584, '>': 584, i: 222, j: 222, l: 222, f: 278, t: 278, r: 333, I: 278, m: 833, w: 722, M: 833, W: 944 }
const arialWidth = (t: string) =>
  [...t].reduce((sum, ch) => sum + (ARIAL[ch] ?? (/[A-Z]/.test(ch) ? 690 : 556)), 0)

/**
 * Size of an entity symbol in PD units. PD stretches the table to its widest "name  <pi>  type  <M>" row
 * (Arial 8) and 960 units per row; the line ends stay on the old border, so a table that is too narrow
 * puts the line ends inside it. Coefficients fitted to the entities of a real PD file (error about 15%),
 * with some slack on top: too wide is harmless, too narrow is the bug.
 */
export function entitySize(e: Entity): { w: number; h: number } {
  const rows = e.attributes.length
  const nameW = Math.max(arialWidth(e.name), ...e.attributes.map((a) => arialWidth(a.name)))
  const typeW = Math.max(0, ...e.attributes.map((a) => arialWidth(pdTypeCode(a))))
  return { w: Math.max(9000, Math.round(0.9 * nameW + 3.8 * typeW + 3100 + 1500)), h: Math.max(3999, 2819 + 960 * rows) }
}

/** A symbol box with its top-left corner, y growing downwards as on our canvas. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** How the gaps shrink, per axis: gap → min(gap, max(floor, base + slope × gap)); empty space without a neighbour × slope. */
const SQUEEZE = { x: { base: 4000, slope: 0.3, floor: 3000 }, y: { base: 2400, slope: 0.3, floor: 2500 } }

/**
 * Pulls the symbols together like a diagram drawn in PD. On our canvas the tables keep room for the
 * relationship labels, so in PD units the gaps come out 2.5–3.5 times PD's own (about 12 500 across and
 * 6 000 down in a PD-drawn file). The left (then top) edges are mapped monotonically, so the order stays,
 * tables aligned on the canvas stay aligned, and two symbols side by side keep at least the floor between
 * them (or the overlap they already had). Across first, then down with the new x, so that two symbols
 * pulled into one column across are kept apart down.
 */
export function compactLayout(boxes: Box[]): Box[] {
  const out = boxes.map((b) => ({ ...b }))
  for (const axis of ['x', 'y'] as const) {
    const o = axis === 'x' ? 'y' : 'x'
    const size = axis === 'x' ? 'w' : 'h'
    const osize = axis === 'x' ? 'h' : 'w'
    const { base, slope, floor } = SQUEEZE[axis]
    const side = (a: Box, b: Box) => Math.min(a[o] + a[osize], b[o] + b[osize]) - Math.max(a[o], b[o]) > 0
    const edges = [...new Set(out.map((b) => b[axis]))].sort((p, q) => p - q)
    const moved = new Map<number, number>()
    edges.forEach((v, i) => {
      let n = i ? moved.get(edges[i - 1])! + slope * (v - edges[i - 1]) : v
      for (const b of out)
        if (b[axis] === v)
          for (const a of out)
            if (a[axis] < v && side(a, b)) {
              const gap = v - (a[axis] + a[size])
              n = Math.max(n, moved.get(a[axis])! + a[size] + Math.min(gap, Math.max(floor, base + slope * gap)))
            }
      moved.set(v, n)
    })
    for (const b of out) b[axis] = Math.round(moved.get(b[axis])!)
  }
  return out
}

/**
 * Orthogonal route between two symbols, as PD draws it: ends exactly on the rectangle edges.
 * Overlapping in X: a vertical through the middle of the overlap; in Y: a horizontal through its middle;
 * otherwise an L of three points (out of a side of `a`, into the top or bottom of `b`).
 */
export function routeOrthogonal(a: Rect, b: Rect): Point[] {
  const ox1 = Math.max(a.x1, b.x1)
  const ox2 = Math.min(a.x2, b.x2)
  const oy1 = Math.max(a.y1, b.y1)
  const oy2 = Math.min(a.y2, b.y2)
  const apartY = a.y1 >= b.y2 || b.y1 >= a.y2
  const apartX = a.x2 <= b.x1 || b.x2 <= a.x1
  if (ox1 < ox2 && apartY) {
    const x = Math.round((ox1 + ox2) / 2)
    return a.y1 >= b.y2 ? [{ x, y: a.y1 }, { x, y: b.y2 }] : [{ x, y: a.y2 }, { x, y: b.y1 }]
  }
  if (oy1 < oy2 && apartX) {
    const y = Math.round((oy1 + oy2) / 2)
    return a.x2 <= b.x1 ? [{ x: a.x2, y }, { x: b.x1, y }] : [{ x: a.x1, y }, { x: b.x2, y }]
  }
  // L route (rectangles apart on both axes; overlapping ones, which the layout never produces, get the same shape).
  const ca = center(a)
  const cb = center(b)
  const sideX = cb.x >= ca.x ? a.x2 : a.x1
  const edgeY = cb.y >= ca.y ? b.y1 : b.y2
  return [{ x: sideX, y: ca.y }, { x: cb.x, y: ca.y }, { x: cb.x, y: edgeY }]
}

/** Clearance kept between a line and the edges of other symbols, and between a line end and a corner. */
const MARGIN = 400
/** Shortest first and last segment that leaves room for the end marks (crow's foot, circle, bar). */
const MIN_END = 1200
/** Two parallel lines closer than this read as one in PD (300 still did); a route along such a line costs extra. */
const PARALLEL = 800

/**
 * Does the segment p–q run through r? With `touch`, running along or touching its edge counts too
 * (right for another symbol: a line on its border reads as joined to it); without, only the inside.
 */
export function hitsRect(p: Point, q: Point, r: Rect, touch = true): boolean {
  if (touch) return Math.min(p.x, q.x) <= r.x2 && Math.max(p.x, q.x) >= r.x1 && Math.min(p.y, q.y) <= r.y2 && Math.max(p.y, q.y) >= r.y1
  return Math.min(p.x, q.x) < r.x2 && Math.max(p.x, q.x) > r.x1 && Math.min(p.y, q.y) < r.y2 && Math.max(p.y, q.y) > r.y1
}

/** The rectangles (by index) a path runs through or touches; with `touch` false, only through. */
export function crossed(path: Point[], rects: Rect[], touch = true): number[] {
  return rects.flatMap((r, i) => (path.some((p, k) => k > 0 && hitsRect(path[k - 1], p, r, touch)) ? [i] : []))
}

type Axis = 'x' | 'y'
/** A side of a rectangle: its normal axis, where it lies on that axis, which way is out, and where a line may attach along it. */
type Side = { axis: Axis; at: number; dir: 1 | -1; lo: number; hi: number; mid: number }
const at = (axis: Axis, n: number, t: number): Point => (axis === 'x' ? { x: n, y: t } : { x: t, y: n })

function sides(r: Rect): Side[] {
  const along = (lo: number, hi: number) => (hi - lo >= 2 * MARGIN ? { lo: lo + MARGIN, hi: hi - MARGIN } : { lo: (lo + hi) / 2, hi: (lo + hi) / 2 })
  const ys = { ...along(r.y1, r.y2), mid: Math.round((r.y1 + r.y2) / 2) }
  const xs = { ...along(r.x1, r.x2), mid: Math.round((r.x1 + r.x2) / 2) }
  return [
    { axis: 'x', at: r.x2, dir: 1, ...ys },
    { axis: 'x', at: r.x1, dir: -1, ...ys },
    { axis: 'y', at: r.y2, dir: 1, ...xs },
    { axis: 'y', at: r.y1, dir: -1, ...xs },
  ]
}

/**
 * Orthogonal route from a to b that goes around the other symbols, ends exactly on the edges of a and b.
 * Tried from the simplest shape: a straight line (slid along the overlap to a free place), the two L's
 * (sideways then up or down, and the other way round), then a Z or U of four points through a free corridor
 * between the symbols. The first shape that crosses nothing and lies along no line already drawn (`taken`, closer
 * than PARALLEL) wins; among equals the shorter one, with its ends near the middle of a side and not too short for the end marks.
 * When every route crosses something, the one crossing the fewest symbols is returned: `crossed` tells.
 */
export function routeAround(a: Rect, b: Rect, obstacles: Rect[], taken: Point[][] = []): Point[] {
  if (!obstacles.length && !taken.length) return routeOrthogonal(a, b)
  const near = obstacles.map((o) => ({ x1: o.x1 - MARGIN, y1: o.y1 - MARGIN, x2: o.x2 + MARGIN, y2: o.y2 + MARGIN }))
  const all = [a, b, ...obstacles]
  const ext = {
    x1: Math.min(...all.map((r) => r.x1)) - 3000,
    x2: Math.max(...all.map((r) => r.x2)) + 3000,
    y1: Math.min(...all.map((r) => r.y1)) - 3000,
    y2: Math.max(...all.map((r) => r.y2)) + 3000,
  }
  const takenSegs = taken.flatMap((t) => t.slice(1).map((p, i) => [t[i], p] as const))
  // Beside a line already drawn, far enough apart for PD to show two lines.
  const beside = (axis: Axis) =>
    takenSegs.flatMap(([s, u]) => (axis === 'y' ? (s.y === u.y ? [s.y - PARALLEL, s.y + PARALLEL] : []) : s.x === u.x ? [s.x - PARALLEL, s.x + PARALLEL] : []))
  // Places worth trying on one axis inside [lo, hi]: the preferred one, just outside every symbol's margin, beside the lines
  // already drawn, and halfway between those.
  const places = (axis: Axis, lo: number, hi: number, prefer: number, limit: number): number[] => {
    if (lo > hi) return []
    const edges = near.flatMap((r) => (axis === 'x' ? [r.x1, r.x2] : [r.y1, r.y2])).filter((v) => v > lo && v < hi)
    const cuts = [lo, ...edges, hi].sort((p, q) => p - q)
    const vals = [Math.min(hi, Math.max(lo, prefer)), (lo + hi) / 2, ...edges, ...beside(axis), ...cuts.slice(1).map((v, i) => (v + cuts[i]) / 2)]
    return [...new Set(vals.map(Math.round))].filter((v) => v >= lo && v <= hi).sort((p, q) => Math.abs(p - prefer) - Math.abs(q - prefer)).slice(0, limit)
  }
  const overlap = (p: Point, q: Point) =>
    takenSegs.reduce((sum, [s, t]) => {
      if (p.y === q.y && s.y === t.y && Math.abs(p.y - s.y) < PARALLEL) return sum + Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(s.x, t.x)) - Math.max(Math.min(p.x, q.x), Math.min(s.x, t.x)))
      if (p.x === q.x && s.x === t.x && Math.abs(p.x - s.x) < PARALLEL) return sum + Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(s.y, t.y)) - Math.max(Math.min(p.y, q.y), Math.min(s.y, t.y)))
      return sum
    }, 0)
  type Scored = { path: Point[]; key: number[] }
  const pick: { best: Scored | null } = { best: null }
  const better = (k: number[], than: number[]) => {
    const i = k.findIndex((v, j) => v !== than[j])
    return i >= 0 && k[i] < than[i]
  }
  const consider = (path: Point[], offCentre: number) => {
    for (let i = 1; i < path.length; i++) if (path[i].x === path[i - 1].x && path[i].y === path[i - 1].y) return
    const hard = crossed(path, obstacles).length + crossed(path, [a, b], false).length * 1000
    const soft = crossed(path, near).length
    const segs = path.slice(1).map((p, i) => [path[i], p] as const)
    const len = segs.reduce((s, [p, q]) => s + Math.abs(p.x - q.x) + Math.abs(p.y - q.y), 0)
    const ends = segs.length ? [segs[0], segs[segs.length - 1]].filter(([p, q]) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < MIN_END).length : 0
    const along = segs.reduce((s, [p, q]) => s + overlap(p, q), 0)
    const cost = len + ends * 4000 + offCentre * 0.5 + along * 3
    // Lying along another line reads as one line in PD: worse than a bend more, not as bad as crossing a table.
    const key = [hard, soft, along > 0 ? 1 : 0, path.length, cost]
    if (!pick.best || better(key, pick.best.key)) pick.best = { path, key }
  }
  const done = () => pick.best !== null && pick.best.key[0] === 0 && pick.best.key[1] === 0
  const ca = center(a)
  const cb = center(b)
  const pairs = sides(a).flatMap((sa) => sides(b).map((sb) => [sa, sb] as const))
  // Straight lines and L's first; Z's and U's only when those cannot avoid every symbol.
  for (const [sa, sb] of pairs) {
    if (sa.axis === sb.axis) {
      if (sb.dir !== -sa.dir || (sb.at - sa.at) * sa.dir <= 0) continue
      for (const t of places(sa.axis === 'x' ? 'y' : 'x', Math.max(sa.lo, sb.lo), Math.min(sa.hi, sb.hi), Math.round((Math.max(sa.lo, sb.lo) + Math.min(sa.hi, sb.hi)) / 2), 12))
        consider([at(sa.axis, sa.at, t), at(sa.axis, sb.at, t)], 0)
    } else {
      const ta = sa.axis === 'x' ? 'y' : 'x'
      for (const t1 of places(ta, sa.lo, sa.hi, sa.mid, 6))
        for (const t2 of places(sb.axis === 'x' ? 'y' : 'x', sb.lo, sb.hi, sb.mid, 6)) {
          // Out of a along its normal to t2, then along b's normal into b.
          if ((t2 - sa.at) * sa.dir <= 0 || (t1 - sb.at) * sb.dir <= 0) continue
          consider([at(sa.axis, sa.at, t1), at(sa.axis, t2, t1), at(sb.axis, sb.at, t2)], Math.abs(t1 - sa.mid) + Math.abs(t2 - sb.mid))
        }
    }
  }
  if (done()) return pick.best!.path
  for (const [sa, sb] of pairs) {
    if (sa.axis !== sb.axis) continue
    const axis = sa.axis
    const other: Axis = axis === 'x' ? 'y' : 'x'
    // The corridor c lies outside both sides: (c - side) * dir > 0 for each.
    let lo = axis === 'x' ? ext.x1 : ext.y1
    let hi = axis === 'x' ? ext.x2 : ext.y2
    for (const s of [sa, sb]) {
      if (s.dir > 0) lo = Math.max(lo, s.at + 1)
      else hi = Math.min(hi, s.at - 1)
    }
    const prefer = sa.dir !== sb.dir ? (sa.at + sb.at) / 2 : sa.dir > 0 ? Math.max(sa.at, sb.at) + 1500 : Math.min(sa.at, sb.at) - 1500
    const corridors = places(axis, lo, hi, Math.round(prefer), 24)
    const tas = places(other, sa.lo, sa.hi, axis === 'x' ? ca.y : ca.x, 6)
    const tbs = places(other, sb.lo, sb.hi, axis === 'x' ? cb.y : cb.x, 6)
    for (const c of corridors)
      for (const t1 of tas)
        for (const t2 of tbs) {
          if (t1 === t2) continue
          consider([at(axis, sa.at, t1), at(axis, c, t1), at(axis, c, t2), at(axis, sb.at, t2)], Math.abs(t1 - sa.mid) + Math.abs(t2 - sb.mid))
        }
  }
  return pick.best?.path ?? routeOrthogonal(a, b)
}

export function exportPowerDesigner(model: Model, opts: { guid?: () => string; now?: number; user?: string } = {}): ExportResult {
  const guid = opts.guid ?? randomGuid
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const user = esc(opts.user ?? 'Quaera Model')
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

  // Diagram: our y grows downwards, PD's upwards. PD lays its print pages out around (0, 0), and its
  // own files are centred there: a diagram starting at (0, 0) would straddle the page delimiters.
  // The canvas spacing is pulled together first (compactLayout), so the diagram is as dense as one drawn in PD.
  const placed = compactLayout([
    ...model.entities.map((e) => ({ x: Math.round(e.position.x * UNITS), y: Math.round(e.position.y * UNITS), ...entitySize(e) })),
    ...model.inheritances.map((i) => ({ x: Math.round(i.position.x * UNITS), y: Math.round(i.position.y * UNITS), w: 1600, h: 1000 })),
  ])
  const toRect = (b: Box): Rect => ({ x1: b.x, y1: -b.y - b.h, x2: b.x + b.w, y2: -b.y })
  const rects = new Map<string, Rect>(model.entities.map((e, i) => [e.id, toRect(placed[i])]))
  const inhRects = new Map<string, Rect>(model.inheritances.map((inh, i) => [inh.id, toRect(placed[model.entities.length + i])]))
  const all = [...rects.values(), ...inhRects.values()].flatMap((r) => [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }])
  const mid = all.length ? center(boundsOf(all)) : { x: 0, y: 0 }
  for (const r of [...rects.values(), ...inhRects.values()]) {
    r.x1 -= mid.x
    r.x2 -= mid.x
    r.y1 -= mid.y
    r.y2 -= mid.y
  }
  // Lines first, boxes after: PD paints symbols in file order, and a table drawn over
  // its lines hides the part of the crow's foot that PD lets run under the edge.
  const symbols: string[] = []
  const shapes: string[] = []
  for (const e of model.entities) {
    shapes.push(
      `<o:EntitySymbol Id="${entitySymIds.get(e.id)}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:IconMode>-1</a:IconMode>\n<a:Rect>${rectText(rects.get(e.id)!)}</a:Rect>\n<a:LineColor>11184640</a:LineColor>\n<a:FillColor>16777136</a:FillColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n${fontList(FONTS.entity)}<a:BrushStyle>6</a:BrushStyle>\n<a:GradientFillMode>65</a:GradientFillMode>\n<a:GradientEndColor>16777215</a:GradientEndColor>\n<c:Object>\n<o:Entity Ref="${entityIds.get(e.id)}"/>\n</c:Object>\n</o:EntitySymbol>`,
    )
  }
  // Every symbol's rectangle, so each line can go around the ones it does not join.
  const boxes = [...[...rects].map(([k, r]) => ({ k, r, name: model.entities.find((e) => e.id === k)!.name })), ...[...inhRects].map(([k, r]) => ({ k, r, name: 'an inheritance symbol' }))]
  const taken: Point[][] = []
  const route = (ka: string, kb: string, label: string) => {
    const others = boxes.filter((x) => x.k !== ka && x.k !== kb)
    const ra = rects.get(ka) ?? inhRects.get(ka)!
    const rb = rects.get(kb) ?? inhRects.get(kb)!
    const path = routeAround(ra, rb, others.map((x) => x.r), taken)
    const through = crossed(path, others.map((x) => x.r)).map((i) => others[i].name)
    if (through.length) warnings.push(`${label}: no free way around, so its line crosses ${through.join(', ')} in the PowerDesigner diagram. Move the tables apart, or route the line by hand in PowerDesigner.`)
    taken.push(path)
    return path
  }
  const entityName = (id: string) => model.entities.find((e) => e.id === id)?.name ?? id
  // Reflexive: a loop out of the right side and back over the top. Drawn first, so the other lines keep off it.
  const loop = (ra: Rect): Point[] => {
    const out = { x: ra.x2, y: center(ra).y }
    return [out, { x: ra.x2 + 2000, y: out.y }, { x: ra.x2 + 2000, y: ra.y2 + 2000 }, { x: center(ra).x, y: ra.y2 + 2000 }, { x: center(ra).x, y: ra.y2 }]
  }
  for (const r of model.relationships) if (r.entityA === r.entityB) taken.push(loop(rects.get(r.entityA)!))
  for (const r of model.relationships) {
    const ra = rects.get(r.entityA)!
    let path: Point[]
    if (r.entityA === r.entityB) path = loop(ra)
    else path = route(r.entityA, r.entityB, `Relationship ${r.name || ''} ${entityName(r.entityA)} – ${entityName(r.entityB)}`.replace(/\s+/g, ' '))
    symbols.push(
      `<o:RelationshipSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(path))}</a:Rect>\n<a:ListOfPoints>${points(path)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>${arrowStyle(r)}</a:ArrowStyle>\n<a:LineColor>11184640</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n${fontList(FONTS.relationship)}<c:SourceSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(r.entityA)}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(r.entityB)}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:Relationship Ref="${relIds.get(r.id)}"/>\n</c:Object>\n</o:RelationshipSymbol>`,
    )
  }
  for (const inh of model.inheritances) {
    const sym = inhRects.get(inh.id)!
    const symId = inhSymIds.get(inh.id)!
    shapes.push(
      `<o:InheritanceSymbol Id="${symId}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:IconMode>-1</a:IconMode>\n<a:Rect>${rectText(sym)}</a:Rect>\n<a:LineColor>16744576</a:LineColor>\n<a:FillColor>16777136</a:FillColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n${fontList(FONTS.inheritance)}<a:BrushStyle>6</a:BrushStyle>\n<a:GradientFillMode>65</a:GradientFillMode>\n<a:GradientEndColor>16777215</a:GradientEndColor>\n<a:KeepSize>1</a:KeepSize>\n<c:Object>\n<o:Inheritance Ref="${inhIds.get(inh.id)}"/>\n</c:Object>\n</o:InheritanceSymbol>`,
    )
    const up = route(inh.id, inh.parentId, `Inheritance of ${entityName(inh.parentId)}`)
    symbols.push(
      `<o:InheritanceRootLinkSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(up))}</a:Rect>\n<a:ListOfPoints>${points(up)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>1</a:ArrowStyle>\n<a:LineColor>16744576</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n${fontList(FONTS.rootLink)}<c:SourceSymbol>\n<o:InheritanceSymbol Ref="${symId}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(inh.parentId)}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:Inheritance Ref="${inhIds.get(inh.id)}"/>\n</c:Object>\n</o:InheritanceRootLinkSymbol>`,
    )
    for (const c of inh.childIds) {
      const down = route(c, inh.id, `Inheritance link ${entityName(c)} – ${entityName(inh.parentId)}`)
      symbols.push(
        `<o:InheritanceLinkSymbol Id="${id()}">\n<a:CreationDate>${now}</a:CreationDate>\n<a:ModificationDate>${now}</a:ModificationDate>\n<a:Rect>${rectText(boundsOf(down))}</a:Rect>\n<a:ListOfPoints>${points(down)}</a:ListOfPoints>\n<a:CornerStyle>1</a:CornerStyle>\n<a:ArrowStyle>0</a:ArrowStyle>\n<a:LineColor>16744576</a:LineColor>\n<a:ShadowColor>12632256</a:ShadowColor>\n${fontList(FONTS.link)}<c:SourceSymbol>\n<o:EntitySymbol Ref="${entitySymIds.get(c)}"/>\n</c:SourceSymbol>\n<c:DestinationSymbol>\n<o:InheritanceSymbol Ref="${symId}"/>\n</c:DestinationSymbol>\n<c:Object>\n<o:InheritanceLink Ref="${linkIds.get(`${inh.id}:${c}`)}"/>\n</c:Object>\n</o:InheritanceLinkSymbol>`,
      )
    }
  }
  symbols.push(...shapes)

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
    const relComment = [r.comment, roles && `Quaera Model roles (FK prefixes): ${roles}`].filter(Boolean).join('\n')
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
    `<c:ConceptualDiagrams>\n<o:ConceptualDiagram Id="${diagramId}">\n${named('Diagram_1', 'DIAGRAM_1')}<a:DisplayPreferences>${PD_DISPLAY_PREFERENCES}</a:DisplayPreferences>\n<a:PaperSize>(8268, 11693)</a:PaperSize>\n<a:PageMargins>((315,354), (433,354))</a:PageMargins>\n<a:PageOrientation>1</a:PageOrientation>\n<a:PaperSource>261</a:PaperSource>\n` +
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
