// "In the physical model" sections of the conceptual panels: what the selected entity or
// relationship becomes in the PDM, updated live while editing.

import type { Id } from '../../core/metamodel'
import type { PdmNote, PdmTable } from '../../core/pdm'
import { Section } from '../panels/fields'
import { useEditor, usePdm } from '../store'

function openTable(name: string) {
  const { setView, selectTable } = useEditor.getState()
  setView('pdm')
  selectTable(name)
}

function TableLink({ name }: { name: string }) {
  return (
    <span className="link font-semibold" onClick={() => openTable(name)} title="Open in the physical view">
      {name}
    </span>
  )
}

function NoteLines({ notes }: { notes: PdmNote[] }) {
  return notes.map((n) => (
    <p key={n.message} className={`note note-${n.level}`}>
      <span className="note-icon">{n.level === 'warning' ? '⚠' : 'ℹ'}</span>
      <span>{n.message}</span>
    </p>
  ))
}

const pkText = (t: PdmTable) => (t.primaryKey ? `PK (${t.primaryKey.columns.join(', ')})` : 'no primary key')

export function EntityResult({ entityId }: { entityId: Id }) {
  const pdm = usePdm()
  const own = pdm.tables.find((t) => t.source.kind === 'entity' && t.source.id === entityId)
  const holders = own
    ? []
    : pdm.tables.filter((t) => t.columns.some((c) => c.source.kind === 'attribute' && c.source.entityId === entityId && !c.migrated))
  const notes = pdm.notes.filter((n) => n.source?.kind === 'entity' && n.source.id === entityId)
  return (
    <Section title="In the physical model">
      {own && (
        <p>
          Table <TableLink name={own.name} /> · {pkText(own)}
          {own.foreignKeys.length > 0 && ` · ${own.foreignKeys.length} FK`}
        </p>
      )}
      {!own && holders.length === 1 && (
        <p>
          No own table: its columns are stored in <TableLink name={holders[0].name} /> (inheritance generation = parent).
        </p>
      )}
      {!own && holders.length > 1 && (
        <p>
          No own table (inheritance generation = children): its columns are copied into{' '}
          {holders.map((t, i) => (
            <span key={t.name}>
              {i > 0 && ', '}
              <TableLink name={t.name} />
            </span>
          ))}
          .
        </p>
      )}
      {!own && holders.length === 0 && <p className="muted">No table and no columns.</p>}
      <NoteLines notes={notes} />
    </Section>
  )
}

export function RelationshipResult({ relationshipId }: { relationshipId: Id }) {
  const pdm = usePdm()
  const join = pdm.tables.find((t) => t.source.kind === 'relationship' && t.source.id === relationshipId)
  const fks = join
    ? []
    : pdm.tables.flatMap((t) =>
        t.foreignKeys.filter((f) => f.source.kind === 'relationship' && f.source.id === relationshipId).map((fk) => ({ t, fk })),
      )
  const notes = pdm.notes.filter((n) => n.source?.kind === 'relationship' && n.source.id === relationshipId && !join)
  return (
    <Section title="In the physical model">
      {join && (
        <p>
          Join table <TableLink name={join.name} /> · {pkText(join)}
        </p>
      )}
      {fks.map(({ t, fk }) => {
        const unique = t.alternateKeys.some((ak) => ak.columns.join() === fk.columns.join())
        return (
          <p key={fk.name}>
            <TableLink name={t.name} /> gets ({fk.columns.join(', ')}) → <TableLink name={fk.refTable} />,{' '}
            {fk.identifying ? 'part of its primary key' : fk.mandatory ? 'NOT NULL' : 'nullable'}
            {unique && ', UNIQUE'}
          </p>
        )
      })}
      {!join && fks.length === 0 && <p className="muted">No foreign key could be generated.</p>}
      <NoteLines notes={notes} />
    </Section>
  )
}
