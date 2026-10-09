// Walkthrough pane (stage 5b): “watch it built” — the case's model grows one step at a time on the
// canvas, next to the words of the text that cause each step and the tables it produces. Before some
// steps the student predicts first (“which table gets the foreign key?”); the answer reveals the step.

import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { CASES, splitParagraph, TAGS, type Tag, type TrainerCase } from '../../data/cases'
import type { WalkStepKind } from '../../data/walkthrough'
import { richText } from '../help/HelpDrawer'
import { useEditor } from '../store'
import { isAsking, useTrainer, walkSteps } from './trainerStore'

const TAG_LABEL = Object.fromEntries(TAGS.map((t) => [t.id, t.label])) as Record<Tag, string>

const KIND_LABEL: Record<WalkStepKind, string> = {
  intro: 'Start',
  entity: 'Entity',
  attributes: 'Attributes',
  identifier: 'Identifier',
  relationship: 'Relationship',
  inheritance: 'Inheritance',
  keys: 'Keys',
  rules: 'Rules',
  done: 'Done',
}

export function WalkthroughPane({ c, step }: { c: TrainerCase; step: number }) {
  const steps = walkSteps(c)
  const s = steps[step]
  const answers = useTrainer((x) => x.session?.answers ?? {})
  const askFirst = useTrainer((x) => x.askFirst)
  const { walkTo, start, exit, openPicker, answerWalk, setAskFirst } = useTrainer.getState()
  const q = s.question
  const asking = isAsking(q, askFirst, answers[step])
  const answer = answers[step]
  const answered = q && answer !== undefined && answer >= 0 ? q.right.includes(answer) : null
  const flow = useReactFlow()
  const specRef = useRef<HTMLDivElement>(null)
  // A case opened from a file is not in the list: no “Next case”.
  const next = CASES.includes(c) ? CASES[CASES.indexOf(c) + 1] : undefined

  // Each step: fit the growing model (not closer than 100 %), show the step's first phrase.
  useEffect(() => {
    // Wait until a new node has been measured, or fitView leaves it out.
    // After a reload the canvas mounts later, hence the second try.
    const fit = () => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 })
    const timers = [setTimeout(fit, 150), setTimeout(fit, 700)]
    specRef.current?.querySelector('.is-now')?.scrollIntoView({ block: 'nearest' })
    return () => timers.forEach(clearTimeout)
  }, [step, asking, flow])

  const go = (k: number) => walkTo(c.id, k)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select') || useEditor.getState().help !== null) return
      if (asking && q && /^[1-9]$/.test(e.key) && Number(e.key) <= q.options.length) answerWalk(Number(e.key) - 1)
      else if (e.key === 'ArrowRight' && !asking && step < steps.length - 1) go(step + 1)
      else if (e.key === 'ArrowLeft' && step > 0) go(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Spans explained in earlier steps vs this one.
  const past = new Set(steps.slice(0, step).flatMap((x) => x.spans))
  // While asking, only the phrase of the question is marked (the others would give the answer away).
  const now = new Set(asking ? (q!.span !== undefined ? [q!.span] : []) : s.spans)
  const asked = steps.filter((x, k) => x.question && answers[k] !== undefined && answers[k] >= 0)
  const rightCount = asked.filter((x) => x.question!.right.includes(answers[steps.indexOf(x)])).length

  return (
    <aside className="trainer-pane" aria-label="Walkthrough">
      <div className="trainer-header">
        <button type="button" className="btn btn-small" onClick={() => openPicker(true)} title="All cases">
          ☰
        </button>
        <h2>▶ {c.title}</h2>
        <button type="button" className="btn btn-small ml-auto" onClick={exit} title="Close and get your own model back">
          Exit
        </button>
      </div>
      <div className="trainer-body">
        <div className="flex items-baseline justify-between text-xs">
          <span className="walk-kind">{asking ? 'Your turn' : KIND_LABEL[s.kind]}</span>
          <span className="muted">
            Step {step} of {steps.length - 1}
          </span>
        </div>
        <div className="walk-progress" aria-hidden>
          <div style={{ width: `${(100 * step) / (steps.length - 1)}%` }} />
        </div>

        <div className="walk-nav">
          <button type="button" className="btn" onClick={() => go(step - 1)} disabled={step === 0} title="Previous step (←)">
            ← Back
          </button>
          {asking ? null : step < steps.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => go(step + 1)} title="Next step (→)" autoFocus>
              {step === 0 ? 'Start →' : 'Next →'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => start(c.id, 3)} title="Trainer level 3: build the same model from the text">
              Build it yourself →
            </button>
          )}
          {step === steps.length - 1 && next && (
            <button type="button" className="btn" onClick={() => walkTo(next.id, 0)} title={`Watch the next case: ${next.title}`}>
              Next case: {next.title} ▶
            </button>
          )}
        </div>

        {asking && q && (
          <section className="walk-ask" aria-live="polite" aria-label="Predict first">
            <div className="walk-ask-prompt">{richText(q.prompt)}</div>
            <div className="walk-ask-options">
              {q.options.map((o, k) => (
                <button key={k} type="button" className="btn" onClick={() => answerWalk(k)} title={`Key ${k + 1}`} autoFocus={k === 0}>
                  {richText(o)}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-small self-start" onClick={() => answerWalk(null)}>
              Just show me →
            </button>
          </section>
        )}

        {!asking && (
        <section className="walk-step" aria-live="polite">
          {q && answer !== undefined && (
            <div className={`trainer-why ${answered === null ? '' : answered ? 'is-right' : 'is-wrong'}`} role="status">
              <div>
                {answered === null ? 'The answer: ' : answered ? '✓ Right — ' : `✗ You said ${q.options[answer].replace(/`/g, '')} — the answer: `}
                <b>{q.right.map((k) => q.options[k].replace(/`/g, '')).join(' or ')}</b>
              </div>
              <div>{richText(q.why)}</div>
            </div>
          )}
          <h3>{s.title}</h3>
          {s.spans.map((i) => (
            <div key={i} className="trainer-why">
              <div>
                <b>“{c.spans[i].phrase}”</b> → {TAG_LABEL[c.spans[i].tag]}
              </div>
              {!s.quiet?.includes(i) && <div>{richText(c.spans[i].why)}</div>}
            </div>
          ))}
          {s.text.map((t, k) => (
            <p key={k}>{richText(t)}</p>
          ))}
          {s.tables.length > 0 && (
            <>
              <div className="walk-tables-label">In the tables (Physical view):</div>
              <pre className="walk-tables">{s.tables.join('\n')}</pre>
            </>
          )}
          {s.help && (
            <button type="button" className="btn btn-small" onClick={() => useEditor.getState().openHelp(s.help)}>
              ? Learn more
            </button>
          )}
          {s.kind === 'done' && asked.length > 0 && (
            <p className="trainer-done">
              Your predictions: <b>{rightCount} of {asked.length}</b> right.
            </p>
          )}
        </section>
        )}

        <label className="check text-xs muted">
          <input type="checkbox" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} />
          <span>Ask me before some steps (predict, then see)</span>
        </label>

        <div className="walk-tables-label">The text</div>
        <div className="walk-spec walk-spec-fill trainer-spec" ref={specRef}>
          {c.spec.map((_, p) => (
            <p key={p}>
              {splitParagraph(c, p).map((part, k) =>
                'span' in part ? (
                  <span
                    key={k}
                    className={`spec-span tag-${part.span.tag} ${now.has(part.index) ? 'is-now' : past.has(part.index) ? 'is-past' : 'is-later'}`}
                    title={past.has(part.index) || now.has(part.index) ? TAG_LABEL[part.span.tag] : undefined}
                  >
                    {part.text}
                  </span>
                ) : (
                  <span key={k}>{part.text}</span>
                ),
              )}
            </p>
          ))}
        </div>
      </div>
    </aside>
  )
}
