import { describe, expect, it } from 'vitest'
import { hasLinks, splitLinks } from '../src/core/links'

describe('links in comments', () => {
  it('finds a bare domain and leaves the sentence punctuation outside', () => {
    expect(splitLinks('The database behind quaera.app: query it at quaera.app.')).toEqual([
      { text: 'The database behind ' },
      { text: 'quaera.app', url: 'https://quaera.app' },
      { text: ': query it at ' },
      { text: 'quaera.app', url: 'https://quaera.app' },
      { text: '.' },
    ])
  })

  it('keeps full URLs with paths, without a closing bracket', () => {
    expect(splitLinks('(see https://model.quaera.app/?example=quaera)')).toEqual([
      { text: '(see ' },
      { text: 'https://model.quaera.app/?example=quaera', url: 'https://model.quaera.app/?example=quaera' },
      { text: ')' },
    ])
  })

  it('ignores e-mail addresses, file names and plain text', () => {
    expect(hasLinks('Write to student@novaims.pt')).toBe(false)
    expect(hasLinks('Open model.cdm in PowerDesigner')).toBe(false)
    expect(hasLinks('A student enrols in a course.')).toBe(false)
    expect(hasLinks(undefined)).toBe(false)
  })
})
