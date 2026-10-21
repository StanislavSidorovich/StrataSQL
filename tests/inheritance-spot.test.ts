import { describe, expect, it } from 'vitest'
import { inheritanceSpot, SYMBOL_SIZE, type SpotBox } from '../src/core/inheritanceSpot'

const parent: SpotBox = { x: 0, y: 0, w: 200, h: 100 }
const box = (x: number, y: number): SpotBox => ({ x, y, w: 200, h: 100 })
const inside = (p: { x: number; y: number }, b: SpotBox) => p.x + SYMBOL_SIZE.w > b.x && p.x < b.x + b.w && p.y + SYMBOL_SIZE.h > b.y && p.y < b.y + b.h

describe('inheritance symbol placement', () => {
  it('goes to the side of the parent where its children are', () => {
    const below = inheritanceSpot(parent, [box(-300, 400), box(300, 400)])
    expect(below.y).toBeGreaterThanOrEqual(100)
    expect(below.x + SYMBOL_SIZE.w / 2).toBe(100) // centred under the parent: the children's middle is straight below

    const left = inheritanceSpot(parent, [box(-800, 0)])
    expect(left.x + SYMBOL_SIZE.w).toBeLessThanOrEqual(0)

    const right = inheritanceSpot(parent, [box(800, 0)])
    expect(right.x).toBeGreaterThanOrEqual(200)
  })

  it('follows when the parent moves past its children', () => {
    const kids = [box(0, 400), box(300, 400)]
    const before = inheritanceSpot(box(500, 0), kids)
    const after = inheritanceSpot(box(-500, 0), kids)
    expect(before.x).toBeLessThan(500 + 100) // leans left, towards the children
    expect(after.x).toBeGreaterThan(-500 + 100) // now leans right
  })

  it('is never inside the parent, even with a child right next to it', () => {
    for (const kid of [box(210, 0), box(0, 105), box(-205, -100), box(0, 0)]) expect(inside(inheritanceSpot(parent, [kid]), parent)).toBe(false)
  })
})
