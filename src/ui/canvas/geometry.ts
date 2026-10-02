// Floating-edge geometry: edges run centre-to-centre and are clipped at the node borders,
// so they don't depend on fixed handle positions.

export interface Vec {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const len = (a: Vec): number => Math.hypot(a.x, a.y)
export const unit = (a: Vec): Vec => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l }
}
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x })

export function center(r: Rect): Vec {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Point where the ray from `from` (inside the rect) towards `to` leaves the rect. */
export function rectExit(r: Rect, from: Vec, to: Vec): Vec {
  const d = sub(to, from)
  const hw = r.width / 2
  const hh = r.height / 2
  const c = center(r)
  // Parametric distance to each side, measured from the rect centre shifted by `from`.
  const tx = d.x !== 0 ? (d.x > 0 ? c.x + hw - from.x : c.x - hw - from.x) / d.x : Infinity
  const ty = d.y !== 0 ? (d.y > 0 ? c.y + hh - from.y : c.y - hh - from.y) / d.y : Infinity
  const t = Math.min(tx, ty)
  return Number.isFinite(t) ? add(from, scale(d, t)) : from
}

/**
 * End points of a straight edge between two rects. `offset` shifts the line sideways, so several
 * relationships between the same pair of entities are drawn as parallel lines.
 */
export function edgeEnds(a: Rect, b: Rect, offset = 0): { from: Vec; to: Vec } {
  const ca = center(a)
  const cb = center(b)
  const n = scale(perp(unit(sub(cb, ca))), offset)
  const sa = add(ca, n)
  const sb = add(cb, n)
  return { from: rectExit(a, sa, sb), to: rectExit(b, sb, sa) }
}
