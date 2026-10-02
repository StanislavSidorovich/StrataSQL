// State of the SQL sandbox. The database lives as long as the page; it is recreated (empty)
// whenever the generated schema changes.

import { create } from 'zustand'
import { generatePostgres } from '../../core/ddl/postgres'
import { createPgliteEngine } from '../../core/engine-pglite'
import type { Pdm } from '../../core/pdm'
import { resetDatabase, run, type RunOutcome, type SqlEngine } from '../../core/sandbox'
import type { Scenario } from '../../data/scenarios'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface Executed {
  sql: string
  outcome: RunOutcome
  /** Set for scenario steps: did the outcome match the expectation? */
  expected?: boolean
}

interface SandboxState {
  status: EngineStatus
  statusMessage: string | null
  /** DDL the database was built from. */
  schema: string | null
  /** Bumped after every statement, so grids re-read their rows. */
  dataVersion: number
  last: Executed | null
  table: string | null
  /** Values typed in the insert row, per table. */
  drafts: Record<string, Record<string, string>>
  scenarioId: string | null
  /** Results of the steps of the open scenario, by index. */
  steps: Executed[]
  console: string
  setTable: (name: string | null) => void
  setDraft: (table: string, column: string, value: string) => void
  setConsole: (sql: string) => void
}

export const useSandbox = create<SandboxState>()((set) => ({
  status: 'idle',
  statusMessage: null,
  schema: null,
  dataVersion: 0,
  last: null,
  table: null,
  drafts: {},
  scenarioId: null,
  steps: [],
  console: '',
  setTable: (table) => set({ table }),
  setDraft: (table, column, value) => set((s) => ({ drafts: { ...s.drafts, [table]: { ...s.drafts[table], [column]: value } } })),
  setConsole: (console) => set({ console }),
}))

let enginePromise: Promise<SqlEngine> | null = null
let queue: Promise<unknown> = Promise.resolve()

/** Runs engine work one job at a time (a reset must not interleave with an insert). */
function serial<T>(job: (engine: SqlEngine) => Promise<T>): Promise<T> {
  if (!enginePromise) {
    useSandbox.setState({ status: 'loading', statusMessage: 'Starting PostgreSQL in your browser…' })
    enginePromise = createPgliteEngine()
    enginePromise.then(
      () => useSandbox.setState({ status: 'ready', statusMessage: null }),
      (e: Error) => {
        enginePromise = null
        useSandbox.setState({ status: 'failed', statusMessage: `Could not start the database engine: ${e.message}` })
      },
    )
  }
  const engine = enginePromise
  const next = queue.then(() => engine.then(job))
  queue = next.catch(() => undefined)
  return next
}

/** Makes sure the database has the schema of `pdm`; recreates it (empty) when the schema changed. */
export async function ensureSchema(pdm: Pdm): Promise<void> {
  const ddl = generatePostgres(pdm)
  const { schema } = useSandbox.getState()
  if (schema === ddl) return
  await serial((e) => resetDatabase(e, pdm))
  useSandbox.setState((s) => ({
    schema: ddl,
    dataVersion: s.dataVersion + 1,
    last: null,
    steps: [],
    statusMessage: schema === null ? null : 'The model changed, so the database was recreated with the new schema (empty).',
  }))
}

/** Empties all tables (schema stays); scenario steps start over. */
export async function resetData(pdm: Pdm): Promise<void> {
  await serial((e) => resetDatabase(e, pdm))
  useSandbox.setState((s) => ({
    schema: generatePostgres(pdm),
    dataVersion: s.dataVersion + 1,
    last: null,
    statusMessage: null,
    steps: [],
  }))
}

export async function execute(pdm: Pdm, sql: string): Promise<Executed> {
  const outcome = await serial((e) => run(e, pdm, sql))
  const executed = { sql, outcome }
  useSandbox.setState((s) => ({ last: executed, dataVersion: s.dataVersion + 1, statusMessage: null }))
  return executed
}

/** Read-only query for the grids; errors are returned, not shown as the last result. */
export function query(pdm: Pdm, sql: string): Promise<RunOutcome> {
  return serial((e) => run(e, pdm, sql))
}

export async function openScenario(pdm: Pdm, scenario: Scenario | null): Promise<void> {
  useSandbox.setState({ scenarioId: scenario?.id ?? null, steps: [] })
  if (scenario) await resetData(pdm)
}

export async function runStep(pdm: Pdm, scenario: Scenario, index: number): Promise<void> {
  const step = scenario.steps[index]
  const executed = await execute(pdm, step.sql)
  const got = executed.outcome.ok ? 'ok' : executed.outcome.violation.rejectedBy
  const want = step.expect === 'ok' ? 'ok' : step.expect.rejectedBy
  const result = { ...executed, expected: got === want }
  useSandbox.setState((s) => {
    const steps = [...s.steps]
    steps[index] = result
    return { steps, last: result }
  })
}
