// Help drawer: the glossary (searchable list of concepts) and one card at a time (SPEC §8).
// A card's PDM and SQL are generated from its mini-model.

import { useReactFlow } from '@xyflow/react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { generatePdm } from '../../core/cdm2pdm'
import { generateSqlServer } from '../../core/ddl/sqlserver'
import { columnFlags } from '../../core/pdm'
import { helpCard, searchHelp, type HelpCard } from '../../data/help'
import { highlightSql } from '../pdm/SqlView'
import { useEditor } from '../store'
import { MiniDiagram } from './MiniDiagram'

/** `**bold**`, `*italic*` and `code` inline markup. */
export function richText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <i key={i}>{part.slice(1, -1)}</i>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function HelpDrawer() {
  const help = useEditor((s) => s.help)
  const { openHelp, closeHelp } = useEditor.getState()
  if (help === null) return null
  const card = help ? helpCard(help) : undefined
  // Start below the toolbar, which wraps onto two rows on narrow screens.
  const top = document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 49
  return (
    <aside className="help-drawer" aria-label="Help" style={{ top }}>
      <header className="help-drawer-header">
        {card ? (
          <button type="button" className="btn btn-small" onClick={() => openHelp()}>
            ← All concepts
          </button>
        ) : (
          <h2>Concepts</h2>
        )}
        <button type="button" className="icon-btn ml-auto" title="Close help" aria-label="Close help" onClick={closeHelp}>
          ✕
        </button>
      </header>
      <div className="help-drawer-body">{card ? <CardView key={card.id} card={card} /> : <Glossary />}</div>
    </aside>
  )
}

function Glossary() {
  const [query, setQuery] = useState('')
  const openHelp = useEditor((s) => s.openHelp)
  const cards = searchHelp(query)
  return (
    <div className="flex flex-col gap-2">
      <input className="input" placeholder="Search: weak, origin, average…" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} aria-label="Search concepts" />
      <ul className="glossary">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => openHelp(c.id)}>
              <b>{c.title}</b>
              <span>{richText(c.oneLiner)}</span>
            </button>
          </li>
        ))}
        {cards.length === 0 && <li className="muted">Nothing found.</li>}
      </ul>
    </div>
  )
}

function CardView({ card }: { card: HelpCard }) {
  const openHelp = useEditor((s) => s.openHelp)
  const flow = useReactFlow()
  const model = useMemo(() => card.miniModel?.(), [card])
  const pdm = useMemo(() => (model ? generatePdm(model) : null), [model])
  const sql = useMemo(() => (pdm ? generateSqlServer(pdm) : ''), [pdm])

  const openAsModel = () => {
    if (!card.miniModel) return
    const { load, setView } = useEditor.getState()
    setView('cdm')
    load(card.miniModel())
    setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 80)
  }

  return (
    <article className="help-card" data-testid={`help-${card.id}`}>
      <h2>{card.title}</h2>
      <p className="help-oneliner">{richText(card.oneLiner)}</p>
      {card.body.map((p, i) => (
        <p key={i}>{richText(p)}</p>
      ))}

      {model && (
        <section>
          <h3>Example</h3>
          <MiniDiagram model={model} />
          <button type="button" className="btn btn-small" onClick={openAsModel} title="Replace the current model with this example (Ctrl+Z brings yours back)">
            Open as model
          </button>
        </section>
      )}

      {pdm && (
        <section>
          <h3>In the physical model</h3>
          <ul className="help-tables">
            {pdm.tables.map((t) => {
              const flags = columnFlags(t)
              return (
                <li key={t.name}>
                  <b>{t.name}</b> (
                  {t.columns.map((c, i) => (
                    <span key={c.name}>
                      {i > 0 && ', '}
                      <span className={c.migrated ? 'is-migrated' : ''}>{c.name}</span>
                      {flags.get(c.name)!.length > 0 && <span className="muted"> {flags.get(c.name)!.join(',')}</span>}
                    </span>
                  ))}
                  )
                </li>
              )
            })}
          </ul>
          <p className="muted">
            <span className="is-migrated">Green</span> columns arrived through a foreign key.
          </p>
          <details>
            <summary>SQL Server DDL</summary>
            <pre className="sql-code help-sql">
              <code>{highlightSql(sql)}</code>
            </pre>
          </details>
        </section>
      )}

      <section>
        <h3>When the text says…</h3>
        <ul className="help-list">
          {card.whenToUse.map((w) => (
            <li key={w}>{richText(w)}</li>
          ))}
        </ul>
      </section>

      <section className="help-mistake">
        <h3>Typical mistake</h3>
        <p>{richText(card.typicalMistake)}</p>
      </section>

      {card.caseRefs.length > 0 && (
        <section>
          <h3>In the course cases</h3>
          <ul className="help-list">
            {card.caseRefs.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {card.seeAlso.length > 0 && (
        <section>
          <h3>See also</h3>
          <div className="chips">
            {card.seeAlso.map((id) => (
              <button key={id} type="button" className="chip" onClick={() => openHelp(id)}>
                {helpCard(id)?.title ?? id}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
