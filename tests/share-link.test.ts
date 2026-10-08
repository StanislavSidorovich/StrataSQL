import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import { serializeModel } from '../src/core/serialize'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { emptyModel } from '../src/core/metamodel'
import { addAttribute, addEntity, addInheritance, addRelationship } from '../src/core/ops'
import { decodeShare, encodeShare, shareDataFromHash, shareUrl, withShortIds } from '../src/core/shareLink'

describe('share link', () => {
  it('round-trips every case model through the link (ids shortened, the same SQL)', async () => {
    for (const c of CASES) {
      const m = c.build()
      const back = await decodeShare(await encodeShare(m))
      expect(serializeModel(back), c.id).toBe(serializeModel(withShortIds(m)))
      expect(generateSqlServer(generatePdm(back)), c.id).toBe(generateSqlServer(generatePdm(m)))
    }
  })

  it('shortens generated ids and keeps every reference', async () => {
    const m = emptyModel('Drawn')
    const a = addEntity(m, { name: 'Client' })
    const b = addEntity(m, { name: 'Pet' })
    const c = addEntity(m, { name: 'Dog' })
    addAttribute(m, a.id, { name: 'client_id', dataType: 'Integer', primary: true })
    addAttribute(m, b.id, { name: 'pet_no', dataType: 'Integer', primary: true })
    addRelationship(m, a.id, b.id, { dependentSide: 'B' })
    addInheritance(m, b.id, [c.id])
    const back = await decodeShare(await encodeShare(m))
    const [client, pet, dog] = back.entities
    expect([client, pet, dog].every((e) => e.id.length <= 2)).toBe(true)
    expect(back.relationships[0]).toMatchObject({ entityA: client.id, entityB: pet.id })
    expect(back.inheritances[0]).toMatchObject({ parentId: pet.id, childIds: [dog.id] })
    expect(pet.identifiers[0].attributeIds).toEqual([pet.attributes[0].id])
    expect(generateSqlServer(generatePdm(back))).toBe(generateSqlServer(generatePdm(m)))
    const long = JSON.stringify(JSON.parse(serializeModel(m))).length
    expect(JSON.stringify(withShortIds(m)).length).toBeLessThan(long)
  })

  it('keeps links short enough to paste into a chat', async () => {
    for (const c of CASES) {
      const url = await shareUrl(c.build(), 'https://model.quaera.app/')
      expect(url.length, c.id).toBeLessThan(16000)
    }
  })

  it('uses only URL-safe characters and drops the query and the old fragment', async () => {
    const url = await shareUrl(CASES[0].build(), 'https://model.quaera.app/?example=quaera#m=old')
    expect(url).toMatch(/^https:\/\/model\.quaera\.app\/#m=[A-Za-z0-9_-]+$/)
  })

  it('reads the data from a fragment', () => {
    expect(shareDataFromHash('#m=abc')).toBe('abc')
    expect(shareDataFromHash('#x=1&m=abc')).toBe('abc')
    expect(shareDataFromHash('')).toBeNull()
    expect(shareDataFromHash('#m=')).toBeNull()
  })

  it('rejects a cut or damaged link with a readable message', async () => {
    const data = await encodeShare(CASES[0].build())
    await expect(decodeShare(data.slice(0, data.length / 2))).rejects.toThrow(/damaged|incomplete|JSON/)
    await expect(decodeShare('not-a-model')).rejects.toThrow(/damaged/)
  })
})
