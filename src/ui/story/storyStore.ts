// Story mode: a model told beat by beat (data/story.ts). Like a walkthrough, the canvas shows a part
// of the model while the user's own model waits in `trainerBackup`; the story itself is kept in the
// browser, so a reload comes back to the same beat. Editing (#31) changes the story in place: every
// edit is checked by building the frames again, and an edit that would break the story is refused.

import { create } from 'zustand'
import type { Id, Model } from '../../core/metamodel'
import { draftStory, parseStory, serializeStory, storyFrames, type Story, type StoryFrame } from '../../data/story'
import { useEditor } from '../store'
import { leaveTrainer, useTrainer } from '../trainer/trainerStore'

const STORY_KEY = 'stratasql.story'

interface StoryState {
  story: Story | null
  frames: StoryFrame[]
  beat: number
  /** Full screen without the toolbar and the side columns: for showing to a group or recording. */
  presenting: boolean
  /** The beat editor is open in the story pane. */
  editing: boolean
  /** Edited since it was opened or saved. */
  dirty: boolean
  /** Why the last edit was refused (an entity used before it is shown, …). */
  editError: string | null
  goTo: (beat: number) => void
  setPresenting: (on: boolean) => void
  setEditing: (on: boolean) => void
  /** Applies an edit to the story; refused (with `editError`) when the story would not play. */
  edit: (change: (s: Story) => Story, beat?: number) => boolean
  /** False: the user kept an unsaved story open. */
  exit: () => boolean
}

export const useStory = create<StoryState>()((set, get) => ({
  story: null,
  frames: [],
  beat: 0,
  presenting: false,
  editing: false,
  dirty: false,
  editError: null,

  goTo(beat) {
    const { frames } = get()
    if (!frames.length) return
    const at = Math.max(0, Math.min(beat, frames.length - 1))
    const editor = useEditor.getState()
    useEditor.setState({
      model: frames[at].model,
      trainerBackup: editor.trainerBackup ?? editor.model,
      doc: editor.doc + 1,
      past: [],
      future: [],
      selection: null,
      tableSelection: null,
      focusedIssue: null,
      view: 'cdm',
      error: null,
      // Mutes the linter and the docks under the canvas, as in a walkthrough; the story marks its own elements.
      walkthrough: { spotlight: [] },
    })
    set({ beat: at })
    save()
  },

  setPresenting(presenting) {
    set({ presenting })
    try {
      if (presenting && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {})
      else if (!presenting && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
    } catch {
      /* no full screen (iframe, old browser): presenting still hides the bars */
    }
  },

  setEditing(editing) {
    set({ editing, editError: null })
    if (editing) get().setPresenting(false)
  },

  edit(change, beat) {
    const { story, beat: now } = get()
    if (!story) return false
    const next = change(story)
    let frames: StoryFrame[]
    try {
      frames = storyFrames(next, storyModel(next))
    } catch (e) {
      set({ editError: (e as Error).message })
      return false
    }
    storyText = serializeStory(next)
    const old = get().frames[now]?.model
    set({ story: next, frames, dirty: true, editError: null })
    const at = Math.max(0, Math.min(beat ?? now, frames.length - 1))
    // The canvas changes only when the entities or lines on it do (not while the words are typed).
    const same = (a?: Model, b?: Model) =>
      !!a && !!b && a.entities.map((e) => e.id).join() === b.entities.map((e) => e.id).join() && a.relationships.map((r) => r.id).join() === b.relationships.map((r) => r.id).join()
    if (at !== now || !same(old, frames[at].model)) get().goTo(at)
    else save()
    return true
  },

  exit() {
    if (get().dirty && !window.confirm('Close the story without saving your changes to it?')) return false
    const { trainerBackup } = useEditor.getState()
    if (trainerBackup)
      useEditor.setState({ model: trainerBackup, trainerBackup: null, doc: useEditor.getState().doc + 1, past: [], future: [], selection: null, focusedIssue: null, walkthrough: null })
    else useEditor.setState({ walkthrough: null })
    drop()
    return true
  },
}))

/** Ends the story without touching the canvas. */
function drop() {
  useStory.getState().setPresenting(false)
  useStory.setState({ story: null, frames: [], beat: 0, editing: false, dirty: false, editError: null })
  try {
    localStorage.removeItem(STORY_KEY)
  } catch {
    /* storage unavailable */
  }
}

// The trainer takes the canvas and the left column: the story ends. A task or walkthrough has already
// put its own model on the canvas (the user's model stays in trainerBackup); the picker shows the user's model.
useTrainer.subscribe((t, prev) => {
  if (!useStory.getState().story) return
  if (t.session && t.session !== prev.session) drop()
  else if (t.pickerOpen && !prev.pickerOpen) useStory.getState().exit()
})

/** The model a story is told over: its own, else the user's (waiting in trainerBackup while the story runs). */
function storyModel(story: Story): Model {
  const editor = useEditor.getState()
  return story.model ?? editor.trainerBackup ?? editor.model
}

let storyText = ''
function save() {
  try {
    const { beat, editing, dirty } = useStory.getState()
    localStorage.setItem(STORY_KEY, JSON.stringify({ text: storyText, beat, editing, dirty }))
  } catch {
    /* storage unavailable: the story does not survive a reload */
  }
}

/**
 * File → Open of a `.strata-story.json`: a running trainer task closes first; a story without a model
 * of its own is told over the open model. Throws a readable error. False: the user cancelled.
 */
export function openStoryFile(text: string): Story | null {
  if (!useStory.getState().story && !leaveTrainer()) return null
  const editor = useEditor.getState()
  const own = useStory.getState().story ? editor.trainerBackup ?? editor.model : editor.model
  const story = parseStory(text, own)
  storyText = text
  useStory.setState({ story, frames: storyFrames(story, story.model ?? own), beat: 0, editing: false, dirty: false, editError: null })
  useStory.getState().goTo(0)
  return story
}

/** File → New story from this model: a draft (data/story.ts `draftStory`), opened in the editor. */
export function newStoryFromModel(): Story | null {
  if (useStory.getState().story ? !useStory.getState().exit() : !leaveTrainer()) return null
  const model = useEditor.getState().model
  if (!model.entities.length) return null
  const story = draftStory(model)
  storyText = serializeStory(story)
  useStory.setState({ story, frames: storyFrames(story), beat: 0, editing: true, dirty: true, editError: null })
  useStory.getState().goTo(0)
  return story
}

/** The story as it is now, for Save story. */
export const currentStoryText = () => storyText

export function markStorySaved() {
  useStory.setState({ dirty: false })
  save()
}

/** After a reload: back to the beat the story was at. */
export function restoreStory() {
  try {
    const saved = localStorage.getItem(STORY_KEY)
    if (!saved) return
    const { text, beat, editing = false, dirty = false } = JSON.parse(saved) as { text: string; beat: number; editing?: boolean; dirty?: boolean }
    const own = useEditor.getState().model
    const story = parseStory(text, own)
    storyText = text
    useStory.setState({ story, frames: storyFrames(story, story.model ?? own), editing, dirty })
    useStory.getState().goTo(beat)
  } catch {
    try {
      localStorage.removeItem(STORY_KEY)
    } catch {
      /* storage unavailable */
    }
  }
}

/** The current frame, or null when no story runs. */
export function useFrame(): StoryFrame | null {
  return useStory((s) => (s.story ? (s.frames[s.beat] ?? null) : null))
}

/**
 * How an element looks in the current beat, as class names: `story-new` (animated in), `story-focus`
 * (the comment points at it), `story-dim` (an earlier beat's element), or '' (as usual).
 */
export function useStoryLook(id: Id | undefined): string {
  return useStory((s) => {
    const f = s.story ? s.frames[s.beat] : null
    if (!f || !id) return ''
    const out: string[] = []
    if (f.current.includes(id) || f.newInheritances.includes(id)) out.push('story-new')
    if (f.focus === id) out.push('story-focus')
    // Lit: this beat's elements, the entities its lines come from, and everything in an overview.
    if (!out.length && !f.beat.overview && !f.fit.includes(id)) out.push('story-dim')
    return out.join(' ')
  })
}

/** The relationship is drawn in this beat: the end it is drawn from. */
export function useStoryDraw(id: Id | undefined): 'A' | 'B' | null {
  return useStory((s) => (s.story && id ? (s.frames[s.beat]?.drawn.find((d) => d.id === id)?.from ?? null) : null))
}

/** Dashed rows of an entity (planned attributes), while a story shows them. */
export function useGhostRows(id: Id): string[] | undefined {
  return useStory((s) => (s.story ? s.frames[s.beat]?.ghostRows[id] : undefined))
}
