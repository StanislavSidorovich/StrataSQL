// Story files (`*.strata-story.json`): a model told as a story, one beat at a time — the way a
// group presents its design. Each beat brings in the entities of one moment of the process (a client
// registers a pet, books a visit, pays…), with the words of the task that ask for them; the lines to
// what is already on screen are drawn from the old entity to the new one. Ghosts are what the task
// asks for and the model does not hold yet: dashed boxes and dashed rows, never part of the model.
// Elements are named, not referenced by id, so a story can be written by hand and still fits a model
// whose ids changed (the same model saved again, or a story file without a model of its own).

import { MODEL_FORMAT, type Id, type Model, type Relationship, type Side } from '../core/metamodel'
import { ModelFormatError, parseModel, serializeModel } from '../core/serialize'

export const STORY_FORMAT = 'strata-story'
export const STORY_VERSION = 1
export const STORY_EXTENSION = '.strata-story.json'

/** Something the task asks for that the model does not hold yet: a dashed box near the model. */
export interface Ghost {
  name: string
  /** Planned attributes, as plain words (`Next_due`, `→ Branch`). */
  attributes?: string[]
  /** Entities it would be linked to (dashed lines). */
  links?: string[]
  /** Canvas position; without one it is placed to the right of its first link. */
  position?: { x: number; y: number }
}

/** Planned attributes inside an existing entity (dashed rows). */
export interface GhostRows {
  entity: string
  rows: string[]
}

/** A strip of states (an appointment's status) with the current one marked. */
export interface StoryStatus {
  values: string[]
  now: number
}

export interface StoryBeat {
  title: string
  /** Entities that appear in this beat. */
  show?: string[]
  /** Relationships (by name) held back until this beat, although both ends are already on screen. */
  links?: string[]
  ghosts?: Ghost[]
  ghostRows?: GhostRows[]
  /** The entity or ghost the comment points at; default: the first shown entity or ghost. */
  focus?: string
  /** Words of the task, quoted. */
  quote?: string | string[]
  /** The explanation, with **bold** / *italic* / `code` markup. */
  text?: string | string[]
  status?: StoryStatus
  /** The whole model at once: nothing dimmed, the camera fits everything. */
  overview?: boolean
}

export interface Story {
  title: string
  /** The model the story tells; a story file without one is told over the open model. */
  model?: Model
  beats: StoryBeat[]
}

/** A drawn line: the relationship and the end it is drawn from (the entity that was there first). */
export interface DrawnLink {
  id: Id
  from: 'A' | 'B'
}

export interface PlacedGhost extends Ghost {
  /** `ghost:<name>`: the canvas node id. */
  id: string
  position: { x: number; y: number }
  /** Entity ids of its links. */
  linkIds: Id[]
}

/** What the canvas shows at one beat. */
export interface StoryFrame {
  beat: StoryBeat
  /** The model reduced to the entities shown so far (whole entities, their links between them). */
  model: Model
  /** Entities that appear in this beat (bright; the others are dimmed unless it is an overview). */
  current: Id[]
  /** Relationships that appear in this beat, drawn from the older end. */
  drawn: DrawnLink[]
  /** Inheritances that appear in this beat. */
  newInheritances: Id[]
  /** All ghosts so far; the ones of this beat are in `currentGhosts`. */
  ghosts: PlacedGhost[]
  currentGhosts: string[]
  /** Ghost rows so far, by entity id. */
  ghostRows: Record<Id, string[]>
  /** Entity id or ghost node id the comment points at; null: the comment stands in the corner. */
  focus: string | null
  /** Node ids the camera fits: this beat's elements and the entity the lines come from. */
  fit: string[]
}

export const ghostId = (name: string) => `ghost:${name}`

const fail = (msg: string): never => {
  throw new ModelFormatError(msg)
}

/** True when the text is a story file. */
export function isStoryFile(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown }).format === STORY_FORMAT
  } catch {
    return false
  }
}

const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const textList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v)
export const quotesOf = (b: StoryBeat) => textList(b.quote)
export const textsOf = (b: StoryBeat) => textList(b.text)

/**
 * Reads a story file. `current` is the open model, used when the file carries none. Every name is
 * checked against the model (and every frame built), so a typo fails here with a readable message.
 */
export function parseStory(text: string, current?: Model): Story {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch (e) {
    return fail(`Not valid JSON: ${(e as Error).message}`)
  }
  if (raw.format !== STORY_FORMAT) fail(`Not a Quaera Model story (format = ${String(raw.format)})`)
  if (raw.version !== STORY_VERSION) fail(`Unsupported story version ${String(raw.version)}`)
  if (typeof raw.title !== 'string' || !raw.title) fail('title is missing')
  if (!Array.isArray(raw.beats) || !raw.beats.length) fail('beats must be a non-empty list')
  const model = raw.model !== undefined ? parseModel({ format: MODEL_FORMAT, ...(raw.model as object) }) : current
  if (!model) fail('the story has no model: open the model first, or put it into the file as "model"')
  ;(raw.beats as Record<string, unknown>[]).forEach((b, i) => {
    const where = `beats[${i}]`
    if (typeof b.title !== 'string') fail(`${where}.title is missing`)
    for (const k of ['show', 'links'] as const) if (b[k] !== undefined && !isStrings(b[k])) fail(`${where}.${k} must be a list of names`)
    for (const k of ['quote', 'text'] as const) if (b[k] !== undefined && typeof b[k] !== 'string' && !isStrings(b[k])) fail(`${where}.${k} must be text or a list of texts`)
  })
  const story: Story = { title: raw.title as string, ...(raw.model !== undefined ? { model } : {}), beats: raw.beats as StoryBeat[] }
  storyFrames(story, model)
  return story
}

/** Where a ghost without a position goes: to the right of its first link, below earlier ghosts there. */
function placeGhost(g: Ghost, model: Model, placed: PlacedGhost[]): { x: number; y: number } {
  if (g.position) return g.position
  const anchor = model.entities.find((e) => e.name === g.links?.[0])
  const base = anchor ? { x: anchor.position.x + 300, y: anchor.position.y } : { x: Math.max(0, ...model.entities.map((e) => e.position.x)) + 320, y: 0 }
  let y = base.y
  while (placed.some((p) => Math.abs(p.position.x - base.x) < 200 && Math.abs(p.position.y - y) < 120)) y += 140
  return { x: base.x, y }
}

/** The frames of a story over its model: what the canvas shows at each beat. Throws on an unknown name. */
export function storyFrames(story: Story, model: Model = story.model!): StoryFrame[] {
  const byName = new Map(model.entities.map((e) => [e.name, e]))
  const entityId = (name: string, where: string) => (byName.get(name) ?? fail(`${where}: no entity “${name}” in the model`)).id
  const relsByName = new Map<string, Relationship[]>()
  for (const r of model.relationships) relsByName.set(r.name, [...(relsByName.get(r.name) ?? []), r])

  // Relationships named in a beat's `links` wait for that beat.
  const heldUntil = new Map<Id, number>()
  story.beats.forEach((b, i) =>
    (b.links ?? []).forEach((n) => {
      const rels = relsByName.get(n) ?? fail(`beats[${i}].links: no relationship “${n}” in the model`)
      rels.forEach((r) => {
        if (heldUntil.has(r.id)) fail(`beats[${i}].links: “${n}” is already held for beats[${heldUntil.get(r.id)}]`)
        heldUntil.set(r.id, i)
      })
    }),
  )

  const shown: Id[] = []
  const shownRels = new Set<Id>()
  const shownInhs = new Set<Id>()
  const ghosts: PlacedGhost[] = []
  const ghostRows: Record<Id, string[]> = {}
  const frames: StoryFrame[] = []
  let lastFocus: string | null = null

  story.beats.forEach((b, i) => {
    const where = `beats[${i}] (“${b.title}”)`
    const current = (b.show ?? []).map((n) => entityId(n, `${where}.show`))
    for (const id of current) if (shown.includes(id)) fail(`${where}: “${model.entities.find((e) => e.id === id)!.name}” is already shown in an earlier beat`)
    const before = new Set(shown)
    shown.push(...current)
    const on = new Set(shown)

    const drawn: DrawnLink[] = []
    for (const r of model.relationships) {
      if (shownRels.has(r.id) || !on.has(r.entityA) || !on.has(r.entityB)) continue
      const held = heldUntil.get(r.id)
      if (held !== undefined && held > i) continue
      shownRels.add(r.id)
      // From the end that was there before; between two new ones, from the one listed first; when both
      // were there (a held line), from the end that is not the beat's focus, so the line arrives at it.
      const focusId = b.focus ? byName.get(b.focus)?.id : undefined
      const from: 'A' | 'B' =
        before.has(r.entityA) && before.has(r.entityB)
          ? r.entityA === focusId
            ? 'B'
            : 'A'
          : before.has(r.entityA)
            ? 'A'
            : before.has(r.entityB)
              ? 'B'
              : current.indexOf(r.entityA) <= current.indexOf(r.entityB)
                ? 'A'
                : 'B'
      drawn.push({ id: r.id, from })
    }
    for (const [id, at] of heldUntil) if (at === i && !shownRels.has(id)) fail(`${where}.links: “${model.relationships.find((r) => r.id === id)!.name}” needs both its entities on screen`)

    const newInheritances: Id[] = []
    for (const inh of model.inheritances) {
      if (shownInhs.has(inh.id) || !on.has(inh.parentId) || !inh.childIds.every((c) => on.has(c))) continue
      shownInhs.add(inh.id)
      newInheritances.push(inh.id)
    }

    const currentGhosts: string[] = []
    for (const g of b.ghosts ?? []) {
      if (!g.name) fail(`${where}: a ghost needs a name`)
      if (byName.has(g.name) || ghosts.some((x) => x.name === g.name)) fail(`${where}: ghost “${g.name}” has the name of an entity or an earlier ghost`)
      const linkIds = (g.links ?? []).map((n) => entityId(n, `${where}: ghost “${g.name}”.links`))
      for (const id of linkIds) if (!on.has(id)) fail(`${where}: ghost “${g.name}” links to an entity that is not on screen yet`)
      const p: PlacedGhost = { ...g, id: ghostId(g.name), position: placeGhost(g, model, ghosts), linkIds }
      ghosts.push(p)
      currentGhosts.push(p.id)
    }
    for (const gr of b.ghostRows ?? []) {
      const id = entityId(gr.entity, `${where}.ghostRows`)
      if (!on.has(id)) fail(`${where}.ghostRows: “${gr.entity}” is not on screen yet`)
      ghostRows[id] = [...(ghostRows[id] ?? []), ...gr.rows]
    }

    let focus: string | null = null
    if (b.focus) {
      const e = byName.get(b.focus)
      const g = ghosts.find((x) => x.name === b.focus)
      if (e && on.has(e.id)) focus = e.id
      else if (g) focus = g.id
      else fail(`${where}.focus: “${b.focus}” is not on screen in this beat`)
    } else if (!b.overview) focus = current[0] ?? currentGhosts[0] ?? null

    const rowEntities = (b.ghostRows ?? []).map((gr) => byName.get(gr.entity)!.id)
    const beatNodes = [...current, ...currentGhosts, ...rowEntities, ...(focus ? [focus] : [])]
    // The lines of this beat come from somewhere: that entity stays in the picture.
    const sources = drawn.map((d) => {
      const r = model.relationships.find((x) => x.id === d.id)!
      return d.from === 'A' ? r.entityA : r.entityB
    })
    const ghostLinks = currentGhosts.flatMap((id) => ghosts.find((g) => g.id === id)!.linkIds)
    // A new inheritance is seen whole: its symbol, the parent and every child.
    const family = newInheritances.flatMap((id) => {
      const inh = model.inheritances.find((x) => x.id === id)!
      return [id, inh.parentId, ...inh.childIds]
    })
    const fit = b.overview ? [] : [...new Set([...beatNodes, ...sources, ...family, ...ghostLinks, ...(beatNodes.length ? [] : lastFocus ? [lastFocus] : [])])]

    frames.push({
      beat: b,
      model: snapshot(model, on, shownRels, shownInhs),
      current,
      drawn,
      newInheritances,
      ghosts: ghosts.slice(),
      currentGhosts,
      ghostRows: structuredClone(ghostRows),
      focus,
      fit,
    })
    if (focus) lastFocus = focus
  })
  return frames
}

function snapshot(model: Model, entities: Set<Id>, rels: Set<Id>, inhs: Set<Id>): Model {
  return {
    ...model,
    entities: model.entities.filter((e) => entities.has(e.id)),
    relationships: model.relationships.filter((r) => rels.has(r.id)),
    inheritances: model.inheritances.filter((i) => inhs.has(i.id)),
  }
}

/** Entities of the model that no beat shows (worth a warning: the story never gets to them). */
export function untold(story: Story, model: Model = story.model!): string[] {
  const told = new Set(story.beats.flatMap((b) => b.show ?? []))
  return model.entities.filter((e) => !told.has(e.name)).map((e) => e.name)
}

// ---- Editing (#31): a draft from the model, beat edits, the file ----

/** The story as a file: empty fields left out, the model inside (a story file can be sent alone). */
export function serializeStory(story: Story): string {
  const beats = story.beats.map((b) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined || v === false || v === '' || (Array.isArray(v) && !v.length)) continue
      out[k] = Array.isArray(v) && v.length === 1 && (k === 'quote' || k === 'text') ? v[0] : v
    }
    return out
  })
  const out: Record<string, unknown> = { format: STORY_FORMAT, version: STORY_VERSION, title: story.title }
  if (story.model) out.model = JSON.parse(serializeModel(story.model)) as unknown
  out.beats = beats
  return JSON.stringify(out, null, 2) + '\n'
}

/**
 * A first story over a model: an intro, one beat per entity in an order a reader can follow (an
 * entity comes after the ones it hangs on — the “1” side of a 1:n, the parent of a dependent or of an
 * inheritance — and next to what is already on screen), and the whole model at the end. The children
 * of an inheritance come together. Entity comments become the beats' text; the rest is for the author.
 */
export function draftStory(model: Model): Story {
  const parents = new Map<Id, Set<Id>>(model.entities.map((e) => [e.id, new Set<Id>()]))
  const links = new Map<Id, Set<Id>>(model.entities.map((e) => [e.id, new Set<Id>()]))
  for (const r of model.relationships) {
    if (r.entityA === r.entityB) continue
    links.get(r.entityA)?.add(r.entityB)
    links.get(r.entityB)?.add(r.entityA)
    const parentSide: Side | null = r.dependentSide
      ? r.dependentSide === 'A' ? 'B' : 'A'
      : r.cardinalityA.max === 1 && r.cardinalityB.max === 'n' ? 'A'
        : r.cardinalityB.max === 1 && r.cardinalityA.max === 'n' ? 'B'
          : null
    if (parentSide === 'A') parents.get(r.entityB)?.add(r.entityA)
    if (parentSide === 'B') parents.get(r.entityA)?.add(r.entityB)
  }
  for (const inh of model.inheritances)
    for (const c of inh.childIds) {
      parents.get(c)?.add(inh.parentId)
      links.get(c)?.add(inh.parentId)
      links.get(inh.parentId)?.add(c)
    }

  const told = new Set<Id>()
  const order: Id[][] = []
  const index = new Map(model.entities.map((e, i) => [e.id, i]))
  while (told.size < model.entities.length) {
    let best: Id | null = null
    let bestKey: number[] = []
    for (const e of model.entities) {
      if (told.has(e.id)) continue
      const ps = [...parents.get(e.id)!]
      const key = [
        ps.every((p) => told.has(p)) ? 1 : 0,
        [...links.get(e.id)!].filter((x) => told.has(x)).length,
        // When nothing ties it to the screen yet: the entity most other things hang on first.
        links.get(e.id)!.size,
        -index.get(e.id)!,
      ]
      const k = key.findIndex((v, j) => v !== bestKey[j])
      if (!best || (k >= 0 && key[k] > bestKey[k])) {
        best = e.id
        bestKey = key
      }
    }
    const inh = model.inheritances.find((i) => i.childIds.includes(best!))
    const group = inh ? inh.childIds.filter((c) => !told.has(c)) : [best!]
    group.forEach((g) => told.add(g))
    order.push(group)
  }

  const name = (id: Id) => model.entities.find((e) => e.id === id)!.name
  const beats: StoryBeat[] = [
    { title: model.name || 'The model', ...(model.comment ? { text: model.comment } : {}) },
    ...order.map((group) => {
      const comments = group.map((id) => model.entities.find((e) => e.id === id)!.comment).filter((c): c is string => !!c)
      return { title: group.map(name).join(', '), show: group.map(name), ...(comments.length ? { text: comments } : {}) }
    }),
    { title: 'The whole model', overview: true },
  ]
  return { title: model.name || 'Story', model, beats }
}

/** An empty beat after beat `at`. */
export function insertBeat(story: Story, at: number): Story {
  const beats = story.beats.slice()
  beats.splice(at + 1, 0, { title: 'New beat' })
  return { ...story, beats }
}

/**
 * Removes beat `at`. Its entities are not lost: they move to the next beat (to the previous one when
 * it was the last), so the story still shows the whole model. Its held lines, ghosts and focus go.
 */
export function removeBeat(story: Story, at: number): Story {
  if (story.beats.length <= 1) return story
  const gone = story.beats[at]
  const beats = story.beats.filter((_, k) => k !== at)
  if (gone.show?.length) {
    const to = at < beats.length ? at : at - 1
    beats[to] = { ...beats[to], show: [...gone.show, ...(beats[to].show ?? [])] }
  }
  return { ...story, beats }
}

/** Swaps beat `at` with the one before (`-1`) or after (`1`). */
export function moveBeat(story: Story, at: number, dir: -1 | 1): Story {
  const to = at + dir
  if (to < 0 || to >= story.beats.length) return story
  const beats = story.beats.slice()
  ;[beats[at], beats[to]] = [beats[to], beats[at]]
  return { ...story, beats }
}

export function updateBeat(story: Story, at: number, patch: Partial<StoryBeat>): Story {
  return { ...story, beats: story.beats.map((b, k) => (k === at ? { ...b, ...patch } : b)) }
}

/** Puts an entity into beat `at`, taking it out of the beat that showed it before. */
export function showIn(story: Story, at: number, entity: string): Story {
  const beats = story.beats.map((b, k) =>
    k === at ? { ...b, show: [...(b.show ?? []).filter((n) => n !== entity), entity] } : b.show?.includes(entity) ? { ...b, show: b.show.filter((n) => n !== entity) } : b,
  )
  return { ...story, beats }
}

/** Texts written in one box, one per paragraph (a blank line between them). */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}
