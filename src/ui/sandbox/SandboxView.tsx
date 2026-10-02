// SQL sandbox (stage 2.5): the generated schema runs in PostgreSQL inside the browser (PGlite).
// Insert rows per table, run free SQL, or follow a "try this" scenario — every rejection names the
// constraint and links back to the CDM element that produced it.

import { useEffect, useState } from 'react'
import { pgIdent } from '../../core/ddl/postgres'
import { columnFlags, findTable, type Pdm, type PdmTable } from '../../core/pdm'
import { cellHint, deleteStatement, insertStatement, selectStatement, type SqlResult } from '../../core/sandbox'
import { scenariosFor, type Scenario } from '../../data/scenarios'
import { SourceLink } from '../pdm/PdmPanel'
import { Section } from '../panels/fields'
import { usePdm, useModel } from '../store'
import { ensureSchema, execute, openScenario, query, resetData, runStep, useSandbox, type Executed } from './sandboxStore'

export function SandboxView() {
  const pdm = usePdm()
  const status = useSandbox((s) => s.status)
  const statusMessage = useSandbox((s) => s.statusMessage)

  useEffect(() => {
    void ensureSchema(pdm)
  }, [pdm])

  return (
    <div className="flex min-h-0 flex-1">
      <main className="sandbox-main">
        <div className="sql-toolbar">
          <span className="muted">
            PostgreSQL in your browser · {pdm.tables.length} tables
            {status === 'loading' && ' · starting…'}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn" disabled={status !== 'ready'} onClick={() => void resetData(pdm)} title="Delete all rows, keep the tables">
              Empty all tables
            </button>
          </div>
        </div>
        {statusMessage && <div className={`sandbox-status ${status === 'failed' ? 'is-error' : ''}`}>{statusMessage}</div>}
        {pdm.tables.length === 0 ? (
          <div className="sandbox-empty">No tables yet — build a conceptual model first, or open an example.</div>
        ) : (
          <>
            <TableBrowser pdm={pdm} />
            <SqlConsole pdm={pdm} />
          </>
        )}
      </main>
      <aside className="panel" aria-label="Sandbox">
        <LastResult />
        <Scenarios pdm={pdm} />
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- tables

function useRowCounts(pdm: Pdm): Record<string, number> {
  const version = useSandbox((s) => s.dataVersion)
  const schema = useSandbox((s) => s.schema)
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!schema || !pdm.tables.length) return
    const sql = pdm.tables.map((t) => `SELECT '${t.name}' AS t, count(*) AS n FROM ${pgIdent(t.name)}`).join(' UNION ALL ')
    let live = true
    void query(pdm, sql).then((out) => {
      if (live && out.ok) setCounts(Object.fromEntries(out.results.at(-1)!.rows.map((r) => [r[0] as string, Number(r[1])])))
    })
    return () => {
      live = false
    }
  }, [pdm, version, schema])
  return counts
}

function TableBrowser({ pdm }: { pdm: Pdm }) {
  const selected = useSandbox((s) => s.table)
  const setTable = useSandbox((s) => s.setTable)
  const counts = useRowCounts(pdm)
  const table = (selected && findTable(pdm, selected)) || pdm.tables[0]
  return (
    <section className="sandbox-tables">
      <div className="table-tabs" role="tablist" aria-label="Tables">
        {pdm.tables.map((t) => (
          <button key={t.name} type="button" role="tab" aria-selected={t === table} className={`chip ${t === table ? 'on' : ''}`} onClick={() => setTable(t.name)}>
            {t.name} <span className="muted">{counts[t.name] ?? '·'}</span>
          </button>
        ))}
      </div>
      {table && <TableGrid key={table.name} pdm={pdm} table={table} />}
    </section>
  )
}

function TableGrid({ pdm, table }: { pdm: Pdm; table: PdmTable }) {
  const version = useSandbox((s) => s.dataVersion)
  const schema = useSandbox((s) => s.schema)
  const status = useSandbox((s) => s.status)
  const draft = useSandbox((s) => s.drafts[table.name]) ?? {}
  const setDraft = useSandbox((s) => s.setDraft)
  const last = useSandbox((s) => s.last)
  const [rows, setRows] = useState<SqlResult | null>(null)
  const flags = columnFlags(table)
  const v = last && !last.outcome.ok ? last.outcome.violation : null
  const rejected = new Set(v && v.table === table.name ? v.columns : [])

  useEffect(() => {
    if (!schema) return
    let live = true
    void query(pdm, selectStatement(table)).then((out) => live && setRows(out.ok ? out.results.at(-1)! : null))
    return () => {
      live = false
    }
  }, [pdm, table, version, schema])

  const insert = () => void execute(pdm, insertStatement(table, draft))
  const remove = (row: (string | null)[]) => {
    const sql = deleteStatement(table, Object.fromEntries(table.columns.map((c, i) => [c.name, row[i]])))
    if (sql) void execute(pdm, sql)
  }

  return (
    <div className="grid-scroll">
      <table className="data-grid" data-testid="table-grid">
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.name} className={`${c.migrated ? 'is-migrated' : ''} ${rejected.has(c.name) ? 'is-rejected' : ''}`} title={c.comment}>
                {c.name}
                {!!flags.get(c.name)?.length && <span className="grid-flags">{flags.get(c.name)!.join(',')}</span>}
              </th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows?.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell === null ? <span className="null">NULL</span> : cell}</td>
              ))}
              <td className="grid-actions">
                {table.primaryKey && (
                  <button type="button" className="icon-btn danger" title="Delete this row" onClick={() => remove(r)}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className="insert-row">
            {table.columns.map((c) => (
              <td key={c.name}>
                <input
                  className="input"
                  aria-label={`New ${c.name}`}
                  placeholder={cellHint(c)}
                  value={draft[c.name] ?? ''}
                  onChange={(e) => setDraft(table.name, c.name, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && insert()}
                />
              </td>
            ))}
            <td className="grid-actions">
              <button type="button" className="btn btn-primary btn-small" disabled={status !== 'ready'} onClick={insert}>
                Insert
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted grid-hint">Empty cell = NULL · * = NOT NULL · Enter inserts the row</p>
    </div>
  )
}

// ---------------------------------------------------------------- console

function SqlConsole({ pdm }: { pdm: Pdm }) {
  const sql = useSandbox((s) => s.console)
  const setConsole = useSandbox((s) => s.setConsole)
  const status = useSandbox((s) => s.status)
  const first = pdm.tables[0]?.name ?? 'table'
  const go = () => sql.trim() && void execute(pdm, sql)
  return (
    <section className="sandbox-console">
      <div className="panel-section-header">
        <h3>SQL console</h3>
        <button type="button" className="btn btn-primary btn-small" disabled={status !== 'ready' || !sql.trim()} onClick={go} title="Run (Ctrl+Enter)">
          Run
        </button>
      </div>
      <textarea
        className="input console-input"
        spellCheck={false}
        aria-label="SQL console"
        placeholder={`SELECT * FROM ${first};   — Ctrl+Enter runs`}
        value={sql}
        onChange={(e) => setConsole(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            go()
          }
        }}
      />
    </section>
  )
}

// ---------------------------------------------------------------- side panel

function ResultTable({ result }: { result: SqlResult }) {
  return (
    <div className="grid-scroll result-scroll">
      <table className="data-grid">
        <thead>
          <tr>
            {result.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell === null ? <span className="null">NULL</span> : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Outcome({ executed }: { executed: Executed }) {
  const { outcome } = executed
  if (outcome.ok) {
    const last = outcome.results.at(-1)
    const changed = outcome.results.reduce((n, r) => n + (r.columns.length ? 0 : (r.affected ?? 0)), 0)
    return (
      <div className="outcome outcome-ok" data-testid="outcome">
        <strong>✓ Accepted</strong>
        {last && last.columns.length > 0 ? (
          <>
            <span className="muted">{last.rows.length} row(s)</span>
            <ResultTable result={last} />
          </>
        ) : (
          <span className="muted">{changed} row(s) changed</span>
        )}
      </div>
    )
  }
  const v = outcome.violation
  return (
    <div className="outcome outcome-fail" data-testid="outcome">
      <strong>✗ {v.title}</strong>
      <p>{v.explanation}</p>
      {v.source && (
        <p>
          From the conceptual model: <SourceLink source={v.source} />
        </p>
      )}
      <details>
        <summary className="muted">PostgreSQL says</summary>
        <pre className="engine-message">{v.engineMessage}</pre>
      </details>
    </div>
  )
}

function LastResult() {
  const last = useSandbox((s) => s.last)
  return (
    <Section title="Last statement">
      {last ? (
        <>
          <pre className="stmt">{last.sql}</pre>
          <Outcome executed={last} />
        </>
      ) : (
        <p className="muted">Insert a row, run SQL in the console or follow a scenario. If the database rejects something, you will see which constraint did it — and which part of the conceptual model created that constraint.</p>
      )}
    </Section>
  )
}

function Scenarios({ pdm }: { pdm: Pdm }) {
  const model = useModel()
  const scenarioId = useSandbox((s) => s.scenarioId)
  const steps = useSandbox((s) => s.steps)
  const status = useSandbox((s) => s.status)
  const list = scenariosFor(model.name)
  const open = list.find((s) => s.id === scenarioId) ?? null

  if (!list.length)
    return (
      <Section title="Try this">
        <p className="muted">Guided scenarios exist for the worked examples (TV Shows, Timetables, Ride Hailing). Open one from Examples… to try them.</p>
      </Section>
    )

  if (!open)
    return (
      <Section title="Try this">
        <p className="muted">Each scenario empties the tables, then inserts a valid row and a conflicting one.</p>
        <ul className="scenario-list">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" className="link-button" disabled={status !== 'ready'} onClick={() => void openScenario(pdm, s)}>
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    )

  return <ScenarioSteps pdm={pdm} scenario={open} done={steps} busy={status !== 'ready'} />
}

function ScenarioSteps({ pdm, scenario, done, busy }: { pdm: Pdm; scenario: Scenario; done: Executed[]; busy: boolean }) {
  const next = done.length
  const finished = next >= scenario.steps.length
  const runNext = () => void runStep(pdm, scenario, next)
  const runAll = async () => {
    for (let i = useSandbox.getState().steps.length; i < scenario.steps.length; i++) await runStep(pdm, scenario, i)
  }
  return (
    <Section
      title="Try this"
      actions={
        <button type="button" className="link-button" onClick={() => void openScenario(pdm, null)}>
          ← all scenarios
        </button>
      }
    >
      <h4 className="scenario-title">{scenario.title}</h4>
      <p className="muted">{scenario.intro}</p>
      <ol className="step-list">
        {scenario.steps.map((step, i) => {
          const r = done[i]
          const state = r ? (r.expected ? 'is-as-expected' : 'is-unexpected') : i === next ? 'is-next' : ''
          return (
            <li key={i} className={`step ${state}`} data-testid="scenario-step">
              <div className="step-head">
                <span className="step-mark">{r ? (r.outcome.ok ? '✓' : '✗') : i + 1}</span>
                <span>{step.title}</span>
              </div>
              <pre className="stmt">{step.sql}</pre>
              {r && (
                <p className="step-why">
                  {r.outcome.ok ? 'Accepted. ' : `Rejected by ${r.outcome.violation.rejectedBy ?? 'the database'}. `}
                  {step.why}
                  {!r.expected && (
                    <span className="step-warn">
                      {' '}
                      Expected {step.expect === 'ok' ? 'it to be accepted' : `${step.expect.rejectedBy} to reject it`} — your model differs from the reference.
                    </span>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex gap-2">
        {finished ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void openScenario(pdm, scenario)}>
            Run again
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={runNext}>
              Run step {next + 1}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void runAll()}>
              Run all
            </button>
          </>
        )}
      </div>
    </Section>
  )
}
