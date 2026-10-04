// Generated SQL Server DDL with copy / download.

import { useMemo, useState, type ReactNode } from 'react'
import { generateSqlServer } from '../../core/ddl/sqlserver'
import { Check } from '../panels/fields'
import { useEditor, usePdm } from '../store'
import { saveExport } from '../fileSave'

const KEYWORDS =
  /\b(CREATE|TABLE|ALTER|ADD|CONSTRAINT|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|NOT|NULL|GO|DROP|IF|EXISTS|IS|IN|OBJECT_ID)\b/
const TYPES = /\b(int|smallint|bigint|decimal|float|money|bit|char|varchar|varbinary|date|time|datetime|max)\b/
const TOKEN = new RegExp(`${KEYWORDS.source}|${TYPES.source}|('[^']*')`, 'g')

/** Minimal T-SQL highlighting: comments, keywords, types, strings. */
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

export function fileBaseName(name: string): string {
  return (name || 'model').replace(/[^\p{L}\p{N}_-]+/gu, '_')
}

export function SqlView() {
  const pdm = usePdm()
  const name = useEditor((s) => s.model.name)
  const [drop, setDrop] = useState(false)
  const [copied, setCopied] = useState(false)
  const sql = useMemo(() => generateSqlServer(pdm, { drop }), [pdm, drop])
  const lines = useMemo(() => highlightSql(sql), [sql])

  const copy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => void saveExport(`${fileBaseName(name)}.sql`, 'sql', () => new Blob([sql], { type: 'text/plain' }))

  return (
    <div className="sql-view">
      <div className="sql-toolbar">
        <span className="muted">SQL Server · {pdm.tables.length} tables</span>
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
      <pre className="sql-code" data-testid="sql-code">
        <code>{lines}</code>
      </pre>
    </div>
  )
}
