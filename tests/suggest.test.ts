import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import { EXERCISES } from '../src/data/exercises'
import { nameSuggestions, singular } from '../src/data/suggest'

describe('name suggestions from the task text', () => {
  it('offers every word, its singular and word pairs; skips small words', () => {
    const s = nameSuggestions(['Each member has contacts and a birth date. Books, members.'])
    expect(s.attributes).toEqual(expect.arrayContaining(['contacts', 'contact', 'member', 'birth_date', 'books', 'book']))
    expect(s.attributes).not.toContain('each')
    expect(s.attributes).not.toContain('books_members') // a comma breaks the pair
    expect(s.entities).toEqual(expect.arrayContaining(['Member', 'Book', 'Birth_date']))
  })

  it('makes simple singulars', () => {
    expect(singular('categories')).toBe('category')
    expect(singular('addresses')).toBe('address')
    expect(singular('status')).toBe('status')
    expect(singular('loans')).toBe('loan')
  })

  it('every case and exercise text gives suggestions', () => {
    for (const c of [...CASES, ...EXERCISES]) expect(nameSuggestions(c.spec).attributes.length, c.title).toBeGreaterThan(10)
  })
})
