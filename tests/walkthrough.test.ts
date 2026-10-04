// Walkthrough (stage 5b): the steps of every case replay to exactly the reference model, every
// intermediate model is consistent, and every phrase of the text is explained by some step.

import { describe, expect, it } from 'vitest'
import { foreignKeyHolder, generatePdm, relationshipKind } from '../src/core/cdm2pdm'
import { integrityProblems } from '../src/core/serialize'
import { CASES } from '../src/data/cases'
import { repeats, walkthroughSteps } from '../src/data/walkthrough'

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

  it('does not repeat a phrase’s why in the step text', () => {
    for (const s of steps) {
      const whys = s.spans.filter((i) => !s.quiet?.includes(i)).map((i) => c.spans[i].why)
      for (const t of s.text) if (!/^(Relationship `|Attributes:|Each fact|`)/.test(t) && t !== c.walk.notes?.[s.key]) expect(repeats(t, whys), `${s.key}: ${t}`).toBe(false)
      for (const i of s.quiet ?? []) expect(s.spans).toContain(i)
    }
  })

  it('introduces each relationship after both of its entities', () => {
    for (const s of steps.filter((x) => x.kind === 'relationship')) {
      const r = s.model.relationships.find((x) => x.id === s.focus[0].id)!
      expect(s.model.entities.some((e) => e.id === r.entityA) && s.model.entities.some((e) => e.id === r.entityB)).toBe(true)
    }
  })

  it('asks predictions that can be answered, before some steps', () => {
    const asked = steps.filter((s) => s.question)
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.length).toBeLessThan(steps.length)
    for (const s of asked) {
      const q = s.question!
      expect(q.options.length, s.key).toBeGreaterThanOrEqual(2)
      expect(new Set(q.options).size, s.key).toBe(q.options.length)
      expect(q.right.length, s.key).toBeGreaterThan(0)
      expect(q.right.length, s.key).toBeLessThan(q.options.length)
      for (const k of q.right) expect(q.options[k], s.key).toBeDefined()
      if (q.span !== undefined) expect(c.spans[q.span]).toBeDefined()
      expect(q.why).not.toBe('')
      // The question is about what is already on the canvas before the step.
      const before = steps[steps.indexOf(s) - 1].model
      for (const id of q.focus) expect(before.entities.some((e) => e.id === id), s.key).toBe(true)
    }
  })

  it('asks where the foreign key goes and accepts the side the PDM uses', () => {
    const pdm = generatePdm(ref)
    for (const s of steps.filter((x) => x.kind === 'relationship' && x.question)) {
      const r = ref.relationships.find((x) => x.id === s.focus[0].id)!
      const q = s.question!
      if (relationshipKind(r) === 'many-to-many') {
        expect(q.right, s.key).toEqual([2])
        continue
      }
      const holder = foreignKeyHolder(r) === 'A' ? r.entityA : r.entityB
      const table = pdm.tables.find((t) => t.source.kind === 'entity' && t.source.id === holder)!
      expect(q.right.map((k) => q.options[k]), s.key).toContain(table.name)
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

  it('asks the first question at once, not after a row of Next clicks', () => {
    expect(steps.findIndex((s) => s.question)).toBe(1)
    const fk = steps.find((s) => s.key === 'relationship:publishes')!.question!
    expect(fk.options).toEqual(['BOOK', 'PUBLISHER', 'A new join table'])
    expect(fk.right).toEqual([0])
    // isbn is unique too: both identifiers count.
    const id = steps.find((s) => s.key === 'identifier:Book')!.question!
    expect(id.right.map((k) => id.options[k])).toEqual(['`book_id`', '`isbn`'])
    // “Is *publishers* an entity?” is not asked again after the first entity.
    expect(steps.find((s) => s.key === 'entity:Publisher')!.question).toBeUndefined()
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

describe('repeats', () => {
  it('finds a paragraph that says what a phrase box already says', () => {
    expect(repeats('Primary identifier <pi>: `card_no`.', ['The text names the identifier: `card_no` → primary identifier <pi>.'])).toBe(true)
    expect(repeats('Alternate identifier <ai>: `isbn` — also unique, so the table gets a UNIQUE key.', ['A uniqueness rule → `isbn` becomes an alternate identifier <ai>, i.e. UNIQUE in the table.'])).toBe(true)
  })
  it('keeps a paragraph that adds something', () => {
    expect(repeats('The **primary identifier** tells one instance from all others; it becomes the PRIMARY KEY of the table.', ['One value per book → attribute.'])).toBe(false)
    expect(repeats('anything', [])).toBe(false)
  })
})
