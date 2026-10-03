// “Build it with me” (stage 5c): the next hint follows the walkthrough order, and pressing
// “do it for me” on every hint builds each case from an empty model to 100 %.

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { compareModels } from '../src/core/compare'
import { generatePdm } from '../src/core/cdm2pdm'
import { lintModel } from '../src/core/lint'
import type { Model } from '../src/core/metamodel'
import { addEntity, addRelationship, removeRelationship, setDependentSide } from '../src/core/ops'
import { integrityProblems } from '../src/core/serialize'
import { caseById, CASES } from '../src/data/cases'
import { applyAnswer, coach } from '../src/data/coach'
import { levelStartModel, type Level } from '../src/data/trainer'
import { walkthroughSteps } from '../src/data/walkthrough'

function solve(c: (typeof CASES)[number], level: Level, start: Model = levelStartModel(c, level)) {
  let m = start
  const seen: string[] = []
  for (let k = 0; k < 200; k++) {
    const { next } = coach(c, m, level)
    if (!next) return { model: m, seen }
    seen.push(next.key)
    let ok = false
    m = produce(m, (d) => {
      ok = applyAnswer(d, c, next.item)
    })
    expect(ok, next.key).toBe(true)
    expect(integrityProblems(m), next.key).toEqual([])
    // The same item twice in a row would mean “do it for me” did not fix it.
    expect(seen.at(-2), next.key).not.toBe(next.key)
  }
  throw new Error('coach did not finish')
}

describe.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
  const ref = c.build()

  it('level 3: do-it-for-me on every hint reaches 100 % from an empty model', () => {
    const { model, seen } = solve(c, 3)
    expect(compareModels(model, ref, { synonyms: c.synonyms }).score).toBe(100)
    expect(seen.length).toBeGreaterThan(ref.entities.length)
    expect(() => generatePdm(model)).not.toThrow()
    // The physical keys came along too: same tables, same keys as the reference.
    const keys = (m: Model) => generatePdm(m).tables.flatMap((t) => t.alternateKeys.map((k) => `${t.name}:${k.columns.join(',')}`)).sort()
    expect(keys(model)).toEqual(keys(ref))
    expect(lintModel(model).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('level 2: only links are coached', () => {
    const { model, seen } = solve(c, 2)
    expect(seen.every((k) => k.startsWith('relationship|') || k.startsWith('inheritance|') || k.startsWith('keys|'))).toBe(true)
    expect(compareModels(model, ref, { synonyms: c.synonyms, scope: 'links' }).score).toBe(100)
  })

  it('follows the walkthrough: the first hint is about the first entity it introduces', () => {
    const first = walkthroughSteps(c).find((s) => s.kind === 'entity')!
    const { next } = coach(c, levelStartModel(c, 3), 3)
    expect(next!.key).toBe(`entity|${first.key}`)
    // The first rung does not give the name away; the last one is the answer.
    expect(next!.rungs[0].text).not.toContain(first.key.slice('entity:'.length))
    expect(next!.rungs.at(-1)!.label).toBe('Answer')
  })

  it('the reference itself needs no hint', () => {
    expect(coach(c, ref, 3).next).toBeNull()
  })
})

describe('coaching details', () => {
  const lib = caseById('library')!

  it('Library: attributes before the identifier, both before the relationship (fine steps)', () => {
    // Starting from entities with no attributes: the attributes come before the identifier.
    const bare = produce(levelStartModel(lib, 3), (d) => {
      for (const n of ['Publisher', 'Book']) addEntity(d, { name: n })
    })
    const { seen } = solve(lib, 3, bare)
    const at = (k: string) => seen.indexOf(k)
    expect(at('attribute|entity:Publisher')).toBeGreaterThanOrEqual(0)
    expect(at('attribute|entity:Publisher')).toBeLessThan(at('identifier|entity:Publisher'))
    expect(at('identifier|entity:Book')).toBeLessThan(at('relationship|relationship:publishes'))
    expect(at('relationship|relationship:publishes')).toBeLessThan(at('entity|entity:Author'))
  })

  it('points at the phrases of the text and explains why', () => {
    const { next } = coach(lib, levelStartModel(lib, 3), 3)
    expect(next!.spans.length).toBeGreaterThan(0)
    expect(next!.rungs.map((r) => r.label)).toEqual(['What', 'Where', 'Why', 'Answer'])
  })

  it('fixes a relationship that is drawn the wrong way round and not dependent', () => {
    const tv = caseById('tv-shows')!
    const ref = tv.build()
    const scene = ref.relationships.find((r) => r.dependentSide)!
    const wrong = produce(ref, (d) => {
      removeRelationship(d, scene.id)
      // Reversed sides, plain one-to-many.
      addRelationship(d, scene.entityB, scene.entityA)
    })
    const { next } = coach(tv, wrong, 3)
    expect(next!.item.status).toBe('different')
    const fixed = produce(wrong, (d) => {
      applyAnswer(d, tv, next!.item)
    })
    expect(compareModels(fixed, ref, { synonyms: tv.synonyms }).score).toBe(100)
  })

  it('an extra entity is left alone (inventing is allowed)', () => {
    const extra = produce(lib.build(), (d) => {
      addEntity(d, { name: 'Shelf' })
    })
    expect(coach(lib, extra, 3).next).toBeNull()
  })

  it('a wrong dependency is reported before later links', () => {
    const tv = caseById('tv-shows')!
    const ref = tv.build()
    const plain = ref.relationships.find((r) => !r.dependentSide && r.cardinalityA.max === 1)!
    const wrong = produce(ref, (d) => {
      setDependentSide(d, plain.id, 'B')
    })
    expect(coach(tv, wrong, 3).next!.item.refKey).toBe(`relationship:${plain.name}`)
  })
})
