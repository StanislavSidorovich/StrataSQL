import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import { isStepDone, nextPathStep, recordScore, recordWalk, stepsDone, type Progress } from '../src/data/trainer'

const ids = CASES.map((c) => c.id)

describe('learning path (picker progress)', () => {
  it('starts with watching the first case built', () => {
    expect(nextPathStep({}, ids)).toEqual({ caseId: 'library', step: 'walk' })
  })

  it('moves on after the walkthrough and a level reaching the bar', () => {
    let p: Progress = recordWalk({}, 'library')
    expect(nextPathStep(p, ids)).toEqual({ caseId: 'library', step: 1 })
    p = recordScore(p, 'library', 1, 70)
    expect(isStepDone(p, 'library', 1)).toBe(false)
    p = recordScore(p, 'library', 1, 85)
    expect(nextPathStep(p, ids)).toEqual({ caseId: 'library', step: 2 })
    p = recordScore(recordScore(p, 'library', 2, 100), 'library', 3, 100)
    expect(stepsDone(p, 'library')).toBe(4)
    expect(nextPathStep(p, ids)).toEqual({ caseId: ids[1], step: 'walk' })
  })

  it('level 0 is optional and a skipped walkthrough is still recommended', () => {
    const p = recordScore(recordScore({}, 'library', 0, 100), 'library', 3, 100)
    expect(stepsDone(p, 'library')).toBe(1)
    expect(nextPathStep(p, ids)).toEqual({ caseId: 'library', step: 'walk' })
  })

  it('is null when everything is done', () => {
    let p: Progress = {}
    for (const id of ids) {
      p = recordWalk(p, id)
      for (const l of [1, 2, 3] as const) p = recordScore(p, id, l, 100)
    }
    expect(nextPathStep(p, ids)).toBeNull()
  })
})
