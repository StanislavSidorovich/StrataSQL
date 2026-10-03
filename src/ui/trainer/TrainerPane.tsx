// Trainer (SPEC §9): case picker and the side pane of an open task — levels 0–3.

import { useReactFlow } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compareModels, type CompareItem } from '../../core/compare'
import { CASES, caseById, hintsFor, LEVELS, phrasesFor, splitParagraph, TAGS, type Tag, type TrainerCase } from '../../data/cases'
import { applyAnswer, coach, referenceOf, type CoachState } from '../../data/coach'
import { progressKey, type Level } from '../../data/trainer'
import { richText } from '../help/HelpDrawer'
import { useEditor, type Selection } from '../store'
import { confirmDiscardTask, isRightTag, tagScore, useTrainer } from './trainerStore'
import { WalkthroughPane } from './Walkthrough'

const TAG_LABEL: Record<Tag, string> = Object.fromEntries(TAGS.map((t) => [t.id, t.label])) as Record<Tag, string>

/** Selects the current-model element that a reference key names (levels 0–1 show the reference itself). */
function selectRefKey(key: string | undefined) {
  if (!key) return
  const { model, select } = useEditor.getState()
  const kind = key.slice(0, key.indexOf(':'))
  const rest = key.slice(key.indexOf(':') + 1)
  let sel: Selection = null
  if (kind === 'entity' || kind === 'attribute') {
    const name = kind === 'attribute' ? rest.split('.')[0] : rest
    const e = model.entities.find((x) => x.name === name)
    if (e) sel = { kind: 'entity', id: e.id }
  } else if (kind === 'relationship') {
    const r = model.relationships.find((x) => x.name === rest)
    if (r) sel = { kind: 'relationship', id: r.id }
  } else if (kind === 'inheritance') {
    const i = model.inheritances.find((x) => x.name === rest)
    if (i) sel = { kind: 'inheritance', id: i.id }
  }
  useEditor.getState().setView('cdm')
  select(sel)
}

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`difficulty ${n} of 3`}>
      {'★'.repeat(n)}
      <span className="muted">{'★'.repeat(3 - n)}</span>
    </span>
  )
}

export function TrainerPane() {
  const session = useTrainer((s) => s.session)
  const pickerOpen = useTrainer((s) => s.pickerOpen)
  if (!session || pickerOpen) return <CasePicker />
  const c = caseById(session.caseId)!
  if (session.walk !== undefined) return <WalkthroughPane c={c} step={session.walk} />
  return <TaskPane c={c} level={session.level} />
}

function CasePicker() {
  const progress = useTrainer((s) => s.progress)
  const session = useTrainer((s) => s.session)
  const { start, openPicker } = useTrainer.getState()
  return (
    <aside className="trainer-pane" aria-label="Trainer">
      <div className="trainer-header">
        <h2>Trainer</h2>
        <button type="button" className="btn btn-small ml-auto" onClick={() => (session ? openPicker(false) : useTrainer.getState().exit())}>
          {session ? 'Back to task' : 'Close'}
        </button>
      </div>
      <div className="trainer-body">
        <p className="muted">
          <b>▶ Watch it built</b> step by step, then practise: worked example → tag the text → complete the model → build it yourself. The cases go from easy to hard. Your own model is kept aside and comes back when you close the trainer.
        </p>
        {CASES.map((c) => (
          <section key={c.id} className="trainer-case">
            <div className="flex items-baseline gap-2">
              <h3>{c.title}</h3>
              <Stars n={c.difficulty} />
            </div>
            <p className="muted text-xs">{c.source}</p>
            <p className="text-xs">{c.concepts.join(' · ')}</p>
            <div className="trainer-levels">
              <button type="button" className="btn btn-small btn-primary" onClick={() => confirmDiscardTask() && useTrainer.getState().walkTo(c.id, 0)} title="The model is built on an empty canvas one step at a time, with the reason for each step">
                ▶ Watch it built
              </button>
              {LEVELS.map((l) => {
                const best = progress[progressKey(c.id, l.level)]
                return (
                  <button key={l.level} type="button" className="btn btn-small" onClick={() => confirmDiscardTask() && start(c.id, l.level)} title={l.task}>
                    <b>{l.level}</b> {l.title}
                    {best !== undefined && <span className={`trainer-best ${best === 100 ? 'is-full' : ''}`}>{l.level === 0 ? '✓' : `${best}%`}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

function TaskPane({ c, level }: { c: TrainerCase; level: Level }) {
  const { start, exit, openPicker } = useTrainer.getState()
  const flow = useReactFlow()
  const go = (l: Level) => {
    if (!confirmDiscardTask()) return
    start(c.id, l)
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 50)
  }
  const info = LEVELS[level]
  return (
    <aside className="trainer-pane" aria-label="Trainer">
      <div className="trainer-header">
        <button type="button" className="btn btn-small" onClick={() => openPicker(true)} title="All cases">
          ☰
        </button>
        <h2>
          {c.title} <Stars n={c.difficulty} />
        </h2>
        <button type="button" className="btn btn-small ml-auto" onClick={exit} title="Close the trainer and get your own model back">
          Exit
        </button>
      </div>
      <div className="segmented trainer-level-tabs" role="tablist" aria-label="Level">
        {LEVELS.map((l) => (
          <button key={l.level} type="button" role="tab" aria-selected={level === l.level} className={level === l.level ? 'on' : ''} onClick={() => go(l.level)} title={l.title}>
            {l.level} · {l.title.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="trainer-body">
        <p className="trainer-task">
          <b>Level {level} — {info.title}.</b> {info.task}
        </p>
        {level === 0 && (
          <button type="button" className="btn btn-small mb-2" onClick={() => useTrainer.getState().walkTo(c.id, 0)}>
            ▶ Watch it built step by step
          </button>
        )}
        {level === 0 && <WorkedExample c={c} />}
        {level === 1 && <Tagging c={c} />}
        {level >= 2 && <CheckPanel c={c} level={level} />}
        {level < 3 && (
          <button type="button" className="btn btn-primary mt-3" onClick={() => go((level + 1) as Level)}>
            Next: level {level + 1} — {LEVELS[level + 1].title} →
          </button>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- level 0

function WorkedExample({ c }: { c: TrainerCase }) {
  const open = useTrainer((s) => s.session?.openSpan ?? null)
  const { showSpan } = useTrainer.getState()
  return (
    <>
      <div className="trainer-spec">
        {c.spec.map((_, p) => (
          <p key={p}>
            {splitParagraph(c, p).map((part, k) =>
              'span' in part ? (
                <button
                  key={k}
                  type="button"
                  className={`spec-span tag-${part.span.tag} ${open === part.index ? 'is-open' : ''}`}
                  onClick={() => {
                    showSpan(part.index)
                    selectRefKey(part.span.target)
                  }}
                  title={TAG_LABEL[part.span.tag]}
                >
                  {part.text}
                </button>
              ) : (
                <span key={k}>{part.text}</span>
              ),
            )}
          </p>
        ))}
      </div>
      {open !== null && <SpanExplanation c={c} index={open} />}
      <TagLegend />
      <h3 className="trainer-h3">Key decisions</h3>
      <ul className="trainer-lessons">
        {c.lessons.map((l, k) => (
          <li key={k}>{richText(l)}</li>
        ))}
      </ul>
    </>
  )
}

function SpanExplanation({ c, index, chosen }: { c: TrainerCase; index: number; chosen?: Tag }) {
  const s = c.spans[index]
  const right = chosen === undefined || isRightTag(c, index, chosen)
  return (
    <div className={`trainer-why ${chosen === undefined ? '' : right ? 'is-right' : 'is-wrong'}`} role="status">
      <div>
        <b>“{s.phrase}”</b> → {TAG_LABEL[s.tag]}
        {s.accept?.length ? ` (also fine: ${s.accept.map((t) => TAG_LABEL[t]).join(', ')})` : ''}
        {chosen !== undefined && <span className="ml-1">{right ? '✓' : `— you said ${TAG_LABEL[chosen]}`}</span>}
      </div>
      <div>{richText(s.why)}</div>
    </div>
  )
}

function TagLegend() {
  return (
    <div className="tag-legend">
      {TAGS.map((t) => (
        <span key={t.id} className={`spec-span tag-${t.id}`} title={t.hint}>
          {t.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- level 1

function Tagging({ c }: { c: TrainerCase }) {
  const tags = useTrainer((s) => s.session?.tags ?? {})
  const open = useTrainer((s) => s.session?.openSpan ?? null)
  const { tag, showSpan, resetTags } = useTrainer.getState()
  const score = tagScore(c, tags)
  const pending = open !== null && tags[open] === undefined
  return (
    <>
      <div className="trainer-score">
        {score.answered} / {score.total} tagged · <b>{score.right} right</b>
        {score.answered === score.total && <span className="ml-2">— {score.percent}%</span>}
        {score.answered > 0 && (
          <button type="button" className="btn btn-small ml-auto" onClick={resetTags}>
            Start over
          </button>
        )}
      </div>
      <div className="trainer-spec">
        {c.spec.map((_, p) => (
          <p key={p}>
            {splitParagraph(c, p).map((part, k) => {
              if (!('span' in part)) return <span key={k}>{part.text}</span>
              const chosen = tags[part.index]
              const state = chosen === undefined ? 'todo' : isRightTag(c, part.index, chosen) ? 'right' : 'wrong'
              return (
                <button
                  key={k}
                  type="button"
                  className={`spec-span is-${state} ${chosen !== undefined ? `tag-${c.spans[part.index].tag}` : ''} ${open === part.index ? 'is-open' : ''}`}
                  onClick={() => {
                    showSpan(part.index)
                    if (chosen !== undefined) selectRefKey(part.span.target)
                  }}
                >
                  {part.text}
                </button>
              )
            })}
          </p>
        ))}
      </div>
      {pending && (
        <div className="trainer-ask" role="group" aria-label="What is it?">
          <div>
            <b>“{c.spans[open].phrase}”</b> is…
          </div>
          <div className="flex flex-wrap gap-1">
            {TAGS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn btn-small spec-tag-btn tag-${t.id}`}
                title={t.hint}
                onClick={() => {
                  tag(open, t.id)
                  selectRefKey(c.spans[open].target)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {open !== null && !pending && <SpanExplanation c={c} index={open} chosen={tags[open]} />}
      {open === null && <p className="muted text-xs">Click an underlined phrase.</p>}
    </>
  )
}

// ---------------------------------------------------------------- levels 2–3

const STATUS_LABEL = { missing: 'Missing', different: 'Different', extra: 'Not in the reference', matched: 'Matched' } as const

function CheckPanel({ c, level }: { c: TrainerCase; level: Level }) {
  const check = useTrainer((s) => s.check)
  const model = useEditor((s) => s.model)
  const { runCheck } = useTrainer.getState()
  const [showText, setShowText] = useState(level === 3)
  const coached = useMemo(() => coach(c, model, level), [c, model, level])
  const next = coached.next
  const step = useTrainer((s) => (next ? s.session?.hintSteps[next.key] ?? 0 : 0))
  // From the “Where” rung on, the phrases of the hint are marked in the text, which opens.
  const marked = new Set(next && step >= 2 ? next.spans : [])
  useEffect(() => {
    if (marked.size) setShowText(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marked.size])
  const stale = check && check.model !== model
  const groups = check ? (['missing', 'different', 'extra', 'matched'] as const).map((st) => [st, check.result.items.filter((i) => i.status === st)] as const) : []
  return (
    <>
      <Coach c={c} state={coached} step={step} />
      <details className="trainer-text" open={showText} onToggle={(e) => setShowText((e.target as HTMLDetailsElement).open)}>
        <summary>Specification text</summary>
        <div className="trainer-spec walk-spec">
          {c.spec.map((_, p) => (
            <p key={p}>
              {splitParagraph(c, p).map((part, k) =>
                'span' in part && marked.has(part.index) ? (
                  <span key={k} className={`spec-span tag-${part.span.tag} is-now`}>
                    {part.text}
                  </span>
                ) : (
                  <span key={k}>{part.text}</span>
                ),
              )}
            </p>
          ))}
        </div>
      </details>
      <button type="button" className="btn btn-primary" onClick={runCheck}>
        {check ? 'Check again' : 'Check my model'}
      </button>
      {check && (
        <div className="trainer-result">
          <div className="trainer-scorebar" aria-label={`Score ${check.result.score}%`}>
            <div style={{ width: `${check.result.score}%` }} />
          </div>
          <div className="trainer-score">
            <b>{check.result.score}%</b>
            <span className="count count-ok">{check.result.counts.matched} matched</span>
            {check.result.counts.missing > 0 && <span className="count count-error">{check.result.counts.missing} missing</span>}
            {check.result.counts.different > 0 && <span className="count count-warning">{check.result.counts.different} different</span>}
            {check.result.counts.extra > 0 && <span className="count count-info">{check.result.counts.extra} extra</span>}
          </div>
          {stale && <p className="muted text-xs">The model changed since this check.</p>}
          {(check.lintErrors > 0 || check.lintWarnings > 0) && (
            <p className="text-xs">
              Model check: {check.lintErrors} error(s), {check.lintWarnings} warning(s) — see the dock under the canvas.
            </p>
          )}
          {check.result.score === 100 && check.lintErrors === 0 && <p className="trainer-done">✓ Everything the reference has is in your model.</p>}
          {groups.map(([st, items]) =>
            items.length === 0 ? null : (
              <details key={st} className={`trainer-group status-${st}`} open={st !== 'matched'}>
                <summary>
                  {STATUS_LABEL[st]} ({items.length})
                </summary>
                <ul>
                  {items.map((item, k) => (
                    <ResultItem key={`${st}-${k}-${item.refKey ?? item.message}`} c={c} item={item} />
                  ))}
                </ul>
              </details>
            ),
          )}
        </div>
      )}
    </>
  )
}

/** “Build it with me”: one global Next hint, for the next missing item in the walkthrough order. */
function Coach({ c, state, step }: { c: TrainerCase; state: CoachState; step: number }) {
  const { next } = state
  const { nextHint } = useTrainer.getState()
  // Remember the item that was being coached, to say “done” when it is in the model.
  const last = useRef<string | null>(null)
  const [solved, setSolved] = useState(false)
  useEffect(() => {
    if (last.current && last.current !== next?.key) {
      setSolved(true)
      last.current = null
    }
    if (next && step > 0) last.current = next.key
  }, [next?.key, step])
  if (!next)
    return (
      <div className="coach is-done" role="status">
        ✓ Everything of the reference is in your model. Press <b>Check</b> to record the score
        {state.result.counts.extra ? ' — and look at the items that are not in the reference' : ''}.
      </div>
    )
  const shown = next.rungs.slice(0, step)
  const atAnswer = step >= next.rungs.length
  const doIt = () => {
    const editor = useEditor.getState()
    const ok = editor.apply((m) => {
      applyAnswer(m, c, next.item)
    })
    if (!ok) return
    // Select what was added or fixed.
    const { model } = useEditor.getState()
    const found = compareModels(model, referenceOf(c), { synonyms: c.synonyms }).items.find((i) => i.refKey === next.item.refKey && i.target)
    const target = found?.target ?? next.item.target
    editor.setView('cdm')
    if (target) editor.select(target)
  }
  return (
    <div className="coach" role="region" aria-label="Build it with me">
      <div className="coach-head">
        <b>💡 Build it with me</b>
        <span className="muted ml-auto text-xs" title="How much of the reference your model has">
          {state.result.score}% done
        </span>
      </div>
      {solved && step === 0 && <div className="coach-solved">✓ That one is in. Next:</div>}
      {shown.map((r, k) => (
        <div key={k} className={`trainer-hint ${r.label === 'Answer' ? 'is-answer' : ''}`}>
          <b>{r.label}:</b> {richText(r.text)}
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {!atAnswer && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => {
              setSolved(false)
              nextHint(next.key)
              if (step === 0 && next.item.target) {
                useEditor.getState().setView('cdm')
                useEditor.getState().select(next.item.target)
              }
            }}
          >
            {step === 0 ? 'Next hint' : next.rungs[step].label === 'Answer' ? 'Show the answer' : 'Another hint'}
          </button>
        )}
        {atAnswer && (
          <button type="button" className="btn btn-small" onClick={doIt} title="Add this element to your model (Ctrl+Z undoes it)">
            Do it for me
          </button>
        )}
      </div>
    </div>
  )
}

function itemKey(item: CompareItem): string {
  return `${item.kind}|${item.refKey ?? item.message}`
}

function ResultItem({ c, item }: { c: TrainerCase; item: CompareItem }) {
  const key = itemKey(item)
  const step = useTrainer((s) => s.session?.hintSteps[key] ?? 0)
  const { nextHint } = useTrainer.getState()
  const canHint = item.status === 'missing' || item.status === 'different'
  const caseHints = hintsFor(c, item.refKey, item.refEntities)
  const phrases = phrasesFor(c, item.refKey)
  const ladder: string[] = []
  if (item.refEntities.length) ladder.push(`Look around: ${item.refEntities.join(', ')}.`)
  if (caseHints.length || phrases.length)
    ladder.push([...caseHints, phrases.length ? `Read the words “${phrases.join('”, “')}” again.` : ''].filter(Boolean).join(' '))
  if (item.answer) ladder.push(`Answer: ${item.answer}`)
  return (
    <li className="trainer-item">
      <button
        type="button"
        className="trainer-item-main"
        disabled={!item.target}
        onClick={() => {
          if (!item.target) return
          useEditor.getState().setView('cdm')
          useEditor.getState().select(item.target)
        }}
        title={item.target ? 'Show in your model' : undefined}
      >
        {richText(item.message)}
      </button>
      {canHint &&
        ladder.slice(0, step).map((h, k) => (
          <div key={k} className={`trainer-hint ${h.startsWith('Answer:') ? 'is-answer' : ''}`}>
            {richText(h)}
          </div>
        ))}
      {canHint && step < ladder.length && (
        <button type="button" className="btn btn-small" onClick={() => nextHint(key)}>
          {step === ladder.length - 1 && item.answer ? 'Show the answer' : step === 0 ? 'Hint' : 'Another hint'}
        </button>
      )}
    </li>
  )
}
