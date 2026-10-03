// Reference CDM of cases/library.md — the starter case (own example, difficulty 1).
// Teaches the basics one at a time: entity, attributes, primary vs alternate identifier, one-to-many,
// a plain many-to-many (join table) and a many-to-many that becomes an intermediate entity.

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addRelationship, updateEntity } from '../../core/ops'

export function buildLibrary(): Model {
  const m = emptyModel('Library')
  m.comment = 'Starter case (cases/library.md): a small library, its books and loans.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 100 })

  const publisher = addEntity(m, { name: 'Publisher', position: { x: 40, y: 40 } })
  addAttribute(m, publisher.id, { name: 'publisher_id', dataType: 'Integer', primary: true })
  addAttribute(m, publisher.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, publisher.id, { name: 'country', length: 50 })

  const book = addEntity(m, { name: 'Book', position: { x: 420, y: 40 } })
  addAttribute(m, book.id, { name: 'book_id', dataType: 'Integer', primary: true })
  const isbn = addAttribute(m, book.id, { name: 'isbn', dataType: 'Characters', length: 13, mandatory: true })
  addIdentifier(m, book.id, { name: 'isbn', isPrimary: false, attributeIds: [isbn.id] })
  addAttribute(m, book.id, { name: 'title', length: 200, mandatory: true })
  addAttribute(m, book.id, { name: 'pub_year', dataType: 'Short integer' })

  const author = addEntity(m, { name: 'Author', position: { x: 800, y: 40 } })
  addAttribute(m, author.id, { name: 'author_id', dataType: 'Integer', primary: true })
  addAttribute(m, author.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, author.id, { name: 'birth_year', dataType: 'Short integer' })

  const member = addEntity(m, { name: 'Member', position: { x: 40, y: 340 } })
  addAttribute(m, member.id, { name: 'card_no', dataType: 'Integer', primary: true })
  addAttribute(m, member.id, { name: 'name', domainId: name.id, mandatory: true })
  const email = addAttribute(m, member.id, { name: 'email', length: 100, mandatory: true })
  addIdentifier(m, member.id, { name: 'email', isPrimary: false, attributeIds: [email.id] })

  const loan = addEntity(m, { name: 'Loan', position: { x: 420, y: 340 } })
  addAttribute(m, loan.id, { name: 'loan_id', dataType: 'Integer', primary: true })
  addAttribute(m, loan.id, { name: 'loan_date', dataType: 'Date', mandatory: true })
  addAttribute(m, loan.id, { name: 'due_date', dataType: 'Date', mandatory: true })
  addAttribute(m, loan.id, { name: 'return_date', dataType: 'Date', comment: 'NULL while the book is out' })
  updateEntity(m, loan.id, { comment: 'Member × Book with dates; the same pair can repeat, hence an own id.' })

  addRelationship(m, publisher.id, book.id, { name: 'publishes' })
  addRelationship(m, author.id, book.id, { name: 'writes', cardinalityA: CARD.oneMany, cardinalityB: CARD.oneMany })
  addRelationship(m, member.id, loan.id, { name: 'borrows' })
  addRelationship(m, book.id, loan.id, { name: 'is_lent' })

  return m
}
