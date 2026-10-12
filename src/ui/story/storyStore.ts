// Story mode: a model told beat by beat (data/story.ts). Like a walkthrough, the canvas shows a part
// of the model while the user's own model waits in `trainerBackup`; the story itself is kept in the
// browser, so a reload comes back to the same beat.

import { create } from 'zustand'
import type { Id } from '../../core/metamodel'
import { parseStory, storyFrames, type Story, type StoryFrame } from '../../data/story'
import { useEditor } from '../store'
import { leaveTrainer, useTrainer } from '../trainer/trainerStore'

const STORY_KEY = 'stratasql.story'

interface StoryState {
  story: Story | null
  frames: StoryFrame[]
  beat: number
  /** Full screen without the toolbar and the side columns: for showing to a group or recording. */
  presenting: boolean
  goTo: (beat: number) => void
  setPresenting: (on: boolean) => void
  exit: () => void
}

export const useStory = create<StoryState>()((set, get) => ({
  story: null,
  frames: [],
  beat: 0,
  presenting: false,

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

  exit() {
    const { trainerBackup } = useEditor.getState()
    if (trainerBackup)
      useEditor.setState({ model: trainerBackup, trainerBackup: null, doc: useEditor.getState().doc + 1, past: [], future: [], selection: null, focusedIssue: null, walkthrough: null })
    else useEditor.setState({ walkthrough: null })
    drop()
  },
}))

/** Ends the story without touching the canvas. */
function drop() {
  useStory.getState().setPresenting(false)
  useStory.setState({ story: null, frames: [], beat: 0 })
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

let storyText = ''
function save() {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify({ text: storyText, beat: useStory.getState().beat }))
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
  useStory.setState({ story, frames: storyFrames(story, story.model ?? own), beat: 0 })
  useStory.getState().goTo(0)
  return story
}

/** After a reload: back to the beat the story was at. */
export function restoreStory() {
  try {
    const saved = localStorage.getItem(STORY_KEY)
    if (!saved) return
    const { text, beat } = JSON.parse(saved) as { text: string; beat: number }
    const own = useEditor.getState().model
    const story = parseStory(text, own)
    storyText = text
    useStory.setState({ story, frames: storyFrames(story, story.model ?? own) })
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
