// Lessons (Learn): quiz data is well formed, the practice text points at real reference elements,
// the practice starts unsolved, “do it for me” solves it, and the strict check catches a wrong key.

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { compareModels } from '../src/core/compare'
import { lintModel } from '../src/core/lint'
import type { Model } from '../src/core/metamodel'
import { findEntityByName, setAttributeInPrimary } from '../src/core/ops'
import { integrityProblems } from '../src/core/serialize'
import { caseById, CASES, splitParagraph, TAGS } from '../src/data/cases'
import { applyAnswer, coach } from '../src/data/coach'
import { HELP_CARDS } from '../src/data/help'
import { lessonById, LESSONS } from '../src/data/lessons'
import { DONE_AT, levelStartModel } from '../src/data/trainer'

describe.each(LESSONS.map((l) => [l.id, l] as const))('%s', (_, l) => {
  const c = l.practice
  const ref = c.build()

  it('has a guess and two checks, each option with its reason', () => {
    for (const q of [l.guess, ...l.checks]) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.right).toBeGreaterThanOrEqual(0)
      expect(q.right).toBeLessThan(q.options.length)
      for (const o of q.options) expect(o.why.length).toBeGreaterThan(20)
    }
    expect(l.checks).toHaveLength(2)
    expect(l.gist.length).toBeLessThanOrEqual(5)
  })

  it('links to existing help cards', () => {
    for (const id of l.help) expect(HELP_CARDS.some((h) => h.id === id), id).toBe(true)
  })

  it('is found as a case but not listed in the picker', () => {
    expect(caseById(l.id)).toBe(c)
    expect(CASES.some((x) => x.id === l.id)).toBe(false)
  })

  it('finds every phrase of the practice text and points at reference elements', () => {
    for (let p = 0; p < c.spec.length; p++) expect(splitParagraph(c, p).map((x) => x.text).join('')).toBe(c.spec[p])
    const tags = new Set(TAGS.map((t) => t.id))
    const exists = (key: string) => {
      const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
      if (kind === 'entity' || kind === 'identifier') return !!findEntityByName(ref, rest)
      if (kind === 'relationship') return ref.relationships.some((r) => r.name === rest)
      if (kind === 'inheritance') return ref.inheritances.some((i) => i.name === rest)
      if (kind === 'attribute') {
        const [e, a] = rest.split('.')
        return !!findEntityByName(ref, e)?.attributes.some((x) => x.name === a)
      }
      return false
    }
    for (const s of c.spans) {
      expect(tags.has(s.tag)).toBe(true)
      if (s.target) expect(exists(s.target), s.target).toBe(true)
    }
    for (const key of Object.keys(c.hints)) expect(exists(key), key).toBe(true)
  })

  it('reference and example are valid models', () => {
    for (const m of [ref, l.example()]) {
      expect(integrityProblems(m)).toEqual([])
      expect(lintModel(m).filter((i) => i.severity === 'error')).toEqual([])
      expect(generatePdm(m).tables.length).toBeGreaterThan(0)
    }
    expect(compareModels(ref, ref, { synonyms: c.synonyms, strict: true }).score).toBe(100)
  })

  it('starts unsolved, and “do it for me” solves it to 100 %', () => {
    let m: Model = levelStartModel(c, 3)
    expect(compareModels(m, ref, { synonyms: c.synonyms, strict: true }).score).toBeLessThan(DONE_AT)
    for (let k = 0; k < 50; k++) {
      const { next } = coach(c, m, 3)
      if (!next) break
      let ok = false
      m = produce(m, (d) => {
        ok = applyAnswer(d, c, next.item)
      })
      expect(ok, next.key).toBe(true)
    }
    expect(coach(c, m, 3).next).toBeNull()
    expect(compareModels(m, ref, { synonyms: c.synonyms, strict: true }).score).toBe(100)
  })
})

describe('strict check (lessons)', () => {
  const c = lessonById('lesson-identifiers')!.practice
  const ref = c.build()
  // The student made the email the primary identifier instead of the employee number.
  const wrong = produce(ref, (d) => {
    const emp = findEntityByName(d, 'Employee')!
    const attr = (name: string) => emp.attributes.find((a) => a.name === name)!.id
    setAttributeInPrimary(d, emp.id, attr('employee_no'), false)
    setAttributeInPrimary(d, emp.id, attr('email'), true)
  })

  it('reports a primary identifier over other attributes', () => {
    const r = compareModels(wrong, ref, { strict: true })
    const item = r.items.find((i) => i.kind === 'identifier')
    expect(item?.status).toBe('different')
    expect(item?.message).toMatch(/Employee: the primary identifier is email/)
    expect(r.score).toBeLessThan(100)
  })

  it('keeps the trainer cases lenient: any own identifier counts', () => {
    expect(compareModels(wrong, ref).items.some((i) => i.kind === 'identifier')).toBe(false)
  })

  it('counts a missing alternate identifier in a lesson only', () => {
    const start = levelStartModel(c, 3)
    const fixed = produce(start, (d) => {
      for (const [e, a] of [['Employee', 'employee_no'], ['Department', 'code']]) {
        const x = findEntityByName(d, e)!
        setAttributeInPrimary(d, x.id, x.attributes.find((y) => y.name === a)!.id, true)
      }
    })
    expect(compareModels(fixed, ref).score).toBe(100)
    expect(compareModels(fixed, ref, { strict: true }).score).toBe(50)
  })
})
