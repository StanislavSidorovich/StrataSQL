// Trainer session (SPEC §9): which case and level is open, the text tags, the last check and the
// hint steps. The working model lives in the editor store; the user's own model waits in
// `trainerBackup` until the trainer is closed.

import { create } from 'zustand'
import { compareModels, type CompareResult } from '../../core/compare'
import { addFileCase, caseById, LEVELS, type Tag, type TrainerCase } from '../../data/cases'
import { parseCaseFile } from '../../data/caseFile'
import { exerciseById, type Exercise } from '../../data/exercises'
import { addMark, MY_TASK_ID, myTaskExercise, remapMarks, type Mark, type MyTask } from '../../data/mytask'
import { emptyModel, type Model } from '../../core/metamodel'
import type { SavedTask } from '../../core/serialize'
import { levelStartModel, recordScore, recordWalk, type Level, type PathStep, type Progress } from '../../data/trainer'
import { nameSuggestions, type NameSuggestions } from '../../data/suggest'
import { walkthroughSteps, type WalkQuestion, type WalkStep } from '../../data/walkthrough'
import { lintFor, loadStoredModel, TRAINER_MODEL_KEY, useEditor } from '../store'

const SESSION_KEY = 'stratasql.trainer.session'
const PROGRESS_KEY = 'stratasql.trainer.progress'
const ASK_KEY = 'stratasql.walk.ask'
const SUGGEST_KEY = 'stratasql.suggest'
const MY_TASK_KEY = 'stratasql.mytask'
const FILE_CASE_KEY = 'stratasql.fileCase'

export interface Check {
  result: CompareResult
  /** Linter errors and warnings at check time. */
  lintErrors: number
  lintWarnings: number
  /** The model that was checked (to tell when the result is stale). */
  model: unknown
}

interface Session {
  caseId: string
  level: Level
  /** Level 1: span index → the tag the student chose. */
  tags: Record<number, Tag>
  /** Level 0: the span whose explanation is shown. */
  openSpan: number | null
  /** Hint ladder step per item key. */
  hintSteps: Record<string, number>
  /** Walkthrough (“watch it built”): the current step; the task level is then 0. */
  walk?: number
  /** Walkthrough: step → the option the student picked before the step was shown; lesson: question → option (-1 = skipped). */
  answers?: Record<number, number>
  /** Level 1: the finished model is shown although not every phrase is tagged yet. */
  peek?: boolean
  /** Walkthrough: the canvas shows the finished model for a moment; the step stays where it was. */
  walkPeek?: boolean
  /** Open exercise (`caseId` is then an exercise id, level 3): the checklist items ticked. */
  exercise?: number[]
}

interface TrainerState {
  /** The case picker is shown (no session yet, or the user asked for it). */
  pickerOpen: boolean
  session: Session | null
  check: Check | null
  progress: Progress
  /** Walkthrough: ask the step's question before showing it (off = just watch). */
  askFirst: boolean
  /** Name fields suggest words of the task text while typing. */
  suggestNames: boolean
  /** The student's own task text with the phrases they tagged (saved in the browser). */
  myTask: MyTask | null

  openPicker: (open: boolean) => void
  start: (caseId: string, level: Level) => void
  /** Starts an open exercise (no reference) on an empty model. */
  startExercise: (id: string) => void
  toggleChecklist: (item: number) => void
  /** Saves the own task's title and text; tagged phrases follow their words. */
  saveMyTask: (title: string, text: string) => void
  markPhrase: (mark: Mark) => void
  unmarkPhrase: (index: number) => void
  /** Lesson: answers question `q` (0 = the guess, then the checks); null skips it. */
  answerLesson: (q: number, option: number | null) => void
  /** Starts (or moves) the walkthrough of a case at a step. */
  walkTo: (caseId: string, step: number) => void
  /** Answers (or skips, with null) the question of the current walkthrough step, which reveals it. */
  answerWalk: (option: number | null) => void
  /** Walkthrough: shows the finished model (true) or goes back to the current step (false). */
  peekFinished: (on: boolean) => void
  setAskFirst: (on: boolean) => void
  setSuggestNames: (on: boolean) => void
  setPeek: (peek: boolean) => void
  exit: () => void
  tag: (span: number, tag: Tag) => void
  resetTags: () => void
  showSpan: (span: number | null) => void
  runCheck: () => void
  nextHint: (key: string) => void
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const t = localStorage.getItem(key)
    return t ? (JSON.parse(t) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the session just does not survive a reload.
  }
}

export const useTrainer = create<TrainerState>()((set, get) => ({
  pickerOpen: false,
  session: null,
  check: null,
  progress: readJson<Progress>(PROGRESS_KEY, {}),
  askFirst: readJson<boolean>(ASK_KEY, true),
  suggestNames: readJson<boolean>(SUGGEST_KEY, true),
  myTask: readJson<MyTask | null>(MY_TASK_KEY, null),

  openPicker: (pickerOpen) => set({ pickerOpen }),

  start(caseId, level) {
    const c = caseById(caseId)
    if (!c) return
    const editor = useEditor.getState()
    const backup = editor.trainerBackup ?? editor.model
    useEditor.setState({
      model: levelStartModel(c, level),
      trainerBackup: backup,
      doc: editor.doc + 1,
      past: [],
      future: [],
      selection: null,
      tableSelection: null,
      focusedIssue: null,
      view: 'cdm',
      error: null,
      walkthrough: null,
    })
    // A lesson keeps its quiz answers between reading and practice.
    const prev = get().session
    const answers = prev?.caseId === caseId && prev.walk === undefined ? prev.answers : undefined
    set({ session: { caseId, level, tags: {}, openSpan: null, hintSteps: {}, ...(answers ? { answers } : {}) }, check: null, pickerOpen: false })
  },

  answerLesson(q, option) {
    const s = get().session
    if (!s || s.answers?.[q] !== undefined) return
    set({ session: { ...s, answers: { ...s.answers, [q]: option ?? -1 } } })
  },

  startExercise(id) {
    const x = exerciseFor(id)
    if (!x) return
    const editor = useEditor.getState()
    useEditor.setState({
      model: { ...emptyModel(`${x.title} — my model`), comment: id === MY_TASK_ID ? `My task: ${x.title}.` : `Open exercise: ${x.title}.` },
      trainerBackup: editor.trainerBackup ?? editor.model,
      doc: editor.doc + 1,
      past: [],
      future: [],
      selection: null,
      tableSelection: null,
      focusedIssue: null,
      view: 'cdm',
      error: null,
      walkthrough: null,
    })
    set({ session: { caseId: id, level: 3, tags: {}, openSpan: null, hintSteps: {}, exercise: [] }, check: null, pickerOpen: false })
  },

  toggleChecklist(item) {
    const s = get().session
    if (!s?.exercise) return
    const exercise = s.exercise.includes(item) ? s.exercise.filter((x) => x !== item) : [...s.exercise, item]
    set({ session: { ...s, exercise } })
  },

  saveMyTask(title, text) {
    const prev = get().myTask
    const myTask: MyTask = { title: title.trim() || 'My task', text, marks: prev ? remapMarks(prev.marks, text) : [] }
    set({ myTask })
    writeJson(MY_TASK_KEY, myTask)
  },

  markPhrase(mark) {
    const t = get().myTask
    if (!t) return
    const myTask = { ...t, marks: addMark(t.marks, mark) }
    set({ myTask })
    writeJson(MY_TASK_KEY, myTask)
  },

  unmarkPhrase(index) {
    const t = get().myTask
    if (!t) return
    const myTask = { ...t, marks: t.marks.filter((_, k) => k !== index) }
    set({ myTask })
    writeJson(MY_TASK_KEY, myTask)
  },

  walkTo(caseId, step) {
    const c = caseById(caseId)
    if (!c) return
    const steps = walkSteps(c)
    const at = Math.max(0, Math.min(step, steps.length - 1))
    const s = steps[at]
    const prev = get().session
    const answers = prev?.caseId === caseId && prev.walk !== undefined ? (prev.answers ?? {}) : {}
    // A step with an open question still shows the model before it; the answer reveals the step.
    const asking = isAsking(s.question, get().askFirst, answers[at])
    const editor = useEditor.getState()
    const first = s.focus[0]
    useEditor.setState({
      model: asking ? steps[at - 1].model : s.model,
      trainerBackup: editor.trainerBackup ?? editor.model,
      doc: editor.doc + 1,
      past: [],
      future: [],
      selection: first && !asking ? { kind: first.kind, id: first.id } : null,
      tableSelection: null,
      focusedIssue: null,
      // Watching the tables grow in the Physical view is allowed; the other views show no canvas.
      view: editor.view === 'pdm' ? 'pdm' : 'cdm',
      error: null,
      walkthrough: { spotlight: asking ? s.question!.focus : s.focus.map((f) => f.id) },
    })
    set({ session: { caseId, level: 0, tags: {}, openSpan: null, hintSteps: {}, walk: at, answers }, check: null, pickerOpen: false })
    if (at === steps.length - 1) saveProgress(recordWalk(get().progress, caseId))
  },

  answerWalk(option) {
    const s = get().session
    if (!s || s.walk === undefined) return
    set({ session: { ...s, answers: { ...s.answers, [s.walk]: option ?? -1 } } })
    get().walkTo(s.caseId, s.walk)
  },

  peekFinished(on) {
    const s = get().session
    if (!s || s.walk === undefined) return
    // Going back is walkTo: it rebuilds the step (and its open question) and drops walkPeek.
    if (!on) return get().walkTo(s.caseId, s.walk)
    const c = caseById(s.caseId)
    if (!c) return
    const editor = useEditor.getState()
    useEditor.setState({ model: walkSteps(c).at(-1)!.model, doc: editor.doc + 1, past: [], future: [], selection: null, tableSelection: null, walkthrough: { spotlight: [] } })
    set({ session: { ...s, walkPeek: true } })
  },

  setAskFirst(askFirst) {
    set({ askFirst })
    writeJson(ASK_KEY, askFirst)
    const s = get().session
    if (s?.walk !== undefined) get().walkTo(s.caseId, s.walk)
  },

  setSuggestNames(suggestNames) {
    set({ suggestNames })
    writeJson(SUGGEST_KEY, suggestNames)
  },

  setPeek(peek) {
    const s = get().session
    if (!s) return
    set({ session: { ...s, peek } })
    if (!peek) useEditor.setState({ selection: null })
  },

  exit() {
    const { trainerBackup } = useEditor.getState()
    if (trainerBackup)
      useEditor.setState({ model: trainerBackup, trainerBackup: null, doc: useEditor.getState().doc + 1, past: [], future: [], selection: null, focusedIssue: null, walkthrough: null })
    writeJson(TRAINER_MODEL_KEY, null)
    set({ session: null, check: null, pickerOpen: false })
  },

  tag(span, tag) {
    const s = get().session
    if (!s || s.tags[span]) return
    const tags = { ...s.tags, [span]: tag }
    set({ session: { ...s, tags, openSpan: span } })
    const c = caseById(s.caseId)!
    if (Object.keys(tags).length === c.spans.length) saveScore(c, 1, tagScore(c, tags).percent)
  },

  resetTags() {
    const s = get().session
    if (!s) return
    set({ session: { ...s, tags: {}, openSpan: null, peek: false } })
    useEditor.setState({ selection: null })
  },

  showSpan(openSpan) {
    const s = get().session
    if (s) set({ session: { ...s, openSpan } })
  },

  runCheck() {
    const s = get().session
    if (!s) return
    const c = caseById(s.caseId)!
    const { model } = useEditor.getState()
    const result = compareModels(model, c.build(), { synonyms: c.synonyms, strict: c.strict, scope: s.level === 2 ? 'links' : 'all' })
    const issues = lintFor(model)
    set({
      check: {
        result,
        lintErrors: issues.filter((i) => i.severity === 'error').length,
        lintWarnings: issues.filter((i) => i.severity === 'warning').length,
        model,
      },
    })
    saveScore(c, s.level, result.score)
  },

  nextHint(key) {
    const s = get().session
    if (s) set({ session: { ...s, hintSteps: { ...s.hintSteps, [key]: (s.hintSteps[key] ?? 0) + 1 } } })
  },
}))

/**
 * A level 2–3 task holds the student's own work. Edits after a reload leave no undo history, so the
 * model itself is checked too.
 */
export function taskHasWork(): boolean {
  const s = useTrainer.getState().session
  if (!s || s.walk !== undefined || s.level < 2) return false
  const { past, model } = useEditor.getState()
  // A lesson practice starts with entities, so after a reload (no undo history) its model is compared with the start.
  const c = caseById(s.caseId)
  if (c?.start) {
    if (past.length > 0) return true
    const { counts } = compareModels(model, levelStartModel(c, s.level), { strict: true })
    return counts.missing + counts.extra + counts.different > 0
  }
  return past.length > 0 || (s.level === 3 ? model.entities.length > 0 : model.relationships.length + model.inheritances.length > 0)
}

/** Asks before a level 2–3 task's work is replaced. */
export function confirmDiscardTask(): boolean {
  return !taskHasWork() || window.confirm('This discards the work of the current trainer task. Continue?')
}

/**
 * Before New / Open / a finished example: those replace the user's own model, so a running trainer
 * task or walkthrough closes first (otherwise the answer would land in the task). False = cancelled.
 */
export function leaveTrainer(): boolean {
  if (!useTrainer.getState().session) return true
  if (!confirmDiscardTask()) return false
  useTrainer.getState().exit()
  return true
}

/** The step's question is open: it has one, questions are on, and it has not been answered yet. */
export function isAsking(question: WalkQuestion | undefined, askFirst: boolean, answer: number | undefined): boolean {
  return !!question && askFirst && answer === undefined
}

/** Level 1 hides the finished model until every phrase is tagged (recall, not look-up), unless peeking. */
export function isVeiled(s: Session | null): boolean {
  if (!s || s.level !== 1 || s.walk !== undefined || s.exercise || s.peek) return false
  const c = caseById(s.caseId)
  return !!c && Object.keys(s.tags).length < c.spans.length
}

// Keyed by the case object: a case file opened again under the same id is a new object.
const stepCache = new WeakMap<TrainerCase, WalkStep[]>()
/** The walkthrough steps of a case, generated once per page. */
export function walkSteps(c: TrainerCase): WalkStep[] {
  let steps = stepCache.get(c)
  if (!steps) stepCache.set(c, (steps = walkthroughSteps(c)))
  return steps
}

/** Level 1 result: a tag is right when it is the expected one or an accepted alternative. */
export function isRightTag(c: TrainerCase, span: number, tag: Tag): boolean {
  const s = c.spans[span]
  return s.tag === tag || !!s.accept?.includes(tag)
}

export function tagScore(c: TrainerCase, tags: Record<number, Tag>) {
  const answered = Object.keys(tags).map(Number)
  const right = answered.filter((k) => isRightTag(c, k, tags[k])).length
  return { answered: answered.length, right, total: c.spans.length, percent: Math.round((100 * right) / c.spans.length) }
}

function saveScore(c: TrainerCase, level: Level, score: number) {
  saveProgress(recordScore(useTrainer.getState().progress, c.id, level, score))
}

function saveProgress(progress: Progress) {
  if (progress === useTrainer.getState().progress) return
  useTrainer.setState({ progress })
  writeJson(PROGRESS_KEY, progress)
}

/** An open exercise, or the student's own task. */
export function exerciseFor(id: string): Exercise | undefined {
  if (id !== MY_TASK_ID) return exerciseById(id)
  const t = useTrainer.getState().myTask
  return t ? myTaskExercise(t) : undefined
}

const suggestCache = new Map<string, NameSuggestions>()
/** Words of the open task's text for the name fields; null when off or nothing is typed in this task (levels 0–1, walkthrough). */
export function taskSuggestions(s: Session | null, on: boolean): NameSuggestions | null {
  if (!on || !s || s.walk !== undefined || s.level < 2) return null
  const spec = (s.exercise ? exerciseFor(s.caseId) : caseById(s.caseId))?.spec
  if (!spec) return null
  // The own task's text can change, so its words are cached by the text itself.
  const key = s.caseId === MY_TASK_ID ? spec.join('\n') : s.caseId
  let out = suggestCache.get(key)
  if (!out) suggestCache.set(key, (out = nameSuggestions(spec)))
  return out
}

/** Opens a step of the learning path: the walkthrough or a trainer level. */
export function openPathStep(caseId: string, step: PathStep) {
  if (!confirmDiscardTask()) return
  if (step === 'walk') useTrainer.getState().walkTo(caseId, 0)
  else useTrainer.getState().start(caseId, step)
}

// ---------------------------------------------------------------- persistence

useTrainer.subscribe((state, prev) => {
  if (state.session !== prev.session) writeJson(SESSION_KEY, state.session)
})

/**
 * File → Open of a `.strata-case.json`: the case is checked, kept for this browser (so a reload
 * resumes it; only the last one) and its walkthrough starts. Throws a readable error.
 */
export function openCaseFile(text: string): TrainerCase {
  const c = parseCaseFile(text)
  addFileCase(c)
  writeJson(FILE_CASE_KEY, text)
  useTrainer.getState().walkTo(c.id, 0)
  return c
}

/** After a reload: resume the open task with its working model. */
export function restoreTrainer() {
  const caseText = readJson<string | null>(FILE_CASE_KEY, null)
  if (caseText)
    try {
      addFileCase(parseCaseFile(caseText))
    } catch {
      writeJson(FILE_CASE_KEY, null)
    }
  const session = readJson<Session | null>(SESSION_KEY, null)
  if (!session || !(session.exercise ? exerciseFor(session.caseId) : caseById(session.caseId))) return
  if (session.walk !== undefined) {
    // Set first, so walkTo keeps the answers given before the reload.
    useTrainer.setState({ session })
    return useTrainer.getState().walkTo(session.caseId, session.walk)
  }
  const model = loadStoredModel(TRAINER_MODEL_KEY) ?? (session.exercise ? emptyModel() : levelStartModel(caseById(session.caseId)!, session.level))
  const editor = useEditor.getState()
  useEditor.setState({ model, trainerBackup: editor.model, doc: editor.doc + 1, past: [], future: [] })
  useTrainer.setState({ session })
}

/** “Hotel, level 3 (Build it yourself)” or “My task: …”; null when the case or exercise no longer exists. */
export function savedTaskLabel(t: SavedTask): string | null {
  const c = caseById(t.id)
  const level = LEVELS.find((l) => l.level === t.level)
  if (c && level) return `${c.title}, level ${t.level} (${level.title})`
  const x = exerciseFor(t.id)
  return x ? `${t.id === MY_TASK_ID ? 'My task' : 'Open exercise'}: ${x.title}` : null
}

/**
 * Opening a file saved from a trainer task: the task starts again with the file's model in place of
 * its starting model (the user's own model waits aside as usual). Tags and hints start fresh.
 */
export function continueTask(t: SavedTask, model: Model): boolean {
  const trainer = useTrainer.getState()
  if (caseById(t.id) && LEVELS.some((l) => l.level === t.level)) trainer.start(t.id, t.level as Level)
  else if (exerciseFor(t.id)) trainer.startExercise(t.id)
  else return false
  useEditor.setState({ model, past: [], future: [] })
  return true
}
