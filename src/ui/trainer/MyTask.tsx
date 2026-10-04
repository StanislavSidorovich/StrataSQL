// “My task”: the student's own task text. A dialog to paste or load it, the text with phrases the
// student tags by selecting them, and the coverage list (tagged phrases vs the model).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { coverage, MARK_TAGS, MY_TASK_ID, paragraphs, type Mark, type MarkTag } from '../../data/mytask'
import { useEditor } from '../store'
import { confirmDiscardTask, useTrainer } from './trainerStore'

const useDialog = create<{ open: boolean; startAfter: boolean }>()(() => ({ open: false, startAfter: false }))

/** Opens the dialog to write, paste or load the own task text. */
export function openMyTaskDialog(startAfter: boolean) {
  useDialog.setState({ open: true, startAfter })
}

/** Examples menu → My task: the saved text opens as a task, otherwise the dialog asks for one. */
export function openMyTask() {
  if (!useTrainer.getState().myTask) return openMyTaskDialog(true)
  if (confirmDiscardTask()) useTrainer.getState().startExercise(MY_TASK_ID)
}

export function MyTaskDialog() {
  const { open, startAfter } = useDialog()
  const myTask = useTrainer((s) => s.myTask)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    setTitle(myTask?.title ?? '')
    setText(myTask?.text ?? '')
    setError(null)
    // Only when the dialog opens: the stored task fills the fields.
  }, [open])
  if (!open) return null
  const close = () => useDialog.setState({ open: false })
  const load = async (f: File) => {
    if (f.size > 200_000) return setError('This file is too large for a task text (over 200 KB).')
    const t = await f.text()
    setText(t)
    if (!title.trim()) setTitle(f.name.replace(/\.(txt|md|markdown)$/i, ''))
    setError(null)
  }
  const save = () => {
    if (paragraphs(text).length === 0) return setError('Paste or type the task text first.')
    useTrainer.getState().saveMyTask(title, text)
    close()
    const s = useTrainer.getState().session
    if (startAfter && s?.caseId !== MY_TASK_ID && confirmDiscardTask()) useTrainer.getState().startExercise(MY_TASK_ID)
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="My task" onClick={close} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal mytask-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>My task</h2>
        <p className="muted text-sm">
          Paste the text of your own task (homework, a project, an idea) or load a <b>.txt</b> / <b>.md</b> file. It stays in this browser. There is no reference answer: you tag the phrases yourself, and StrataSQL shows what is not in your model yet.
        </p>
        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My task" />
        </label>
        <label className="field">
          <span className="field-label">Task text</span>
          <textarea className="input mytask-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="A small library wants a database of its books…" autoFocus />
        </label>
        {error && <p className="mytask-error">{error}</p>}
        <input
          ref={file}
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void load(f)
            e.target.value = ''
          }}
        />
        <div className="welcome-foot">
          <button type="button" className="btn btn-small" onClick={() => file.current?.click()}>
            Load .txt / .md…
          </button>
          <span className="flex gap-2">
            <button type="button" className="btn btn-small" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-small btn-primary" onClick={save}>
              {startAfter ? 'Save and start' : 'Save'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** The picker entry: start, edit or create the own task. */
export function MyTaskEntry() {
  const myTask = useTrainer((s) => s.myTask)
  return (
    <section className="trainer-case">
      <div className="flex items-baseline gap-2">
        <h3>{myTask ? myTask.title : 'My task'}</h3>
        <span className="ml-auto flex gap-1">
          {myTask && (
            <button type="button" className="btn btn-small" onClick={() => openMyTaskDialog(false)}>
              Edit text
            </button>
          )}
          <button
            type="button"
            className="btn btn-small"
            onClick={openMyTask}
          >
            {myTask ? 'Start' : 'Add my text…'}
          </button>
        </span>
      </div>
      <p className="text-xs">{myTask ? `Your own text · ${myTask.marks.length} tagged phrase(s)` : 'Your own task text (paste or .txt / .md): tag its phrases, model it, see what is missing.'}</p>
    </section>
  )
}

interface Pending {
  p: number
  start: number
  end: number
  text: string
  /** An existing mark that was clicked. */
  index?: number
}

/** Offset of a DOM point inside a paragraph element, in characters of its text. */
function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange()
  r.setStart(el, 0)
  r.setEnd(node, offset)
  return r.toString().length
}

/** The task text: select words to tag them, click a tagged phrase to change or remove its tag. */
export function MyTaskText() {
  const myTask = useTrainer((s) => s.myTask)!
  const { markPhrase, unmarkPhrase } = useTrainer.getState()
  const [pending, setPending] = useState<Pending | null>(null)
  const ps = useMemo(() => paragraphs(myTask.text), [myTask.text])

  const onSelect = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const pa = (range.startContainer.parentElement ?? null)?.closest<HTMLElement>('[data-p]')
    const pb = (range.endContainer.parentElement ?? null)?.closest<HTMLElement>('[data-p]')
    if (!pa || pa !== pb) return
    const p = Number(pa.dataset.p)
    let start = offsetIn(pa, range.startContainer, range.startOffset)
    let end = offsetIn(pa, range.endContainer, range.endOffset)
    const t = ps[p]
    // Trim spaces and punctuation at the edges, so “books, ” is “books”.
    while (start < end && /[\s.,;:!?()"“”'«»—–-]/.test(t[start])) start++
    while (end > start && /[\s.,;:!?()"“”'«»—–-]/.test(t[end - 1])) end--
    if (end <= start) return
    setPending({ p, start, end, text: t.slice(start, end) })
  }

  const apply = (tag: MarkTag) => {
    if (!pending) return
    markPhrase({ p: pending.p, start: pending.start, end: pending.end, tag, text: pending.text })
    setPending(null)
    window.getSelection()?.removeAllRanges()
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const t = MARK_TAGS.find((x) => x.key === e.key)
      if (t) {
        e.preventDefault()
        apply(t.id)
      } else if (e.key === 'Escape') setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <div className="trainer-spec walk-spec mytask-text" onMouseUp={onSelect}>
        {ps.map((t, p) => {
          const marks = myTask.marks.map((m, index) => ({ m, index })).filter((x) => x.m.p === p)
          const parts: ReactNode[] = []
          let at = 0
          for (const { m, index } of marks) {
            if (m.start > at) parts.push(t.slice(at, m.start))
            parts.push(
              <span
                key={index}
                role="button"
                tabIndex={0}
                className={`spec-span tag-${m.tag} ${pending?.index === index ? 'is-open' : ''}`}
                title={`${m.tag} — click to change or remove`}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={() => setPending({ p, start: m.start, end: m.end, text: m.text, index })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPending({ p, start: m.start, end: m.end, text: m.text, index }))}
              >
                {t.slice(m.start, m.end)}
              </span>,
            )
            at = m.end
          }
          if (at < t.length) parts.push(t.slice(at))
          return (
            <p key={p} data-p={p}>
              {parts}
            </p>
          )
        })}
      </div>
      {pending ? (
        <div className="mytask-tagbar" role="toolbar" aria-label="Tag the selected phrase">
          <span className="text-xs">
            Tag “<b>{pending.text.length > 40 ? pending.text.slice(0, 40) + '…' : pending.text}</b>” as:
          </span>
          <div className="tag-legend">
            {MARK_TAGS.map((t) => (
              <button key={t.id} type="button" className={`btn btn-small spec-tag-btn tag-${t.id}`} onClick={() => apply(t.id)} title={`Key ${t.key}`}>
                {t.label}
              </button>
            ))}
            {pending.index !== undefined && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  unmarkPhrase(pending.index!)
                  setPending(null)
                }}
              >
                Remove tag
              </button>
            )}
            <button type="button" className="btn btn-small" onClick={() => setPending(null)} title="Esc">
              ✕
            </button>
          </div>
        </div>
      ) : (
        <p className="muted text-xs">Select words in the text to tag them (entity, attribute, identifier, relationship…). Keys 1–6 pick the tag.</p>
      )}
    </>
  )
}

/** Tagged phrases vs the model, both ways. */
export function MyTaskCoverage() {
  const myTask = useTrainer((s) => s.myTask)!
  const model = useEditor((s) => s.model)
  const c = useMemo(() => coverage(myTask.marks, model), [myTask.marks, model])
  const select = (name: string) => {
    const e = model.entities.find((x) => x.name === name)
    if (e) useEditor.getState().select({ kind: 'entity', id: e.id })
  }
  if (myTask.marks.length === 0) return null
  const tagged = myTask.marks.length
  return (
    <>
      <h3 className="trainer-h3">Your tags and your model</h3>
      {c.missing.length === 0 && c.unmentioned.length === 0 ? (
        <p className="trainer-done">✓ Every tagged phrase is in the model, and every entity and attribute comes from a tagged phrase.</p>
      ) : (
        <p className="muted text-xs">
          {tagged - c.missing.length} of {tagged} tagged phrases found in the model. Names are compared by their words (<i>books</i> ~ Book, <i>card number</i> ~ Card_number).
        </p>
      )}
      {c.missing.length > 0 && (
        <>
          <p className="text-xs font-semibold">Tagged, not in the model yet</p>
          <ul className="mytask-list">
            {c.missing.map(({ mark, why }, k) => (
              <li key={k}>
                <span className={`spec-span tag-${mark.tag}`}>{mark.text}</span> <span className="muted">— {why}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {c.unmentioned.length > 0 && (
        <>
          <p className="text-xs font-semibold">In the model, no tagged phrase names it</p>
          <ul className="mytask-list">
            {c.unmentioned.map((u, k) => (
              <li key={k}>
                <button type="button" className="link" onClick={() => select(u.entity ?? u.name)}>
                  {u.entity ? `${u.entity}.${u.name}` : u.name}
                </button>{' '}
                <span className="muted">— {u.kind === 'entity' ? 'tag the phrase it comes from, or is it extra?' : 'from the text? Tag it — or fine for an own id'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {c.rules.length > 0 && (
        <>
          <p className="text-xs font-semibold">Rules to check yourself (keys, M, the Sandbox)</p>
          <ul className="mytask-list">
            {c.rules.map((m: Mark, k) => (
              <li key={k}>
                <span className="spec-span tag-rule">{m.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
