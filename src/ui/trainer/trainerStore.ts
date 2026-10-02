// Trainer session (SPEC §9): which case and level is open, the text tags, the last check and the
// hint steps. The working model lives in the editor store; the user's own model waits in
// `trainerBackup` until the trainer is closed.

import { create } from 'zustand'
import { compareModels, type CompareResult } from '../../core/compare'
import { caseById, type Tag, type TrainerCase } from '../../data/cases'
import { levelStartModel, recordScore, type Level, type Progress } from '../../data/trainer'
import { lintFor, loadStoredModel, TRAINER_MODEL_KEY, useEditor } from '../store'

const SESSION_KEY = 'stratasql.trainer.session'
const PROGRESS_KEY = 'stratasql.trainer.progress'

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
}

interface TrainerState {
  /** The case picker is shown (no session yet, or the user asked for it). */
  pickerOpen: boolean
  session: Session | null
  check: Check | null
  progress: Progress

  openPicker: (open: boolean) => void
  start: (caseId: string, level: Level) => void
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
    })
    set({ session: { caseId, level, tags: {}, openSpan: null, hintSteps: {} }, check: null, pickerOpen: false })
  },

  exit() {
    const { trainerBackup } = useEditor.getState()
    if (trainerBackup)
      useEditor.setState({ model: trainerBackup, trainerBackup: null, past: [], future: [], selection: null, focusedIssue: null })
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
    if (s) set({ session: { ...s, tags: {}, openSpan: null } })
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
  const progress = recordScore(useTrainer.getState().progress, c.id, level, score)
  if (progress === useTrainer.getState().progress) return
  useTrainer.setState({ progress })
  writeJson(PROGRESS_KEY, progress)
}

// ---------------------------------------------------------------- persistence

useTrainer.subscribe((state, prev) => {
  if (state.session !== prev.session) writeJson(SESSION_KEY, state.session)
})

/** After a reload: resume the open task with its working model. */
export function restoreTrainer() {
  const session = readJson<Session | null>(SESSION_KEY, null)
  if (!session || !caseById(session.caseId)) return
  const model = loadStoredModel(TRAINER_MODEL_KEY) ?? levelStartModel(caseById(session.caseId)!, session.level)
  const editor = useEditor.getState()
  useEditor.setState({ model, trainerBackup: editor.model, past: [], future: [] })
  useTrainer.setState({ session })
}
