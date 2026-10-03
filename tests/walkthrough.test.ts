// Walkthrough (stage 5b): the steps of every case replay to exactly the reference model, every
// intermediate model is consistent, and every phrase of the text is explained by some step.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { integrityProblems } from '../src/core/serialize'
import { CASES } from '../src/data/cases'
import { walkthroughSteps } from '../src/data/walkthrough'

describe.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
  const ref = c.build()
  const steps = walkthroughSteps(c, ref)

  it('ends with exactly the reference model', () => {
    expect(steps.at(-1)!.model).toEqual(ref)
    expect(steps[0].model.entities).toEqual([])
    expect(steps[0].kind).toBe('intro')
    expect(steps.at(-1)!.kind).toBe('done')
  })

  it('only grows, and every step is a consistent model', () => {
    let prev = -1
    for (const s of steps) {
      expect(integrityProblems(s.model), s.key).toEqual([])
      expect(() => generatePdm(s.model)).not.toThrow()
      const size = s.model.entities.reduce((n, e) => n + 1 + e.attributes.length + e.identifiers.length + (e.physicalKeys?.length ?? 0), 0) + s.model.relationships.length + s.model.inheritances.length
      if (s.kind !== 'rules' && s.kind !== 'done') expect(size, s.key).toBeGreaterThan(prev)
      prev = size
    }
  })

  it('explains every phrase of the text exactly once', () => {
    const used = steps.flatMap((s) => s.spans)
    expect([...used].sort((a, b) => a - b)).toEqual(c.spans.map((_, i) => i))
  })

  it('introduces each relationship after both of its entities', () => {
    for (const s of steps.filter((x) => x.kind === 'relationship')) {
      const r = s.model.relationships.find((x) => x.id === s.focus[0].id)!
      expect(s.model.entities.some((e) => e.id === r.entityA) && s.model.entities.some((e) => e.id === r.entityB)).toBe(true)
    }
  })

  it('has a title, words and an element for every building step', () => {
    for (const s of steps) {
      expect(s.title).not.toBe('')
      expect(s.text.length + s.spans.length, s.key).toBeGreaterThan(0)
      if (!['intro', 'rules', 'done'].includes(s.kind)) expect(s.focus.length, s.key).toBeGreaterThan(0)
    }
  })
})

describe('library (starter case)', () => {
  const c = CASES[0]
  const steps = walkthroughSteps(c)

  it('comes first and builds one thing per step', () => {
    expect(c.id).toBe('library')
    expect(c.walk.fine).toBe(true)
    expect(steps.map((s) => s.key).slice(0, 5)).toEqual(['intro', 'entity:Book', 'attributes:Book', 'identifier:Book', 'entity:Publisher'])
  })

  it('shows the tables each decision produces', () => {
    const book = steps.find((s) => s.key === 'identifier:Book')!
    expect(book.tables).toEqual(['BOOK: book_id <pk>, isbn <ak>, title, pub_year'])
    const publishes = steps.find((s) => s.key === 'relationship:publishes')!
    expect(publishes.tables[0]).toMatch(/^BOOK: .*publisher_id <fk>/)
    const writes = steps.find((s) => s.key === 'relationship:writes')!
    expect(writes.tables).toHaveLength(1)
    expect(writes.tables[0]).toMatch(/author_id <pk,fk\d?>.*book_id <pk,fk\d?>/)
  })

  it('explains each concept once, where it first appears', () => {
    const all = steps.flatMap((s) => s.text)
    expect(all.filter((t) => t.startsWith('An **entity**'))).toHaveLength(1)
    expect(steps.find((s) => s.key === 'entity:Book')!.text.some((t) => t.startsWith('An **entity**'))).toBe(true)
  })

  it('generates the reference PDM: 6 tables, Loan with its own id', () => {
    const pdm = generatePdm(c.build())
    expect(pdm.tables.map((t) => t.name).sort()).toEqual(['AUTHOR', 'BOOK', 'LOAN', 'MEMBER', 'PUBLISHER', 'WRITES'])
    const loan = pdm.tables.find((t) => t.name === 'LOAN')!
    expect(loan.primaryKey?.columns).toEqual(['loan_id'])
    expect(loan.columns.find((x) => x.name === 'return_date')!.nullable).toBe(true)
    expect(loan.foreignKeys.map((f) => f.refTable).sort()).toEqual(['BOOK', 'MEMBER'])
  })
})
