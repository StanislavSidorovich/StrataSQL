// Generated DDL (SQL Server for the course, or PostgreSQL for pgAdmin / psql) with copy / download.

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { generatePostgres } from '../../core/ddl/postgres'
import { generateSqlServer } from '../../core/ddl/sqlserver'
import { Check } from '../panels/fields'
import { useEditor, usePdm } from '../store'
import { saveExport } from '../fileSave'
import { LAB_URL, labUrl } from '../../core/shareLink'

const KEYWORDS =
  /\b(CREATE|TABLE|ALTER|ADD|CONSTRAINT|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|NOT|NULL|GO|DROP|IF|EXISTS|IS|IN|OBJECT_ID)\b/
const TYPES = /\b(int|smallint|bigint|decimal|float|money|bit|char|varchar|varbinary|date|time|datetime|max)\b/
const TOKEN = new RegExp(`${KEYWORDS.source}|${TYPES.source}|('[^']*')`, 'g')

/** Minimal SQL highlighting (T-SQL and PostgreSQL): comments, keywords, types, strings. */
export function highlightSql(sql: string): ReactNode[] {
  return sql.split('\n').map((line, i) => {
    const out: ReactNode[] = []
    const commentAt = line.indexOf('--')
    const code = commentAt >= 0 ? line.slice(0, commentAt) : line
    let last = 0
    for (const m of code.matchAll(TOKEN)) {
      if (m.index > last) out.push(code.slice(last, m.index))
      const cls = m[1] ? 'sql-kw' : m[2] ? 'sql-type' : 'sql-str'
      out.push(
        <span key={m.index} className={cls}>
          {m[0]}
        </span>,
      )
      last = m.index + m[0].length
    }
    if (last < code.length) out.push(code.slice(last))
    if (commentAt >= 0)
      out.push(
        <span key="c" className="sql-comment">
          {line.slice(commentAt)}
        </span>,
      )
    return (
      <div key={i} className="sql-line">
        {out.length ? out : ' '}
      </div>
    )
  })
}

/** Ctrl/Cmd+A inside a focused block selects that block's text instead of the page. */
function selectAllInside(e: ReactKeyboardEvent<HTMLElement>) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'a') return
  e.preventDefault()
  const sel = window.getSelection()
  sel?.removeAllRanges()
  const range = document.createRange()
  range.selectNodeContents(e.currentTarget)
  sel?.addRange(range)
}

export function fileBaseName(name: string): string {
  return (name || 'model').replace(/[^\p{L}\p{N}_-]+/gu, '_')
}

type Dialect = 'sqlserver' | 'postgres'
const DIALECT_KEY = 'stratasql.sqlDialect'

/** The chosen dialect, remembered per browser (most students stay with one database). */
function useDialect(): [Dialect, (d: Dialect) => void] {
  const [dialect, setDialect] = useState<Dialect>(() => {
    try {
      return localStorage.getItem(DIALECT_KEY) === 'postgres' ? 'postgres' : 'sqlserver'
    } catch {
      return 'sqlserver'
    }
  })
  const set = (d: Dialect) => {
    setDialect(d)
    try {
      localStorage.setItem(DIALECT_KEY, d)
    } catch {
      /* private mode: the choice is not remembered */
    }
  }
  return [dialect, set]
}

const DIALECTS: { id: Dialect; label: string; title: string }[] = [
  { id: 'sqlserver', label: 'SQL Server', title: 'T-SQL with GO between batches, as PowerDesigner generates it (SSMS, Azure Data Studio)' },
  { id: 'postgres', label: 'PostgreSQL', title: 'PostgreSQL types, no GO: runs as is in pgAdmin or psql' },
]

// On a dev machine the link goes to StrataLab's dev server (its .claude/launch.json, port 5180).
const LAB = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:5180/' : LAB_URL

/**
 * "Open in StrataLab": the PostgreSQL DDL (whatever dialect is shown) packed into a link, so the
 * tables appear empty, with their keys, in the SQL workbench. Built ahead so the click is a plain
 * link: a window opened after an await may be blocked. The named target reuses the StrataLab tab
 * opened before (it reads a new `#ddl=` without reloading); a second StrataLab tab could not open
 * the saved database, which only one tab may hold.
 */
function useLabLink(pdm: ReturnType<typeof usePdm>): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (pdm.tables.length) void labUrl(generatePostgres(pdm), LAB).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [pdm])
  return url
}

export function SqlView() {
  const pdm = usePdm()
  const name = useEditor((s) => s.model.name)
  const [dialect, setDialect] = useDialect()
  const [drop, setDrop] = useState(false)
  const [copied, setCopied] = useState(false)
  const sql = useMemo(() => (dialect === 'postgres' ? generatePostgres(pdm, { drop }) : generateSqlServer(pdm, { drop })), [pdm, dialect, drop])
  const lines = useMemo(() => highlightSql(sql), [sql])
  const labLink = useLabLink(pdm)

  const copy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => void saveExport(`${fileBaseName(name)}${dialect === 'postgres' ? '.postgres' : ''}.sql`, 'sql', () => new Blob([sql], { type: 'text/plain' }))

  return (
    <div className="sql-view">
      <div className="sql-toolbar">
        <div className="segmented" role="radiogroup" aria-label="SQL dialect">
          {DIALECTS.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={dialect === d.id} className={dialect === d.id ? 'on' : ''} onClick={() => setDialect(d.id)} title={d.title}>
              {d.label}
            </button>
          ))}
        </div>
        <a
          className={`btn${labLink ? '' : ' disabled'}`}
          href={labLink ?? undefined}
          target="stratalab"
          aria-disabled={!labLink}
          title="Create these tables, empty and with their keys, in StrataLab (lab.quaera.app): a SQL workbench in your browser where you can fill and query them. The PostgreSQL script travels in the link; nothing is uploaded."
        >
          Open in StrataLab ↗
        </a>
        <span className="muted">{pdm.tables.length} tables</span>
        <Check checked={drop} onChange={setDrop} label="DROP old tables first" title="Lets you re-run the script on the same database" />
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" className="btn btn-primary" onClick={download}>
            Download .sql
          </button>
        </div>
      </div>
      {/* Focusable, so Ctrl+A after a click selects the script only, not the whole page. */}
      <pre className="sql-code" data-testid="sql-code" tabIndex={0} aria-label="SQL script" onKeyDown={selectAllInside}>
        <code>{lines}</code>
      </pre>
    </div>
  )
}
