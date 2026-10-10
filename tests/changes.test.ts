// Changes between a draft and its revision: what is new, changed or removed, numbered in reading order.

import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { diffModels, changeOf } from '../src/core/changes'
import { CARD, type Model } from '../src/core/metamodel'
import {
  addAttribute,
  addEntity,
  addInheritance,
  addRelationship,
  findEntityByName,
  removeAttribute,
  removeEntity,
  setDependentSide,
  updateAttribute,
  updateEntity,
  updateInheritance,
  updateRelationship,
} from '../src/core/ops'
import { parseModel, readSavedBase, serializeModel } from '../src/core/serialize'
import { BASE_PARAM, decodeShare, SHARE_PARAM, shareUrl } from '../src/core/shareLink'
import { buildLibrary } from '../src/data/examples/library'

const ent = (m: Model, name: string) => findEntityByName(m, name)!
const rel = (m: Model, name: string) => m.relationships.find((r) => r.name === name)!
const revise = (base: Model, edit: (m: Model) => void) => produce(base, edit)

describe('diffModels', () => {
  const base = buildLibrary()

  it('a model compared with itself has no changes', () => {
    const c = diffModels(base, base)
    expect(c.changes).toEqual([])
    expect(c.kept).toBe(base.entities.length + base.relationships.length + base.inheritances.length)
  })

  it('matches by content, not ids: a copy with fresh ids is unchanged', () => {
    const copy = buildLibrary() // same model, new random ids
    expect(diffModels(base, copy).changes).toEqual([])
  })

  it('finds new, changed and removed entities with their attribute details', () => {
    const rev = revise(base, (m) => {
      const fine = addEntity(m, { name: 'Fine', position: { x: 800, y: 340 }, comment: 'NEW: late returns are fined.' })
      addAttribute(m, fine.id, { name: 'fine_id', dataType: 'Integer', primary: true })
      addRelationship(m, ent(m, 'Loan').id, fine.id, { name: 'fined', cardinalityB: CARD.zeroOne })
      const book = ent(m, 'Book')
      removeAttribute(m, book.id, book.attributes.find((a) => a.name === 'pub_year')!.id)
      addAttribute(m, book.id, { name: 'pages', dataType: 'Short integer' })
      updateAttribute(m, book.id, book.attributes.find((a) => a.name === 'title')!.id, { length: 300, mandatory: false })
      removeEntity(m, ent(m, 'Publisher').id)
    })
    const c = diffModels(base, rev)
    const fine = changeOf(c, 'entity', ent(rev, 'Fine').id)!
    expect(fine.status).toBe('new')
    expect(fine.note).toBe('NEW: late returns are fined.')
    const book = changeOf(c, 'entity', ent(rev, 'Book').id)!
    expect(book.status).toBe('changed')
    expect(book.details).toEqual(['title: VA200 → VA300, now optional', '− pub_year', '+ pages'])
    const b = ent(rev, 'Book')
    const id = (n: string) => b.attributes.find((x) => x.name === n)!.id
    expect(book.attributes).toEqual({ added: [id('pages')], changed: [id('title')], removed: ['pub_year'] })
    expect(changeOf(c, 'relationship', rel(rev, 'fined').id)?.status).toBe('new')
    const removed = c.changes.filter((x) => x.status === 'removed').map((x) => x.label)
    expect(removed).toEqual(['Publisher', 'Publisher — Book (publishes)'])
    expect(c.counts).toEqual({ new: 1, changed: 1, removed: 1 })
    // The new line comes with Fine: same number, right after it.
    const k = c.changes.findIndex((x) => x.label === 'Fine')
    expect(c.changes[k + 1]).toMatchObject({ label: 'Loan — Fine (fined)', n: fine.n, with: fine.id })
  })

  it('pairs renamed keys, fixed typos and longer names instead of “− old, + new”', () => {
    const rev = revise(base, (m) => {
      const member = ent(m, 'Member')
      updateAttribute(m, member.id, member.attributes.find((a) => a.name === 'card_no')!.id, { name: 'Member_ID' })
      const pub = ent(m, 'Publisher')
      updateAttribute(m, pub.id, pub.attributes.find((a) => a.name === 'country')!.id, { name: 'cuntry' })
      const book = ent(m, 'Book')
      updateAttribute(m, book.id, book.attributes.find((a) => a.name === 'title')!.id, { name: 'title_full' })
    })
    const c = diffModels(base, rev)
    expect(changeOf(c, 'entity', ent(rev, 'Member').id)?.details).toEqual(['Member_ID: renamed from card_no'])
    expect(changeOf(c, 'entity', ent(rev, 'Publisher').id)?.details).toEqual(['cuntry: renamed from country'])
    expect(changeOf(c, 'entity', ent(rev, 'Book').id)?.details).toEqual(['title_full: renamed from title'])
  })

  it('a renamed entity is the same entity, renamed', () => {
    const rev = revise(base, (m) => updateEntity(m, ent(m, 'Member').id, { name: 'Reader' }))
    const c = diffModels(base, rev)
    expect(changeOf(c, 'entity', ent(rev, 'Reader').id)?.details).toEqual(['renamed from Member'])
  })

  it('reports cardinality and dependency changes in the base orientation', () => {
    const rev = revise(base, (m) => {
      const r = rel(m, 'borrows')
      updateRelationship(m, r.id, { cardinalityB: CARD.oneMany })
      setDependentSide(m, r.id, 'B')
    })
    const c = diffModels(base, rev)
    expect(changeOf(c, 'relationship', rel(rev, 'borrows').id)?.details).toEqual(['card at Loan: 0,n → 1,n', 'Loan now depends on Member'])
  })

  it('a line moved to another entity keeps its name and says where it goes now', () => {
    const rev = revise(base, (m) => {
      const fee = addEntity(m, { name: 'Membership', position: { x: 0, y: 600 } })
      addAttribute(m, fee.id, { name: 'membership_id', dataType: 'Integer', primary: true })
      updateRelationship(m, rel(m, 'borrows').id, { entityA: fee.id })
    })
    const c = diffModels(base, rev)
    expect(changeOf(c, 'relationship', rel(rev, 'borrows').id)?.details).toEqual(['now links Membership and Loan'])
  })

  it('inheritance: children and flags', () => {
    const withInh = revise(base, (m) => {
      const staff = addEntity(m, { name: 'Librarian', position: { x: 40, y: 640 } })
      addInheritance(m, ent(m, 'Member').id, [staff.id], { name: 'kind' })
    })
    const rev = revise(withInh, (m) => updateInheritance(m, m.inheritances[0].id, { mutuallyExclusive: !m.inheritances[0].mutuallyExclusive }))
    const c = diffModels(withInh, rev)
    expect(c.changes).toHaveLength(1)
    expect(c.changes[0].kind).toBe('inheritance')
    expect(c.changes[0].details[0]).toMatch(/mutually exclusive/)
  })

  it('numbers follow the canvas: rows top to bottom, left to right; removed last', () => {
    const rev = revise(base, (m) => {
      addEntity(m, { name: 'Zeta', position: { x: 900, y: 0 } })
      addEntity(m, { name: 'Alpha', position: { x: 0, y: 900 } })
      removeEntity(m, ent(m, 'Author').id)
    })
    const c = diffModels(base, rev)
    const order = c.changes.map((x) => `${x.n}:${x.label}`)
    expect(order[0]).toBe('1:Zeta')
    expect(order).toContain('2:Alpha')
    expect(c.changes.at(-1)?.status).toBe('removed')
  })
})

describe('the earlier version travels with the model', () => {
  it('a saved file keeps it; an old file has none', () => {
    const base = buildLibrary()
    const rev = revise(base, (m) => updateEntity(m, ent(m, 'Member').id, { name: 'Reader' }))
    const text = serializeModel(rev, undefined, base)
    expect(parseModel(text).name).toBe(rev.name)
    const back = readSavedBase(text)!
    expect(diffModels(back, parseModel(text)).changes.map((c) => c.label)).toEqual(['Reader'])
    expect(readSavedBase(serializeModel(rev))).toBeNull()
  })

  it('a share link carries it as a second parameter', async () => {
    const base = buildLibrary()
    const url = new URL(await shareUrl(base, 'https://model.quaera.app/', base))
    const params = new URLSearchParams(url.hash.slice(1))
    expect(params.get(SHARE_PARAM)).toBeTruthy()
    expect((await decodeShare(params.get(BASE_PARAM)!)).entities).toHaveLength(base.entities.length)
  })
})
