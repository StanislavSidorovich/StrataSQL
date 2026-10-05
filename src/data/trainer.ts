// Trainer tasks (SPEC §9): the model each level starts from, and the progress record.

import { emptyModel, type Model } from '../core/metamodel'
import type { TrainerCase } from './cases'

export type Level = 0 | 1 | 2 | 3

/**
 * Level 0–1: the reference model (read it / tag the text next to it).
 * Level 2: the reference entities with their attributes, without relationships and inheritances
 * (physical keys over migrated columns are dropped too — those columns do not exist yet).
 * Level 3: an empty model (a lesson practice: its own starting model).
 */
export function levelStartModel(c: TrainerCase, level: Level): Model {
  if (c.start && level === 3) return c.start()
  if (c.example && level === 0) return c.example()
  if (level === 3) return { ...emptyModel(`${c.title} — my model`), comment: `Trainer: ${c.title}, level 3 (build it yourself).` }
  const m = c.build()
  if (level < 2) return m
  return {
    ...m,
    name: `${c.title} — complete the model`,
    comment: `Trainer: ${c.title}, level 2. Add the relationships and inheritances.`,
    // Entity comments explain the solution (“Actor × Scene, no own id”), so they go too.
    entities: m.entities.map(({ physicalKeys: _keys, comment: _comment, ...e }) => e),
    relationships: [],
    inheritances: [],
  }
}

/** Best score per `caseId:level`, 0–100. */
export type Progress = Record<string, number>

export function progressKey(caseId: string, level: Level): string {
  return `${caseId}:${level}`
}

export function recordScore(p: Progress, caseId: string, level: Level, score: number): Progress {
  const k = progressKey(caseId, level)
  return score > (p[k] ?? -1) ? { ...p, [k]: score } : p
}

// ---------------------------------------------------------------- the learning path

/** One step of a case on the path: watch it built, then levels 1–3 (level 0 is optional reading). */
export type PathStep = 'walk' | 1 | 2 | 3

export const PATH: PathStep[] = ['walk', 1, 2, 3]

/** A level counts as done from this score ✱ (100 % is not required to move on; the best score stays visible). */
export const DONE_AT = 80

export function pathKey(caseId: string, step: PathStep): string {
  return step === 'walk' ? `${caseId}:walk` : progressKey(caseId, step)
}

/** Records that the walkthrough of a case was watched to the end. */
export function recordWalk(p: Progress, caseId: string): Progress {
  return p[pathKey(caseId, 'walk')] === 100 ? p : { ...p, [pathKey(caseId, 'walk')]: 100 }
}

export function isStepDone(p: Progress, caseId: string, step: PathStep): boolean {
  return (p[pathKey(caseId, step)] ?? -1) >= (step === 'walk' ? 100 : DONE_AT)
}

/** How many path steps of a case are done (0–4). */
export function stepsDone(p: Progress, caseId: string): number {
  return PATH.filter((s) => isStepDone(p, caseId, s)).length
}

/** The first step not done yet, cases in the given (easy → hard) order; null when everything is done. */
export function nextPathStep(p: Progress, caseIds: string[]): { caseId: string; step: PathStep } | null {
  for (const caseId of caseIds) for (const step of PATH) if (!isStepDone(p, caseId, step)) return { caseId, step }
  return null
}
