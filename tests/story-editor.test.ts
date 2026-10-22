// Story editor (#31): a draft story from any model, beat edits that keep every entity in the story,
// and a file that opens again as the same story.

import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import {
  draftStory,
  insertBeat,
  moveBeat,
  parseStory,
  removeBeat,
  serializeStory,
  showIn,
  splitParagraphs,
  storyFrames,
  untold,
  updateBeat,
} from '../src/data/story'

const library = CASES.find((c) => c.id === 'library')!.build()

describe('draft story', () => {
  it.each(CASES.map((c) => [c.id, c]))('%s: every entity once, after what it hangs on, and the file opens again', (_, c) => {
    const model = c.build()
    const story = draftStory(model)
    expect(untold(story)).toEqual([])
    const frames = storyFrames(story)
    expect(frames.at(-1)!.model.entities.length).toBe(model.entities.length)
    expect(frames.at(-1)!.model.relationships.length).toBe(model.relationships.length)
    expect(story.beats[0].show).toBeUndefined()
    expect(story.beats.at(-1)!.overview).toBe(true)

    const beatOf = (id: string) => story.beats.findIndex((b) => b.show?.includes(model.entities.find((e) => e.id === id)!.name))
    for (const r of model.relationships) {
      if (r.dependentSide) {
        const child = r.dependentSide === 'A' ? r.entityA : r.entityB
        const parent = r.dependentSide === 'A' ? r.entityB : r.entityA
        // A dependent entity never comes before its parent (a cycle of dependencies could force it; the cases have none).
        expect(beatOf(parent)).toBeLessThanOrEqual(beatOf(child))
      }
    }
    for (const inh of model.inheritances) {
      const at = new Set(inh.childIds.map(beatOf))
      expect(at.size).toBe(1)
      expect(beatOf(inh.parentId)).toBeLessThan([...at][0])
    }

    const again = parseStory(serializeStory(story))
    expect(serializeStory(again)).toBe(serializeStory(story))
    expect(storyFrames(again).map((f) => f.model.entities.length)).toEqual(frames.map((f) => f.model.entities.length))
  })

  it('tells the Library in an order a reader can follow', () => {
    expect(draftStory(library).beats.map((b) => b.show?.join('+') ?? '·')).toEqual(['·', 'Publisher', 'Book', 'Author', 'Member', 'Loan', '·'])
    // TV Shows: the three kinds of person come together, right after Person.
    const tv = draftStory(CASES.find((c) => c.id === 'tv-shows')!.build()).beats.map((b) => b.show?.join('+'))
    expect(tv.slice(1, 3)).toEqual(['Person', 'Director+Actor+Technician'])
  })
})

describe('beat edits', () => {
  const story = draftStory(library)

  it('removing a beat moves its entities to the next one (the previous one for the last)', () => {
    const at = story.beats.findIndex((b) => b.show?.length)
    const gone = story.beats[at].show!
    const after = removeBeat(story, at)
    expect(after.beats.length).toBe(story.beats.length - 1)
    expect(after.beats[at].show!.slice(0, gone.length)).toEqual(gone)
    expect(untold(after)).toEqual([])
    storyFrames(after)

    const last = removeBeat(story, story.beats.length - 1)
    expect(untold(last)).toEqual([])
    expect(removeBeat({ ...story, beats: [story.beats[0]] }, 0).beats.length).toBe(1)
  })

  it('an entity moved to another beat leaves the beat it was in', () => {
    const name = story.beats.at(-2)!.show![0]
    const s = showIn(story, 1, name)
    expect(s.beats[1].show!.at(-1)).toBe(name)
    expect(s.beats.filter((b) => b.show?.includes(name)).length).toBe(1)
    expect(untold(s)).toEqual([])
  })

  it('inserts, moves and updates beats', () => {
    let s = insertBeat(story, 0)
    expect(s.beats[1]).toEqual({ title: 'New beat' })
    s = moveBeat(s, 1, 1)
    expect(s.beats[2].title).toBe('New beat')
    expect(moveBeat(s, 0, -1)).toBe(s)
    s = updateBeat(s, 2, { title: 'Why', text: splitParagraphs('One.\n\n  Two.\n\n\n') })
    expect(s.beats[2]).toEqual({ title: 'Why', text: ['One.', 'Two.'] })
    // One paragraph is written as plain text in the file.
    expect(JSON.parse(serializeStory(updateBeat(s, 2, { text: ['Only'] }))).beats[2]).toEqual({ title: 'Why', text: 'Only' })
  })
})
