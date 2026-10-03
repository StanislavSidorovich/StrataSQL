// Open exercises: unique ids that do not clash with the trainer cases, a text and a checklist each.

import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import { EXERCISES, exerciseById } from '../src/data/exercises'

describe('open exercises', () => {
  it('have unique ids, distinct from the cases', () => {
    const ids = [...EXERCISES.map((x) => x.id), ...CASES.map((c) => c.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const x of EXERCISES) expect(exerciseById(x.id)).toBe(x)
  })
  it('each has a text, concepts and at least four review questions', () => {
    for (const x of EXERCISES) {
      expect(x.spec.length, x.id).toBeGreaterThanOrEqual(3)
      expect(x.concepts.length, x.id).toBeGreaterThan(0)
      expect(x.checklist.length, x.id).toBeGreaterThanOrEqual(4)
    }
  })
  it('cover every difficulty', () => {
    expect(new Set(EXERCISES.map((x) => x.difficulty))).toEqual(new Set([1, 2, 3]))
  })
})
