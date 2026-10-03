import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { importPowerDesigner, parsePdType } from '../src/core/import/powerdesigner'
import { parseXml } from '../src/core/import/xml'
import { formatCardinality, type Model } from '../src/core/metamodel'
import { integrityProblems } from '../src/core/serialize'

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf-8')
const ent = (m: Model, name: string) => m.entities.find((e) => e.name === name)!
const rel = (m: Model, name: string) => {
  const r = m.relationships.find((x) => x.name === name)!
  const n = (id: string) => m.entities.find((e) => e.id === id)!.name
  return `${n(r.entityA)} ${formatCardinality(r.cardinalityA)} — ${formatCardinality(r.cardinalityB)} ${n(r.entityB)}${r.dependentSide ? ` dep ${r.dependentSide}` : ''}`
}

describe('xml reader', () => {
  it('reads elements, attributes, entities and CDATA', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b>t&lt;</b><c/><d><![CDATA[<raw>]]></d></a>')
    const a = doc.children[0]
    expect(a.attrs.x).toBe('1 & 2')
    expect(a.children.map((c) => c.name)).toEqual(['b', 'c', 'd'])
    expect(a.children[0].text).toBe('t<')
    expect(a.children[2].text).toBe('<raw>')
  })
  it('rejects broken nesting', () => {
    expect(() => parseXml('<a><b></a>')).toThrow()
  })
})

describe('PowerDesigner type codes', () => {
  it('maps codes with sizes', () => {
    expect(parsePdType('VA50')).toEqual({ dataType: 'Variable characters', length: 50 })
    expect(parsePdType('DC10,2')).toEqual({ dataType: 'Decimal', length: 10, precision: 2 })
    expect(parsePdType('I')).toEqual({ dataType: 'Integer' })
    expect(parsePdType('LVA250')).toEqual({ dataType: 'Text' })
    expect(parsePdType('XYZ')).toBeNull()
  })
})

describe('import .cdm (course files)', () => {
  it('TV Show: entities, attributes, identifiers, dependency, inheritance', () => {
    const { model: m, warnings } = importPowerDesigner(fixture('tv-show.cdm'), 'TV Show.cdm')
    expect(m.name).toBe('TV Show')
    expect(m.entities).toHaveLength(11)
    expect(integrityProblems(m)).toEqual([])
    const show = ent(m, 'TV_show')
    expect(show.attributes.map((a) => `${a.name}:${a.dataType}`)).toEqual(['Show_ID:Integer', 'Title:Variable characters', 'Genre:Variable characters', 'Release_year:Integer'])
    expect(show.identifiers).toHaveLength(1)
    expect(show.attributes[0].mandatory).toBe(true)
    // Entity1 = TV_show (stored as Object2): one show has 0,n episodes, an episode has 0,1 show.
    expect(rel(m, 'Contains')).toBe('TV_show 0,1 — 0,n Episode')
    expect(rel(m, 'Consists_Of')).toBe('Episode 1,1 — 0,n Scene dep B')
    expect(rel(m, 'films')).toBe('Director 1,1 — 0,n Episode')
    const scene = m.inheritances.find((i) => i.parentId === ent(m, 'Scene').id)!
    expect(scene.mutuallyExclusive).toBe(true)
    expect(scene.complete).toBe(true)
    expect(scene.childIds).toHaveLength(2)
    const person = m.inheritances.find((i) => i.parentId === ent(m, 'Participant').id)!
    expect(person.mutuallyExclusive).toBe(false)
    expect(person.complete).toBe(false)
    expect(person.childIds).toHaveLength(3)
    // Positions keep the PD layout: TV_show is left of and above Episode? at least all on screen.
    for (const e of m.entities) expect(e.position.x).toBeGreaterThanOrEqual(40)
    expect(warnings).toEqual([])
    expect(generatePdm(m).tables.length).toBeGreaterThan(5)
  })

  it('University: 9 entities, 9 relationships, generates a PDM', () => {
    const { model: m, warnings } = importPowerDesigner(fixture('university.cdm'))
    expect(m.entities.map((e) => e.name)).toContain('Assignment_of_teaching')
    expect(m.entities).toHaveLength(9)
    expect(m.relationships).toHaveLength(9)
    expect(integrityProblems(m)).toEqual([])
    expect(warnings).toEqual([])
    expect(generatePdm(m).tables).toHaveLength(9)
  })

  it('explains binary files and physical models', () => {
    expect(() => importPowerDesigner('\u0000\u0001binary')).toThrow(/XML/)
    expect(() => importPowerDesigner('<?xml version="1.0"?><?PowerDesigner signature="PDM_DATA_MODEL_XML"?><Model/>')).toThrow(/physical/)
  })
})
