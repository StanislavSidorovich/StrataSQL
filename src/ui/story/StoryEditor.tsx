// The beat editor (#31): the story pane's card for the beat on screen. Its words, the entities it
// brings in, what the comment points at; add, move and delete beats. Ghosts, held lines and status
// strips are kept as they are (written in the file for now). Every edit goes through `edit`, which
// refuses one that would break the story and says why.

import { useState } from 'react'
import { insertBeat, moveBeat, quotesOf, removeBeat, showIn, splitParagraphs, textsOf, updateBeat, type StoryBeat } from '../../data/story'
import { useEditor } from '../store'
import { useStory } from './storyStore'

/** A text box for one or more paragraphs (a blank line between them). It keeps what is typed while it is typed. */
function Paragraphs({ label, value, onChange, rows, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; rows: number; placeholder: string }) {
  const [text, setText] = useState(value.join('\n\n'))
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea
        className="input"
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          onChange(splitParagraphs(e.target.value))
        }}
      />
    </label>
  )
}

export function StoryEditor() {
  const story = useStory((s) => s.story)!
  const frames = useStory((s) => s.frames)
  const at = useStory((s) => s.beat)
  const error = useStory((s) => s.editError)
  const { edit } = useStory.getState()
  const model = story.model ?? useEditor.getState().trainerBackup ?? useEditor.getState().model
  const beat = story.beats[at]
  const frame = frames[at]
  if (!beat || !frame) return null

  const set = (patch: Partial<StoryBeat>) => edit((s) => updateBeat(s, at, patch))
  const shown = beat.show ?? []
  const beatOf = new Map(story.beats.flatMap((b, k) => (b.show ?? []).map((n) => [n, k] as const)))
  const notYet = model.entities.filter((e) => !beatOf.has(e.name)).map((e) => e.name)
  const elsewhere = model.entities.filter((e) => beatOf.has(e.name) && beatOf.get(e.name) !== at).map((e) => e.name)
  const onScreen = frame.model.entities.map((e) => e.name)
  const ghostNames = frame.ghosts.map((g) => g.name)
  const kept = [
    beat.ghosts?.length && `${beat.ghosts.length} ghost${beat.ghosts.length > 1 ? 's' : ''}`,
    beat.ghostRows?.length && 'planned rows',
    beat.links?.length && `held line${beat.links.length > 1 ? 's' : ''} ${beat.links.join(', ')}`,
    beat.status && 'a status strip',
  ].filter(Boolean)

  return (
    <section className="story-editor" aria-label={`Edit beat ${at}`}>
      <label className="field">
        <span className="field-label">Story title</span>
        <input className="input" value={story.title} onChange={(e) => edit((s) => ({ ...s, title: e.target.value }))} />
      </label>

      <div className="story-editor-card" key={at}>
        <div className="flex items-center gap-1">
          <span className="walk-kind">Beat {at}</span>
          <button type="button" className="btn btn-small ml-auto" disabled={at === 0} onClick={() => edit((s) => moveBeat(s, at, -1), at - 1)} title="Move this beat earlier">
            ↑
          </button>
          <button type="button" className="btn btn-small" disabled={at === story.beats.length - 1} onClick={() => edit((s) => moveBeat(s, at, 1), at + 1)} title="Move this beat later">
            ↓
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={story.beats.length <= 1}
            onClick={() => edit((s) => removeBeat(s, at), Math.min(at, story.beats.length - 2))}
            title="Delete this beat; the entities it shows move to the next beat"
          >
            Delete
          </button>
        </div>

        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={beat.title} onChange={(e) => set({ title: e.target.value })} />
        </label>

        <div className="field">
          <span className="field-label">Brings in</span>
          <div className="chips">
            {shown.map((n) => (
              <span key={n} className="chip on story-chip">
                {n}
                <button type="button" aria-label={`Take ${n} out of this beat`} title="Take it out of this beat" onClick={() => set({ show: shown.filter((x) => x !== n) })}>
                  ×
                </button>
              </span>
            ))}
            {(notYet.length > 0 || elsewhere.length > 0) && (
              <select
                className="input story-add"
                value=""
                aria-label="Bring in an entity"
                onChange={(e) => e.target.value && edit((s) => showIn(s, at, e.target.value))}
              >
                <option value="">+ entity…</option>
                {notYet.length > 0 && (
                  <optgroup label="Not in the story yet">
                    {notYet.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </optgroup>
                )}
                {elsewhere.length > 0 && (
                  <optgroup label="Move here from another beat">
                    {elsewhere.map((n) => (
                      <option key={n} value={n}>
                        {n} (beat {beatOf.get(n)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={!!beat.overview} onChange={(e) => set({ overview: e.target.checked || undefined, ...(e.target.checked ? { focus: undefined } : {}) })} />
          The whole model at once (nothing dimmed)
        </label>

        {!beat.overview && (onScreen.length > 0 || ghostNames.length > 0) && (
          <label className="field">
            <span className="field-label">The comment points at</span>
            <select className="input" value={beat.focus ?? ''} onChange={(e) => set({ focus: e.target.value || undefined })}>
              <option value="">{shown[0] ? `${shown[0]} (the first one it brings in)` : 'nothing: the comment stands in the corner'}</option>
              {[...onScreen, ...ghostNames]
                .filter((n) => n !== shown[0])
                .map((n) => (
                  <option key={n}>{n}</option>
                ))}
            </select>
          </label>
        )}

        <Paragraphs label="Words of the task (quote)" rows={2} value={quotesOf(beat)} onChange={(v) => set({ quote: v })} placeholder="The sentence of the task this beat answers" />
        <Paragraphs
          label="What to say"
          rows={4}
          value={textsOf(beat)}
          onChange={(v) => set({ text: v })}
          placeholder="Why the model looks like this here. **bold**, *italic*, `code`; a blank line starts a new paragraph"
        />
        {kept.length > 0 && <p className="muted text-xs">Also in this beat (edit them in the file): {kept.join(', ')}.</p>}
        {error && (
          <p className="story-editor-error" role="alert">
            Not changed: {error}
          </p>
        )}
      </div>

      <button type="button" className="btn btn-small" onClick={() => edit((s) => insertBeat(s, at), at + 1)}>
        + Beat after this one
      </button>
    </section>
  )
}
