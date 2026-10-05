// Learn: a lesson in the trainer column. Read (level 0): a guess first, then the gist with the
// example on the canvas, the usual trap and two check questions. Try (level 3): the practice text
// on the canvas with Check and hints, like a trainer task. The user's own model waits aside.

import { useReactFlow } from '@xyflow/react'
import { lessonById, lessonDoneKey, LESSONS, type Lesson, type Quiz } from '../../data/lessons'
import { DONE_AT } from '../../data/trainer'
import { helpCard } from '../../data/help'
import { richText } from '../help/HelpDrawer'
import { useEditor } from '../store'
import { CheckPanel } from './TrainerPane'
import { confirmDiscardTask, openPathStep, useTrainer } from './trainerStore'

/** Opens a lesson at its reading part (or its practice). */
export function openLesson(id: string, practice = false) {
  if (!confirmDiscardTask()) return
  useTrainer.getState().start(id, practice ? 3 : 0)
}

export function isLessonDone(progress: Record<string, number>, id: string): boolean {
  return (progress[lessonDoneKey(id)] ?? -1) >= DONE_AT
}

/** The first lesson not done yet; null when all are done. */
export function nextLesson(progress: Record<string, number>): Lesson | null {
  return LESSONS.find((l) => !isLessonDone(progress, l.id)) ?? null
}

export function LessonPane({ lesson, practice }: { lesson: Lesson; practice: boolean }) {
  const { exit, openPicker } = useTrainer.getState()
  const flow = useReactFlow()
  const n = LESSONS.indexOf(lesson) + 1
  const go = (p: boolean) => {
    if (p === practice) return
    openLesson(lesson.id, p)
    setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 60)
  }
  return (
    <aside className="trainer-pane" aria-label="Lesson">
      <div className="trainer-header">
        <button type="button" className="btn btn-small" onClick={() => openPicker(true)} title="All lessons and cases">
          ☰
        </button>
        <h2>
          <span className="muted">{n}.</span> {lesson.title}
        </h2>
        <button type="button" className="btn btn-small ml-auto" onClick={exit} title="Close the lesson and get your own model back">
          Exit
        </button>
      </div>
      <div className="segmented trainer-level-tabs" role="tablist" aria-label="Part">
        <button type="button" role="tab" aria-selected={!practice} className={!practice ? 'on' : ''} onClick={() => go(false)}>
          1 · Read
        </button>
        <button type="button" role="tab" aria-selected={practice} className={practice ? 'on' : ''} onClick={() => go(true)}>
          2 · Try it
        </button>
      </div>
      <div className="trainer-body">{practice ? <Practice lesson={lesson} onRead={() => go(false)} /> : <Reading lesson={lesson} onTry={() => go(true)} />}</div>
    </aside>
  )
}

function Reading({ lesson, onTry }: { lesson: Lesson; onTry: () => void }) {
  const guessed = useTrainer((s) => s.session?.answers?.[0] !== undefined)
  const openHelp = useEditor((s) => s.openHelp)
  return (
    <>
      <p className="trainer-task">
        <b>Before you read:</b> guess first. A wrong guess is fine, and it makes the answer stick.
      </p>
      <QuizBox quiz={lesson.guess} index={0} skippable />
      {guessed && (
        <>
          <h3 className="trainer-h3">The gist</h3>
          <ul className="lesson-gist">
            {lesson.gist.map((g, k) => (
              <li key={k}>{richText(g)}</li>
            ))}
          </ul>
          <div className="lesson-example">
            <b>On the canvas →</b> {richText(lesson.exampleNote)}
          </div>
          <section className="help-mistake">
            <h3 className="trainer-h3">The trap</h3>
            <p>{richText(lesson.trap)}</p>
          </section>
          <h3 className="trainer-h3">Check yourself</h3>
          {lesson.checks.map((q, k) => (
            <QuizBox key={k} quiz={q} index={k + 1} />
          ))}
          <div className="chips">
            <span className="muted text-xs">More in Help:</span>
            {lesson.help.map((id) => (
              <button key={id} type="button" className="chip" onClick={() => openHelp(id)}>
                {helpCard(id)?.title ?? id}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary mt-3" onClick={onTry}>
            Try it: {lesson.practice.title.replace(/^Practice: /, '')} →
          </button>
        </>
      )}
    </>
  )
}

function QuizBox({ quiz, index, skippable }: { quiz: Quiz; index: number; skippable?: boolean }) {
  const chosen = useTrainer((s) => s.session?.answers?.[index])
  const { answerLesson } = useTrainer.getState()
  const answered = chosen !== undefined
  const right = chosen === quiz.right
  return (
    <section className="lesson-quiz" aria-live="polite">
      <div className="walk-ask-prompt">{richText(quiz.prompt)}</div>
      <div className="lesson-options">
        {quiz.options.map((o, k) => (
          <button
            key={k}
            type="button"
            className={`btn lesson-option ${answered && k === quiz.right ? 'is-right' : ''} ${answered && k === chosen && !right ? 'is-wrong' : ''}`}
            disabled={answered}
            onClick={() => answerLesson(index, k)}
          >
            {richText(o.text)}
          </button>
        ))}
      </div>
      {!answered && skippable && (
        <button type="button" className="btn btn-small self-start" onClick={() => answerLesson(index, null)}>
          Skip, just show me
        </button>
      )}
      {answered && chosen >= 0 && (
        <div className={`trainer-why ${right ? 'is-right' : 'is-wrong'}`} role="status">
          <div>{right ? '✓ ' : '✗ '}{richText(quiz.options[chosen].why)}</div>
          {!right && (
            <div>
              <b>{richText(quiz.options[quiz.right].text)}:</b> {richText(rightWhy(quiz))}
            </div>
          )}
        </div>
      )}
      {answered && chosen < 0 && (
        <div className="trainer-why" role="status">
          <div>
            <b>{richText(quiz.options[quiz.right].text)}:</b> {richText(rightWhy(quiz))}
          </div>
        </div>
      )}
    </section>
  )
}

/** The right option's reason without its own “Right:”, for showing it next to a wrong answer. */
function rightWhy(q: Quiz): string {
  return q.options[q.right].why.replace(/^Right: /, '')
}

function Practice({ lesson, onRead }: { lesson: Lesson; onRead: () => void }) {
  return (
    <>
      <p className="trainer-task">
        <b>{lesson.practice.title}.</b> Model the text below on the canvas, then press <b>Check my model</b>. Stuck? <b>Next hint</b> shows what to do next.
      </p>
      <CheckPanel c={lesson.practice} level={3} next={<NextLessonButton lesson={lesson} />} />
      <button type="button" className="btn btn-small mt-3" onClick={onRead}>
        ← Read the lesson again
      </button>
    </>
  )
}

/** After a passed practice: the next lesson, or after the last one the first whole case. */
function NextLessonButton({ lesson }: { lesson: Lesson }) {
  const flow = useReactFlow()
  const k = LESSONS.indexOf(lesson)
  const next = LESSONS[k + 1]
  // The practice is done (the check passed), so moving on needs no “discard your work?” question.
  const leave = (fn: () => void) => {
    useEditor.setState({ past: [] })
    fn()
    setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 60)
  }
  if (next)
    return (
      <button type="button" className="btn btn-primary next-step" onClick={() => leave(() => openLesson(next.id))}>
        Next lesson: {next.title} →
      </button>
    )
  return (
    <>
      <p className="trainer-done">✓ That was the last lesson. Now a whole text: the Library case, built step by step, then by you.</p>
      <button type="button" className="btn btn-primary next-step" onClick={() => leave(() => openPathStep('library', 'walk'))}>
        Next: Library — watch it built →
      </button>
    </>
  )
}

/** The lessons in the trainer picker: “start here”, with a tick per lesson passed. */
export function LessonList() {
  const progress = useTrainer((s) => s.progress)
  const flow = useReactFlow()
  const next = nextLesson(progress)
  const done = LESSONS.filter((l) => isLessonDone(progress, l.id)).length
  const open = (id: string) => {
    openLesson(id)
    setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 60)
  }
  return (
    <section className={`trainer-case lesson-list ${done === LESSONS.length ? 'is-done' : ''}`}>
      <div className="flex items-baseline gap-2">
        <h3>Lessons: the basics</h3>
        <span className="case-progress ml-auto" title={`${done} of ${LESSONS.length} lessons passed (practice from ${DONE_AT} %)`}>
          {done === LESSONS.length ? '✓ done' : `${done} / ${LESSONS.length}`}
          <span className="case-progress-bar" aria-hidden>
            <span style={{ width: `${(100 * done) / LESSONS.length}%` }} />
          </span>
        </span>
      </div>
      <p className="text-xs muted">One idea each, about 5 minutes: read a little, then try it on the canvas. New to data modelling? Start here.</p>
      <ol className="lesson-items">
        {LESSONS.map((l, k) => (
          <li key={l.id}>
            <button type="button" className={`lesson-item ${next?.id === l.id ? 'is-next' : ''}`} onClick={() => open(l.id)} title={l.teaches}>
              <span className="lesson-no">{isLessonDone(progress, l.id) ? '✓' : k + 1}</span>
              <span>{l.title}</span>
            </button>
          </li>
        ))}
      </ol>
      {next && (
        <button type="button" className="btn btn-small btn-primary" onClick={() => open(next.id)}>
          {done ? 'Continue' : 'Start'}: {next.title} →
        </button>
      )}
    </section>
  )
}

/** For the pane router: the lesson open in the session, if any. */
export function sessionLesson(caseId: string | undefined): Lesson | undefined {
  return caseId ? lessonById(caseId) : undefined
}
