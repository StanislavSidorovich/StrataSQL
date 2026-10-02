// Trainer case data: every phrase is in its paragraph, every target and hint key exists in the
// reference model, and the level-2 start model is the reference without its links.

import { describe, expect, it } from 'vitest'
import { compareModels } from '../src/core/compare'
import { findEntityByName } from '../src/core/ops'
import { CASES, hintsFor, phrasesFor, splitParagraph, TAGS } from '../src/data/cases'
import { levelStartModel } from '../src/data/trainer'

describe.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
  const m = c.build()

  it('finds every phrase, in order, in its paragraph', () => {
    for (let p = 0; p < c.spec.length; p++) {
      const parts = splitParagraph(c, p)
      expect(parts.map((x) => x.text).join('')).toBe(c.spec[p])
    }
    expect(c.spans.length).toBeGreaterThanOrEqual(15)
  })

  it('uses only known tags and points at existing reference elements', () => {
    const tags = new Set(TAGS.map((t) => t.id))
    const exists = (key: string) => {
      const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
      if (kind === 'entity') return !!findEntityByName(m, rest)
      if (kind === 'relationship') return m.relationships.some((r) => r.name === rest)
      if (kind === 'inheritance') return m.inheritances.some((i) => i.name === rest)
      if (kind === 'attribute') {
        const [e, a] = rest.split('.')
        return !!findEntityByName(m, e)?.attributes.some((x) => x.name === a)
      }
      return false
    }
    for (const s of c.spans) {
      expect(tags.has(s.tag)).toBe(true)
      for (const t of s.accept ?? []) expect(tags.has(t)).toBe(true)
      if (s.target) expect(exists(s.target), s.target).toBe(true)
    }
    for (const key of Object.keys(c.hints)) expect(exists(key), key).toBe(true)
  })

  it('has hints or text phrases for the hard elements', () => {
    const covered = (key: string) => hintsFor(c, key, []).length + phrasesFor(c, key).length > 0
    const keyEntities = m.entities.filter((e) => m.relationships.filter((r) => r.dependentSide && (r.dependentSide === 'A' ? r.entityA : r.entityB) === e.id).length >= 2)
    for (const e of keyEntities) expect(covered(`entity:${e.name}`), e.name).toBe(true)
  })

  it('level 2 starts with the entities only; the reference completes it', () => {
    const start = levelStartModel(c, 2)
    expect(start.entities.map((e) => e.name)).toEqual(m.entities.map((e) => e.name))
    expect(start.relationships).toEqual([])
    expect(start.inheritances).toEqual([])
    const before = compareModels(start, m, { scope: 'links', synonyms: c.synonyms })
    expect(before.counts.missing).toBe(m.relationships.length + m.inheritances.length)
    expect(compareModels(m, m, { scope: 'links' }).score).toBe(100)
    expect(levelStartModel(c, 3).entities).toEqual([])
    expect(levelStartModel(c, 1).relationships).toHaveLength(m.relationships.length)
    expect(start.entities.every((e) => !e.comment)).toBe(true)
  })
})
