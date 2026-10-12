// Story files (#30): a model told beat by beat. The frames only grow, the lines are drawn from the
// entity that was there first, held lines wait for their beat, ghosts stay out of the model, and a
// broken file fails with a readable message.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { ModelFormatError } from '../src/core/serialize'
import { CASES } from '../src/data/cases'
import { ghostId, isStoryFile, parseStory, STORY_FORMAT, storyFrames, untold, type StoryBeat } from '../src/data/story'

const library = CASES.find((c) => c.id === 'library')!.build()
const id = (name: string) => library.entities.find((e) => e.name === name)!.id
const relId = (name: string) => library.relationships.find((r) => r.name === name)!.id

const BEATS: StoryBeat[] = [
  { title: 'A library lends books', text: 'Intro: nothing on the canvas yet.' },
  { title: 'Members', show: ['Member'], quote: 'members borrow books' },
  { title: 'They borrow: a loan', show: ['Loan'] },
  { title: 'Books', show: ['Book'], links: [] },
  { title: 'Who wrote and published them', show: ['Publisher', 'Author'], links: ['writes'], focus: 'Author' },
  {
    title: 'Not in the model yet',
    ghosts: [{ name: 'Reservation', attributes: ['Reserved_on'], links: ['Member', 'Book'] }],
    ghostRows: [{ entity: 'Loan', rows: ['Fine'] }],
  },
  { title: 'The whole model', overview: true },
]
const file = (patch: (o: Record<string, any>) => void = () => {}) => {
  const o: Record<string, any> = { format: STORY_FORMAT, version: 1, title: 'Library', model: library, beats: structuredClone(BEATS) }
  patch(o)
  return JSON.stringify(o)
}

describe('story files', () => {
  it('tells a story file from a model file', () => {
    expect(isStoryFile(file())).toBe(true)
    expect(isStoryFile(JSON.stringify(library))).toBe(false)
    expect(isStoryFile('not json')).toBe(false)
  })

  it('grows the model beat by beat and ends with the whole model', () => {
    const story = parseStory(file())
    const frames = storyFrames(story)
    expect(frames.map((f) => f.model.entities.length)).toEqual([0, 1, 2, 3, 5, 5, 5])
    for (let k = 1; k < frames.length; k++) {
      const before = frames[k - 1].model
      const now = frames[k].model
      expect(before.entities.every((e) => now.entities.some((x) => x.id === e.id))).toBe(true)
      expect(before.relationships.every((r) => now.relationships.some((x) => x.id === r.id))).toBe(true)
    }
    const last = frames.at(-1)!.model
    expect(last.entities).toEqual(library.entities)
    expect(last.relationships.map((r) => r.id).sort()).toEqual(library.relationships.map((r) => r.id).sort())
    // Whole entities: the tables of the last beat are the tables of the model.
    expect(generatePdm(last).tables.map((t) => t.name)).toEqual(generatePdm(library).tables.map((t) => t.name))
    expect(untold(story)).toEqual([])
  })

  it('draws each line once, from the entity that was there first', () => {
    const frames = storyFrames(parseStory(file()))
    const borrows = library.relationships.find((r) => r.name === 'borrows')!
    // Member came first: the line starts at Member, whichever end it is.
    expect(frames[2].drawn).toEqual([{ id: borrows.id, from: borrows.entityA === id('Member') ? 'A' : 'B' }])
    const isLent = library.relationships.find((r) => r.name === 'is_lent')!
    expect(frames[3].drawn).toEqual([{ id: isLent.id, from: isLent.entityA === id('Loan') ? 'A' : 'B' }])
    const drawnIds = frames.flatMap((f) => f.drawn.map((d) => d.id))
    expect(new Set(drawnIds).size).toBe(drawnIds.length)
    expect(drawnIds.sort()).toEqual(library.relationships.map((r) => r.id).sort())
  })

  it('holds a named line back until its beat', () => {
    const beats = structuredClone(BEATS)
    beats[4] = { title: 'Publishers and authors', show: ['Publisher', 'Author'] }
    beats[5] = { ...beats[5], links: ['writes'], focus: 'Book' }
    const frames = storyFrames(parseStory(file((o) => (o.beats = beats))))
    expect(frames[4].drawn.map((d) => d.id)).toEqual([relId('publishes')])
    expect(frames[4].model.relationships.some((r) => r.id === relId('writes'))).toBe(false)
    const writes = library.relationships.find((r) => r.name === 'writes')!
    // Both ends were there: the line arrives at the beat's focus.
    expect(frames[5].drawn).toEqual([{ id: writes.id, from: writes.entityA === id('Book') ? 'B' : 'A' }])
  })

  it('keeps the lines’ source entities in the picture and the focus where asked', () => {
    const frames = storyFrames(parseStory(file()))
    expect(frames[0].focus).toBeNull()
    expect(frames[0].fit).toEqual([])
    expect(frames[1].focus).toBe(id('Member'))
    expect(frames[2].fit).toEqual(expect.arrayContaining([id('Loan'), id('Member')]))
    expect(frames[4].focus).toBe(id('Author'))
    expect(frames[4].current).toEqual([id('Publisher'), id('Author')])
    expect(frames.at(-1)!.focus).toBeNull()
    expect(frames.at(-1)!.fit).toEqual([])
  })

  it('places ghosts outside the model and keeps them to the end', () => {
    const frames = storyFrames(parseStory(file()))
    const g = frames[5]
    expect(g.ghosts.map((x) => x.id)).toEqual([ghostId('Reservation')])
    expect(g.currentGhosts).toEqual([ghostId('Reservation')])
    expect(g.ghosts[0].linkIds).toEqual([id('Member'), id('Book')])
    // No position given: right of its first link.
    const member = library.entities.find((e) => e.name === 'Member')!
    expect(g.ghosts[0].position).toEqual({ x: member.position.x + 300, y: member.position.y })
    expect(g.ghostRows).toEqual({ [id('Loan')]: ['Fine'] })
    expect(g.focus).toBe(ghostId('Reservation'))
    expect(g.model.entities.some((e) => e.name === 'Reservation')).toBe(false)
    expect(frames[6].ghosts).toHaveLength(1)
    expect(frames[6].currentGhosts).toEqual([])
    expect(frames[6].ghostRows).toEqual({ [id('Loan')]: ['Fine'] })
  })

  it('shows an inheritance once the parent and all its children are on screen', () => {
    const c = CASES.find((x) => x.build().inheritances.length > 0)!
    const m = c.build()
    const inh = m.inheritances[0]
    const name = (eid: string) => m.entities.find((e) => e.id === eid)!.name
    const beats: StoryBeat[] = [
      { title: 'Parent', show: [name(inh.parentId)] },
      ...inh.childIds.map((ch) => ({ title: name(ch), show: [name(ch)] })),
    ]
    const frames = storyFrames(parseStory(JSON.stringify({ format: STORY_FORMAT, version: 1, title: c.title, model: m, beats })))
    expect(frames.findIndex((f) => f.newInheritances.includes(inh.id))).toBe(frames.length - 1)
    expect(frames.at(-2)!.model.inheritances).toEqual([])
    // The camera takes in the whole family, not only the last child.
    expect(frames.at(-1)!.fit).toEqual(expect.arrayContaining([inh.id, inh.parentId, ...inh.childIds]))
  })

  it('tells the open model when the file has none', () => {
    const story = parseStory(file((o) => delete o.model), library)
    expect(story.model).toBeUndefined()
    expect(storyFrames(story, library).at(-1)!.model.entities).toHaveLength(5)
    expect(() => parseStory(file((o) => delete o.model))).toThrow(/no model/)
  })

  it('fails with readable messages', () => {
    const bad = (patch: (o: Record<string, any>) => void, msg: RegExp) => {
      expect(() => parseStory(file(patch))).toThrow(ModelFormatError)
      expect(() => parseStory(file(patch))).toThrow(msg)
    }
    bad((o) => (o.version = 2), /version 2/)
    bad((o) => (o.beats = []), /beats/)
    bad((o) => (o.beats[1].show = ['Members']), /no entity “Members”/)
    bad((o) => o.beats[2].show.push('Member'), /already shown/)
    bad((o) => (o.beats[1].links = ['writes']), /already held/)
    bad((o) => ((o.beats[1].links = ['writes']), (o.beats[4].links = [])), /needs both its entities/)
    bad((o) => (o.beats[1].links = ['nope']), /no relationship “nope”/)
    bad((o) => (o.beats[1].focus = 'Book'), /not on screen/)
    bad((o) => (o.beats[1].ghosts = [{ name: 'Book' }]), /name of an entity/)
    bad((o) => (o.beats[1].ghosts = [{ name: 'X', links: ['Book'] }]), /not on screen yet/)
    bad((o) => (o.beats[1].quote = 3), /quote must be text/)
  })

  it('lists entities that no beat shows', () => {
    const beats = structuredClone(BEATS).filter((b) => !b.show?.includes('Publisher'))
    expect(untold(parseStory(file((o) => (o.beats = beats))))).toEqual(['Publisher', 'Author'])
  })
})
