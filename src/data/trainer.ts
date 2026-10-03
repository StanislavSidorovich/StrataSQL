// Trainer tasks (SPEC §9): the model each level starts from, and the progress record.

import { emptyModel, type Model } from '../core/metamodel'
import type { TrainerCase } from './cases'

export type Level = 0 | 1 | 2 | 3

/**
 * Level 0–1: the reference model (read it / tag the text next to it).
 * Level 2: the reference entities with their attributes, without relationships and inheritances
 * (physical keys over migrated columns are dropped too — those columns do not exist yet).
 * Level 3: an empty model.
 */
export function levelStartModel(c: TrainerCase, level: Level): Model {
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
