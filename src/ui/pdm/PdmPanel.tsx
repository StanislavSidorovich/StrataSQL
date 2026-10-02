// Side panel of the physical and SQL views: model overview with generation notes, or the selected
// table with the origin of every column and its keys. AKs over migrated columns are edited here.

import { sqlServerType } from '../../core/ddl/sqlserver'
import type { Model } from '../../core/metamodel'
import { addPhysicalKey, removePhysicalKey, togglePhysicalKeyColumn, updatePhysicalKey } from '../../core/ops'
import { columnFlags, findTable, type Pdm, type PdmColumn, type PdmNote, type PdmSource, type PdmTable } from '../../core/pdm'
import { Section, TextInput } from '../panels/fields'
import { useEditor, usePdm } from '../store'

/** Switches to the conceptual view with the element that produced `source` selected. */
export function showInCdm(source: PdmSource): void {
  const { select, setView } = useEditor.getState()
  setView('cdm')
  if (source.kind === 'entity') select({ kind: 'entity', id: source.id })
  else if (source.kind === 'attribute' || source.kind === 'identifier' || source.kind === 'physicalKey') select({ kind: 'entity', id: source.entityId })
  else if (source.kind === 'relationship') select({ kind: 'relationship', id: source.id.split(':')[0] })
  else select({ kind: 'inheritance', id: source.id })
}

/** Human name of a CDM element. */
function sourceLabel(m: Model, s: PdmSource): string {
  const entity = (id: string) => m.entities.find((e) => e.id === id)?.name ?? '?'
  switch (s.kind) {
    case 'entity':
      return `entity ${entity(s.id)}`
    case 'attribute':
      return `attribute of ${entity(s.entityId)}`
    case 'identifier': {
      const e = m.entities.find((x) => x.id === s.entityId)
      return `identifier ${e?.identifiers.find((i) => i.id === s.identifierId)?.name ?? '?'} of ${e?.name ?? '?'}`
    }
    case 'physicalKey':
      return `key over columns, ${entity(s.entityId)}`
    case 'relationship':
      return `relationship ${m.relationships.find((r) => r.id === s.id.split(':')[0])?.name ?? '?'}`
    case 'inheritance':
      return `inheritance ${m.inheritances.find((i) => i.id === s.id)?.name ?? '?'}`
  }
}

export function SourceLink({ source }: { source: PdmSource }) {
  const model = useEditor((s) => s.model)
  return (
    <span className="link" onClick={() => showInCdm(source)} title="Show in the conceptual model">
      {sourceLabel(model, source)}
    </span>
  )
}

export function PdmPanel() {
  const pdm = usePdm()
  const selected = useEditor((s) => s.tableSelection)
  const table = selected ? findTable(pdm, selected) : undefined
  return table ? <TablePanel key={table.name} table={table} pdm={pdm} /> : <Overview pdm={pdm} />
}

function Notes({ notes }: { notes: PdmNote[] }) {
  const selectTable = useEditor((s) => s.selectTable)
  if (!notes.length) return <p className="muted">Nothing to report.</p>
  const sorted = [...notes].sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1))
  return (
    <ul className="note-list">
      {sorted.map((n) => (
        <li key={n.message} className={`note note-${n.level}`}>
          <span className="note-icon" aria-label={n.level}>
            {n.level === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span>
            {n.message}
            {n.table && (
              <>
                {' '}
                <span className="link" onClick={() => selectTable(n.table!)}>
                  open {n.table}
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Overview({ pdm }: { pdm: Pdm }) {
  const selectTable = useEditor((s) => s.selectTable)
  const fkCount = pdm.tables.reduce((n, t) => n + t.foreignKeys.length, 0)
  const warnings = pdm.notes.filter((n) => n.level === 'warning').length
  return (
    <div>
      <Section title="Physical model">
        <p>
          <b>{pdm.tables.length}</b> tables, <b>{fkCount}</b> foreign keys
          {warnings > 0 && (
            <>
              , <b className="text-[var(--danger)]">{warnings}</b> warning{warnings > 1 ? 's' : ''}
            </>
          )}
          .
        </p>
        <p className="muted">
          Generated from the conceptual model — change the CDM to change the tables. Click a table for details.
        </p>
        <div className="legend">
          <span>
            <b>&lt;pk&gt;</b> primary key
          </span>
          <span>
            <b>&lt;fk1&gt;</b> foreign key
          </span>
          <span>
            <b>&lt;ak&gt;</b> alternate key (UNIQUE)
          </span>
          <span className="is-migrated">column migrated through a FK</span>
        </div>
      </Section>
      <Section title="Generation notes">
        <Notes notes={pdm.notes} />
      </Section>
      <Section title="Tables">
        <div className="chips">
          {pdm.tables.map((t) => (
            <button key={t.name} type="button" className="chip" onClick={() => selectTable(t.name)}>
              {t.name}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

/** Where the value of a column comes from, in words. */
function columnOrigin(t: PdmTable, c: PdmColumn): string {
  const fks = t.foreignKeys.filter((f) => f.columns.includes(c.name))
  if (fks.length) return `from ${fks.map((f) => f.refTable).join(' and ')}`
  if (c.source.kind === 'inheritance') return 'discriminator'
  return c.migrated ? 'migrated' : 'attribute'
}

function TablePanel({ table: t, pdm }: { table: PdmTable; pdm: Pdm }) {
  const model = useEditor((s) => s.model)
  const apply = useEditor((s) => s.apply)
  const selectTable = useEditor((s) => s.selectTable)
  const flags = columnFlags(t)
  const notes = pdm.notes.filter((n) => n.table === t.name)
  const entityId = t.source.kind === 'entity' ? t.source.id : undefined
  const entity = model.entities.find((e) => e.id === entityId)
  const referencedBy = pdm.tables.flatMap((x) => x.foreignKeys.filter((f) => f.refTable === t.name).map((f) => ({ table: x.name, fk: f })))

  return (
    <div>
      <Section title={`Table ${t.name}`}>
        <p className="muted">
          {t.source.kind === 'relationship' ? 'Join table of ' : 'Generated from '}
          <SourceLink source={t.source} />
        </p>
        {t.comment && <p className="muted italic">{t.comment}</p>}
        <div className="col-grid">
          <span className="attr-grid-head">column</span>
          <span className="attr-grid-head">type</span>
          <span className="attr-grid-head">null</span>
          <span className="attr-grid-head">keys</span>
          <span className="attr-grid-head">comes from</span>
          {t.columns.map((c) => {
            const f = flags.get(c.name) ?? []
            return (
              <div key={c.name} className="contents">
                <span className={`truncate ${c.migrated ? 'is-migrated' : ''} ${f.includes('pk') ? 'attr-pi' : ''}`} title={c.name}>
                  {c.name}
                </span>
                <span className="muted truncate">{sqlServerType(c)}</span>
                <span className="muted">{c.nullable ? 'yes' : 'no'}</span>
                <span className="attr-flags truncate">{f.length > 0 && <b>{f.join(',')}</b>}</span>
                <span className="muted truncate" title={columnOrigin(t, c)}>
                  {columnOrigin(t, c)}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Keys" help="alternate-identifier">
        <dl className="key-list">
          <dt>Primary key</dt>
          <dd>{t.primaryKey ? `${t.primaryKey.name} (${t.primaryKey.columns.join(', ')})` : <span className="text-[var(--danger)]">none</span>}</dd>
          {t.foreignKeys.map((fk, i) => (
            <div key={fk.name} className="contents">
              <dt>
                Foreign key{t.foreignKeys.length > 1 ? ` ${i + 1}` : ''}
                {fk.identifying && <span className="badge">identifying</span>}
              </dt>
              <dd>
                {fk.name}: ({fk.columns.join(', ')}) →{' '}
                <span className="link" onClick={() => selectTable(fk.refTable)}>
                  {fk.refTable}
                </span>{' '}
                ({fk.refColumns.join(', ')}){fk.mandatory ? '' : ', optional'}
                <br />
                <span className="muted">
                  from <SourceLink source={fk.source} />
                </span>
              </dd>
            </div>
          ))}
          {t.alternateKeys.map((ak, i) => (
            <div key={ak.name} className="contents">
              <dt>Alternate key{t.alternateKeys.length > 1 ? ` ${i + 1}` : ''}</dt>
              <dd>
                {ak.name} UNIQUE ({ak.columns.join(', ')})
                {ak.source && (
                  <>
                    <br />
                    <span className="muted">
                      from <SourceLink source={ak.source} />
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
          {t.checks.map((ck) => (
            <div key={ck.name} className="contents">
              <dt>Check</dt>
              <dd>
                {ck.name}: {ck.expression}
              </dd>
            </div>
          ))}
          {referencedBy.length > 0 && (
            <>
              <dt>Referenced by</dt>
              <dd>
                {referencedBy.map((r, i) => (
                  <span key={r.fk.name}>
                    {i > 0 && ', '}
                    <span className="link" onClick={() => selectTable(r.table)} title={r.fk.name}>
                      {r.table}
                    </span>
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </Section>

      {entity && (
        <Section
          title="Keys over columns"
          help="business-rule"
          actions={
            <button type="button" className="btn btn-small" onClick={() => apply((m) => addPhysicalKey(m, entity.id))}>
              + Key
            </button>
          }
        >
          <p className="muted">
            A UNIQUE key may use columns that only exist in the table — e.g. columns migrated through FKs. This is how
            business rules become constraints (Timetables: no two classes in one room at the same time).
          </p>
          {(entity.physicalKeys ?? []).map((k) => (
            <div key={k.id} className="ident-card">
              <div className="flex items-center gap-2">
                <TextInput
                  ariaLabel="Key name"
                  value={k.name}
                  onChange={(v) => apply((m) => updatePhysicalKey(m, entity.id, k.id, { name: v }), { coalesce: `pkn:${k.id}` })}
                />
                <button type="button" className="icon-btn danger" title="Delete key" onClick={() => apply((m) => removePhysicalKey(m, entity.id, k.id))}>
                  ✕
                </button>
              </div>
              <div className="chips">
                {t.columns.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`chip ${k.columns.some((x) => x.toLowerCase() === c.name.toLowerCase()) ? 'on' : ''}`}
                    onClick={() => apply((m) => togglePhysicalKeyColumn(m, entity.id, k.id, c.name))}
                  >
                    {c.name}
                  </button>
                ))}
                {k.columns
                  .filter((x) => !t.columns.some((c) => c.name.toLowerCase() === x.toLowerCase()))
                  .map((x) => (
                    <button key={x} type="button" className="chip chip-missing" title="No such column any more — click to remove" onClick={() => apply((m) => togglePhysicalKeyColumn(m, entity.id, k.id, x))}>
                      {x} ✕
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {notes.length > 0 && (
        <Section title="Notes">
          <Notes notes={notes} />
        </Section>
      )}

      <div className="panel-footer">
        <button type="button" className="btn" onClick={() => selectTable(null)}>
          ← All tables
        </button>
      </div>
    </div>
  )
}
