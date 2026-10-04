// Trainer session (SPEC §9): which case and level is open, the text tags, the last check and the
// hint steps. The working model lives in the editor store; the user's own model waits in
// `trainerBackup` until the trainer is closed.

import { create } from 'zustand'
import { compareModels, type CompareResult } from '../../core/compare'
import { caseById, type Tag, type TrainerCase } from '../../data/cases'
import { exerciseById } from '../../data/exercises'
import { emptyModel } from '../../core/metamodel'
import { levelStartModel, recordScore, recordWalk, type Level, type PathStep, type Progress } from '../../data/trainer'
import { nameSuggestions, type NameSuggestions } from '../../data/suggest'
import { walkthroughSteps, type WalkQuestion, type WalkStep } from '../../data/walkthrough'
import { lintFor, loadStoredModel, TRAINER_MODEL_KEY, useEditor } from '../store'

const SESSION_KEY = 'stratasql.trainer.session'
const PROGRESS_KEY = 'stratasql.trainer.progress'
const ASK_KEY = 'stratasql.walk.ask'
const SUGGEST_KEY = 'stratasql.suggest'

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
  /** Walkthrough: step → the option the student picked before the step was shown (-1 = skipped). */
  answers?: Record<number, number>
  /** Level 1: the finished model is shown although not every phrase is tagged yet. */
  peek?: boolean
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

  openPicker: (open: boolean) => void
  start: (caseId: string, level: Level) => void
  /** Starts an open exercise (no reference) on an empty model. */
  startExercise: (id: string) => void
  toggleChecklist: (item: number) => void
  /** Starts (or moves) the walkthrough of a case at a step. */
  walkTo: (caseId: string, step: number) => void
  /** Answers (or skips, with null) the question of the current walkthrough step, which reveals it. */
  answerWalk: (option: number | null) => void
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

  openPicker: (pickerOpen) => set({ pickerOpen }),

  start(caseId, level) {
    const c = caseById(caseId)
    if (!c) return
    const editor = useEditor.getState()
    const backup = editor.trainerBackup ?? editor.model
    useEditor.setState({
      model: levelStartModel(c, level),
      trainerBackup: backup,
      past: [],
      future: [],
      selection: null,
      tableSelection: null,
      focusedIssue: null,
      view: 'cdm',
      error: null,
      walkthrough: null,
    })
    set({ session: { caseId, level, tags: {}, openSpan: null, hintSteps: {} }, check: null, pickerOpen: false })
  },

  startExercise(id) {
    const x = exerciseById(id)
    if (!x) return
    const editor = useEditor.getState()
    useEditor.setState({
      model: { ...emptyModel(`${x.title} — my model`), comment: `Open exercise: ${x.title}.` },
      trainerBackup: editor.trainerBackup ?? editor.model,
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
      useEditor.setState({ model: trainerBackup, trainerBackup: null, past: [], future: [], selection: null, focusedIssue: null, walkthrough: null })
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
    const result = compareModels(model, c.build(), { synonyms: c.synonyms, scope: s.level === 2 ? 'links' : 'all' })
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

const stepCache = new Map<string, WalkStep[]>()
/** The walkthrough steps of a case, generated once per page. */
export function walkSteps(c: TrainerCase): WalkStep[] {
  let steps = stepCache.get(c.id)
  if (!steps) stepCache.set(c.id, (steps = walkthroughSteps(c)))
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

const suggestCache = new Map<string, NameSuggestions>()
/** Words of the open task's text for the name fields; null when off or nothing is typed in this task (levels 0–1, walkthrough). */
export function taskSuggestions(s: Session | null, on: boolean): NameSuggestions | null {
  if (!on || !s || s.walk !== undefined || s.level < 2) return null
  const spec = (s.exercise ? exerciseById(s.caseId) : caseById(s.caseId))?.spec
  if (!spec) return null
  let out = suggestCache.get(s.caseId)
  if (!out) suggestCache.set(s.caseId, (out = nameSuggestions(spec)))
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

/** After a reload: resume the open task with its working model. */
export function restoreTrainer() {
  const session = readJson<Session | null>(SESSION_KEY, null)
  if (!session || !(session.exercise ? exerciseById(session.caseId) : caseById(session.caseId))) return
  if (session.walk !== undefined) {
    // Set first, so walkTo keeps the answers given before the reload.
    useTrainer.setState({ session })
    return useTrainer.getState().walkTo(session.caseId, session.walk)
  }
  const model = loadStoredModel(TRAINER_MODEL_KEY) ?? (session.exercise ? emptyModel() : levelStartModel(caseById(session.caseId)!, session.level))
  const editor = useEditor.getState()
  useEditor.setState({ model, trainerBackup: editor.model, past: [], future: [] })
  useTrainer.setState({ session })
}
