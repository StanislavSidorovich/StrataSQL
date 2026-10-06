// Finished models of real databases (cases/quaera.md). Unlike the trainer cases they have no
// task text, tags or hints: they are read, not built. Shown under Examples → Real database and
// opened directly by `?example=<id>` (the link from quaera.app's Data screen).

import type { Model } from '../core/metamodel'
import { buildQuaera, QUAERA_URL } from './examples/quaera'

export interface ReferenceModel {
  id: string
  title: string
  build: () => Model
  /** Where the database itself can be queried: shown in the model panel and in the opening notice. */
  link: { label: string; url: string }
}

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: 'quaera',
    title: 'Quaera: sales analytics (star schema)',
    build: buildQuaera,
    link: { label: 'Query this database in Quaera', url: QUAERA_URL },
  },
]

export function referenceModelById(id: string | null): ReferenceModel | undefined {
  return id ? REFERENCE_MODELS.find((r) => r.id === id) : undefined
}

/** The reference model a model came from, by its name (a renamed copy loses the link, on purpose). */
export function referenceModelOf(model: Model): ReferenceModel | undefined {
  return REFERENCE_MODELS.find((r) => r.build().name === model.name)
}
