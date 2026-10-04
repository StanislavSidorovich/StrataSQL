import { describe, expect, it } from 'vitest'
import { CARD, emptyModel } from '../src/core/metamodel'
import { addAttribute, addEntity, addIdentifier, addRelationship } from '../src/core/ops'
import { addMark, coverage, myTaskExercise, nameWords, paragraphs, remapMarks, sameName, type Mark } from '../src/data/mytask'

const mark = (text: string, p: number, para: string, tag: Mark['tag']): Mark => {
  const start = para.indexOf(text)
  return { p, start, end: start + text.length, tag, text }
}

describe('My task', () => {
  it('splits the text into paragraphs and drops Markdown marks', () => {
    expect(paragraphs('# Library\n\nA library keeps **books**.\n- Each book has an ISBN.\r\n\r\n')).toEqual(['Library', 'A library keeps books.', 'Each book has an ISBN.'])
    expect(myTaskExercise({ title: '', text: 'One.\nTwo.', marks: [] })).toMatchObject({ title: 'My task', spec: ['One.', 'Two.'] })
  })

  it('compares names by their words', () => {
    expect(nameWords('the loan dates')).toEqual(['loan', 'date'])
    expect(nameWords('Birth_year')).toEqual(['birth', 'year'])
    expect(sameName('books', 'Book')).toBe(true)
    expect(sameName('publication year', 'Publication_year')).toBe(true)
    expect(sameName('card number', 'Card_number')).toBe(true)
    expect(sameName('number', 'Card_number')).toBe(true)
    expect(sameName('name', 'Title')).toBe(false)
  })

  it('replaces overlapping marks and keeps marks after an edit', () => {
    const t = 'Members borrow books.'
    let marks = addMark([], mark('books', 0, t, 'attribute'))
    marks = addMark(marks, mark('books', 0, t, 'entity'))
    expect(marks.map((m) => m.tag)).toEqual(['entity'])
    marks = addMark(marks, mark('Members', 0, t, 'entity'))
    expect(marks.map((m) => m.text)).toEqual(['Members', 'books'])
    // A sentence added in front: the marks move with their words; a deleted word loses its mark.
    expect(remapMarks(marks, 'A small library.\nMembers borrow books.').map((m) => [m.p, m.start, m.text])).toEqual([
      [1, 0, 'Members'],
      [1, 15, 'books'],
    ])
    expect(remapMarks(marks, 'Members borrow DVDs.').map((m) => m.text)).toEqual(['Members'])
  })

  it('lists tagged phrases missing from the model and model elements no phrase names', () => {
    const t = 'Members borrow books. Each book has an ISBN and a title.'
    const marks = [mark('Members', 0, t, 'entity'), mark('borrow', 0, t, 'relationship'), mark('books', 0, t, 'entity'), mark('ISBN', 0, t, 'identifier'), mark('title', 0, t, 'attribute')]
    const m = emptyModel()
    const book = addEntity(m, { name: 'Book' })
    const isbn = addAttribute(m, book.id, { name: 'ISBN' })
    addAttribute(m, book.id, { name: 'Price' })
    const shelf = addEntity(m, { name: 'Shelf' })
    let c = coverage(marks, m)
    expect(c.missing.map((x) => `${x.mark.text}: ${x.why}`)).toEqual([
      'Members: no entity with this name yet',
      'borrow: no relationships in the model yet',
      'ISBN: Book.ISBN is not in an identifier yet',
      'title: no attribute with this name yet',
    ])
    expect(c.unmentioned.map((x) => x.name)).toEqual(['Shelf', 'Price'])

    addIdentifier(m, book.id, { name: 'Identifier_1', isPrimary: true, attributeIds: [isbn.id] })
    const member = addEntity(m, { name: 'Member' })
    addRelationship(m, member.id, book.id, { name: 'Loan', cardinalityA: CARD.zeroMany, cardinalityB: CARD.zeroMany })
    c = coverage(marks, m)
    expect(c.missing.map((x) => x.mark.text)).toEqual(['borrow', 'title'])
    expect(shelf.name).toBe('Shelf')
  })

  it('says nothing about the model before anything is tagged', () => {
    const m = emptyModel()
    addEntity(m, { name: 'Book' })
    expect(coverage([], m)).toEqual({ missing: [], unmentioned: [], rules: [] })
  })
})
