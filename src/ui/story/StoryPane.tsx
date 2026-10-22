// Story pane: the beats as a table of contents, Back / Next and Present. The words of each beat are on
// the canvas, next to what they explain; this column is for the presenter. While presenting, the
// columns and the toolbar hide and a small bar at the bottom keeps the controls. ✎ Edit opens the
// beat editor (StoryEditor) above the list of beats.

import { useEffect, useState } from 'react'
import { untold } from '../../data/story'
import { saveStory } from '../fileSave'
import { useEditor } from '../store'
import { StoryEditor } from './StoryEditor'
import { useStory } from './storyStore'

/** ← → (also Space, PageUp/PageDown, the clicker keys), Home / End; Esc leaves full screen. */
export function useStoryKeys() {
  const on = useStory((s) => !!s.story)
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return
      const { beat, frames, goTo, presenting, setPresenting } = useStory.getState()
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) goTo(beat + 1)
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) goTo(beat - 1)
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(frames.length - 1)
      else if (e.key === 'Escape' && presenting) setPresenting(false)
      else return
      e.preventDefault()
    }
    // Leaving full screen with the browser's own Esc ends presenting too.
    const onFull = () => {
      if (!document.fullscreenElement && useStory.getState().presenting) useStory.getState().setPresenting(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [on])
}

export function StoryPane() {
  const story = useStory((s) => s.story)
  const frames = useStory((s) => s.frames)
  const beat = useStory((s) => s.beat)
  const editing = useStory((s) => s.editing)
  const dirty = useStory((s) => s.dirty)
  const [saved, setSaved] = useState<string | null>(null)
  const { goTo, setPresenting, setEditing, exit } = useStory.getState()
  if (!story) return null
  const last = frames.length - 1
  const missing = untold(story, story.model ?? useEditor.getState().trainerBackup ?? useEditor.getState().model)
  const onSave = () =>
    saveStory()
      .then((msg) => msg && setSaved(msg))
      .catch((err: Error) => useEditor.getState().showError(`Could not save the story: ${err.message}`))
  return (
    <aside className="trainer-pane" aria-label="Story">
      <div className="trainer-header">
        <h2>▶ {story.title}</h2>
        <button
          type="button"
          className={`btn btn-small ml-auto ${editing ? 'btn-primary' : ''}`}
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          title="Edit the beats: their words, what each one brings in, their order"
        >
          ✎ Edit
        </button>
        <button type="button" className="btn btn-small" onClick={onSave} title="Save the story with its model as a .strata-story.json file (Ctrl+S)">
          Save{dirty ? ' •' : ''}
        </button>
        <button type="button" className="btn btn-small" onClick={exit} title="Close the story and get your own model back">
          Exit
        </button>
      </div>
      <div className="trainer-body">
        <div className="flex items-baseline justify-between text-xs">
          <span className="walk-kind">Story</span>
          <span className="muted">
            Beat {beat} of {last}
          </span>
        </div>
        <div className="walk-progress story-progress" aria-hidden>
          <div style={{ width: `${(100 * beat) / Math.max(1, last)}%` }} />
        </div>
        <div className="walk-nav">
          <button type="button" className="btn" onClick={() => goTo(beat - 1)} disabled={beat === 0} title="Previous beat (←)">
            ← Back
          </button>
          <button type="button" className="btn btn-primary" onClick={() => goTo(beat + 1)} disabled={beat === last} title="Next beat (→ or Space)" autoFocus={!editing}>
            {beat === 0 ? 'Start →' : 'Next →'}
          </button>
          <button type="button" className="btn ml-auto" onClick={() => setPresenting(true)} title="Full screen without the toolbar and columns: for showing the story or recording it">
            ⛶ Present
          </button>
        </div>
        {saved && !dirty && <p className="muted text-xs">{saved}</p>}
        {editing && <StoryEditor />}
        <ol className="story-beats">
          {frames.map((f, k) => (
            <li key={k}>
              <button type="button" className={k === beat ? 'is-now' : k < beat ? 'is-past' : ''} onClick={() => goTo(k)} aria-current={k === beat ? 'step' : undefined}>
                <span className="story-beat-n">{k}</span>
                <span>{f.beat.title}</span>
                {f.currentGhosts.length > 0 && <span className="story-beat-ghost" title="Not in the model yet">◌</span>}
              </button>
            </li>
          ))}
        </ol>
        {missing.length > 0 && (
          <p className="muted text-xs">Not in any beat (never shown): {missing.join(', ')}.{editing && ' Add them to a beat with + entity.'}</p>
        )}
        <p className="muted text-xs">
          Keys: ← → or Space, Home / End. <b>Present</b> hides everything but the diagram (Esc to leave); a screen recorder in that mode gives a video of
          the story.
        </p>
      </div>
    </aside>
  )
}

/** While presenting: a quiet bar at the bottom (it fades out; move the mouse over it to use it). */
export function PresenterBar() {
  const presenting = useStory((s) => s.presenting)
  const beat = useStory((s) => s.beat)
  const last = useStory((s) => s.frames.length - 1)
  const { goTo, setPresenting } = useStory.getState()
  if (!presenting) return null
  return (
    <>
      <div className="story-presenter-progress" aria-hidden>
        <div style={{ width: `${(100 * beat) / Math.max(1, last)}%` }} />
      </div>
      <div className="story-presenter-bar" role="toolbar" aria-label="Story">
        <button type="button" onClick={() => goTo(beat - 1)} disabled={beat === 0} aria-label="Previous beat">
          ‹
        </button>
        <span>
          {beat} / {last}
        </span>
        <button type="button" onClick={() => goTo(beat + 1)} disabled={beat === last} aria-label="Next beat">
          ›
        </button>
        <button type="button" onClick={() => setPresenting(false)} title="Leave presenting (Esc)" aria-label="Leave presenting">
          ✕
        </button>
      </div>
    </>
  )
}
