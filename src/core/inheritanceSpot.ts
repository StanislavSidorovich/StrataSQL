// Where an inheritance symbol goes when its parent or a child moves on the canvas:
// just outside the parent, on the way from the parent to its children.

import type { Point } from './metamodel'

export interface SpotBox {
  x: number
  y: number
  w: number
  h: number
}

/** The canvas size of the half-circle symbol (`.inheritance-node`). */
export const SYMBOL_SIZE = { w: 40, h: 24 }
/** Clear space between the parent's edge and the symbol. */
const GAP = 50

const centre = (b: SpotBox): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
/** How far from a box's centre its border is, along the unit direction (ux, uy). */
const reach = (hw: number, hh: number, ux: number, uy: number) => Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity)

/**
 * Top-left corner for the symbol: on the line from the parent's centre to the middle of its children,
 * GAP beyond the parent's border (less when the children are close, never inside the parent).
 */
export function inheritanceSpot(parent: SpotBox, children: SpotBox[]): Point {
  const pc = centre(parent)
  const kids = children.map(centre)
  const cc = kids.length ? { x: kids.reduce((s, k) => s + k.x, 0) / kids.length, y: kids.reduce((s, k) => s + k.y, 0) / kids.length } : { x: pc.x, y: pc.y + 1 }
  let dx = cc.x - pc.x
  let dy = cc.y - pc.y
  const len = Math.hypot(dx, dy)
  if (len < 1) [dx, dy] = [0, 1]
  const ux = len < 1 ? 0 : dx / len
  const uy = len < 1 ? 1 : dy / len
  const out = reach(parent.w / 2, parent.h / 2, ux, uy) + reach(SYMBOL_SIZE.w / 2, SYMBOL_SIZE.h / 2, ux, uy)
  const dist = Math.max(out, Math.min(out + GAP, 0.6 * len))
  return { x: Math.round(pc.x + ux * dist - SYMBOL_SIZE.w / 2), y: Math.round(pc.y + uy * dist - SYMBOL_SIZE.h / 2) }
}
