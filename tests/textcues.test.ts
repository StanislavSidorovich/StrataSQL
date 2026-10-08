import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import type { Mark } from '../src/data/mytask'
import { compareTagging, findCues, type Cue } from '../src/data/textcues'
import { scoreCues } from './textcues-score'

const tags = (cues: Cue[]) => cues.map((c) => `${c.tag}:${c.text}`)

describe('text cues', () => {
  it('finds entities, attributes and identifiers in the usual phrases', () => {
    const t = tags(findCues(['Each book has an ISBN, a title and a publication year. No two books share an ISBN.', 'Members are identified by their card number. We also keep each member’s name and email.']))
    expect(t).toEqual(expect.arrayContaining(['entity:book', 'identifier:ISBN', 'attribute:title', 'attribute:publication year', 'rule:No two books share', 'entity:Members', 'identifier:card number', 'attribute:name', 'attribute:email']))
  })

  it('finds relationships with their cardinality words', () => {
    const cues = findCues(['Every book is published by one publisher, and a publisher can publish many books.'])
    const rels = cues.filter((c) => c.tag === 'relationship')
    expect(rels.map((c) => c.text)).toEqual(['is published by one', 'can publish many'])
    expect(rels[0].cards?.map((k) => k.word)).toEqual(['one'])
    expect(rels[1].cards?.map((k) => k.word)).toEqual(['many', 'can'])
    expect(rels[1].cards?.[0].means).toMatch(/the n on the books side/)
  })

  it('finds inheritances, rules and derived data', () => {
    const t = tags(findCues(['Scenes can be indoors or outdoors.', 'A staff member is either a doctor or a nurse, never both.', 'The total of an order is not stored: it is computed from its lines.', 'For each loan we record the return date, which stays empty until the book comes back.']))
    expect(t).toEqual(expect.arrayContaining(['inheritance:can be indoors or outdoors', 'inheritance:either a doctor or a nurse', 'rule:never both', 'rule:The total of an order is not stored', 'rule:which stays empty until the book comes back', 'entity:loan', 'attribute:return date']))
  })

  it('cues match their text and never overlap', () => {
    for (const c of CASES) {
      const cues = findCues(c.spec)
      for (const q of cues) expect(c.spec[q.p].slice(q.start, q.end)).toBe(q.text)
      for (let k = 1; k < cues.length; k++) if (cues[k].p === cues[k - 1].p) expect(cues[k].start).toBeGreaterThanOrEqual(cues[k - 1].end)
    }
  })

  it('copes with any text', () => {
    expect(findCues([])).toEqual([])
    expect(() => findCues(['', '???', 'Uma biblioteca guarda livros e leitores.', '1, 2, 3…', 'and and and , , of of'])).not.toThrow()
  })

  // Step 1 of ROADMAP #21: the cues against the hand-tagged phrases of the 8 cases.
  it('agrees with the hand tagging of the 8 cases', () => {
    let hit = 0
    let wrong = 0
    let found = 0
    let gold = 0
    for (const c of CASES) {
      const s = scoreCues(c, findCues(c.spec))
      expect(s.precision, `${c.id} precision`).toBeGreaterThanOrEqual(0.85)
      expect(s.recall, `${c.id} recall`).toBeGreaterThanOrEqual(0.45)
      hit += s.hit
      wrong += s.wrong
      found += s.found
      gold += c.spans.length
    }
    expect(hit / (hit + wrong), 'precision').toBeGreaterThanOrEqual(0.93)
    expect(found / gold, 'recall').toBeGreaterThanOrEqual(0.75)
  })
})

describe('compare my tagging', () => {
  const text = ['Each book has an ISBN and a title. A publisher can publish many books.']
  const cues = findCues(text)
  const mark = (phrase: string, tag: Mark['tag']): Mark => {
    const start = text[0].indexOf(phrase)
    return { p: 0, start, end: start + phrase.length, tag, text: phrase }
  }

  it('asks nothing before the student tags', () => {
    expect(compareTagging([], cues)).toEqual([])
  })

  it('asks about untagged cues, other tags and cardinalities', () => {
    const q = compareTagging([mark('book', 'entity'), mark('title', 'entity'), mark('can publish many', 'relationship')], cues)
    const by = (s: string) => q.find((x) => x.cue.text === s)
    expect(by('ISBN')?.kind).toBe('untagged')
    expect(by('title')).toMatchObject({ kind: 'other-tag' })
    expect(by('title')?.text).toMatch(/You tagged it entity.*An attribute or an entity\?/)
    expect(by('can publish many')).toMatchObject({ kind: 'cardinality' })
    expect(by('can publish many')?.text).toMatch(/the n on the books side/)
    expect(by('book')).toBeUndefined()
  })

  it('counts a tag elsewhere with the same name, and an identifier as an attribute', () => {
    const q = compareTagging([mark('books', 'entity'), mark('ISBN', 'identifier'), mark('title', 'attribute'), mark('publisher', 'entity')], cues)
    expect(q.map((x) => x.cue.text)).toEqual(['can publish many'])
  })
})
