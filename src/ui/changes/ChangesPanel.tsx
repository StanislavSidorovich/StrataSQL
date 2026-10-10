// Changes against an earlier version (File → Compare with…): a dock under the canvas listing them by
// number, and the change of one element at the top of its panel. The canvas marks the same numbers.

import type { Change, ChangeKind, ChangeStatus } from '../../core/changes'
import type { Id } from '../../core/metamodel'
import { useChanges, useEditor } from '../store'

const WORD: Record<ChangeStatus, string> = { new: 'new', changed: 'changed', removed: 'removed' }

function goTo(c: Change) {
  if (!c.id) return
  const { select, setView } = useEditor.getState()
  setView('cdm')
  select({ kind: c.kind, id: c.id })
}

/** The round number of a change, coloured by its status. */
export function ChangeBadge({ change, className = '' }: { change: Change; className?: string }) {
  return (
    <span className={`chg-badge chg-${change.status} ${className}`} title={`${change.n}: ${WORD[change.status]}`}>
      {change.n}
    </span>
  )
}

function ChangeRow({ c, selected }: { c: Change; selected: boolean }) {
  return (
    <li className={`chg-row chg-row-${c.status} ${c.with ? 'is-part' : ''} ${selected ? 'is-focused' : ''}`}>
      <button type="button" className="chg-main" onClick={() => goTo(c)} disabled={!c.id} title={c.id ? 'Show on the canvas' : 'Not in this version any more'}>
        {c.with ? <span className="chg-part" aria-hidden>↳</span> : <ChangeBadge change={c} />}
        <span>
          <span className="chg-label">{c.label}</span> <span className={`chg-word chg-word-${c.status}`}>{WORD[c.status]}</span>
          {c.details.length > 0 && (
            <ul className="chg-details">
              {c.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {c.note && <span className="chg-note">{c.note}</span>}
        </span>
      </button>
    </li>
  )
}

export function ChangesDock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const changes = useChanges()
  const base = useEditor((s) => s.changesBase)
  const show = useEditor((s) => s.showChanges)
  const selection = useEditor((s) => s.selection)
  if (!changes || !base) return null
  const { counts } = changes
  return (
    <div className={`issues-dock changes-dock ${open ? 'is-open' : ''}`} data-testid="changes-dock">
      <div className="issues-bar">
        <button type="button" className="chg-bar-main" onClick={onToggle} aria-expanded={open}>
          <b>Changes</b>
          <span className="muted">since “{base.name}”</span>
          {changes.changes.length === 0 ? (
            <span className="issue-ok">none</span>
          ) : (
            <>
              {counts.new > 0 && <span className="count chg-word-new">{counts.new} new</span>}
              {counts.changed > 0 && <span className="count chg-word-changed">{counts.changed} changed</span>}
              {counts.removed > 0 && <span className="count chg-word-removed">{counts.removed} removed</span>}
              {changes.kept > 0 && <span className="count muted">{changes.kept} kept</span>}
            </>
          )}
        </button>
        <label className="chg-toggle" title="Numbers and colours on the diagram">
          <input type="checkbox" checked={show} onChange={(e) => useEditor.setState({ showChanges: e.target.checked })} /> on the canvas
        </label>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => window.confirm(`Stop comparing with “${base.name}”? The model itself stays as it is.`) && useEditor.getState().setChangesBase(null)}
          title="Stop comparing: the earlier version is forgotten, the model stays"
        >
          Stop
        </button>
        <button type="button" className="chg-caret muted" onClick={onToggle} aria-label={open ? 'Hide the list' : 'Show the list'}>
          {open ? '▾' : '▴'}
        </button>
      </div>
      {open && (
        <ul className="issue-list chg-list">
          {changes.changes.map((c) => (
            <ChangeRow key={`${c.kind}:${c.id ?? c.baseId}`} c={c} selected={!!c.id && selection?.kind === c.kind && selection.id === c.id} />
          ))}
          {changes.changes.length === 0 && <li className="muted px-3 py-2">The model is the same as “{base.name}”.</li>}
        </ul>
      )}
    </div>
  )
}

/** The change of the selected element, at the top of its panel. */
export function ElementChange({ kind, id }: { kind: ChangeKind; id: Id }) {
  const changes = useChanges()
  const base = useEditor((s) => s.changesBase)
  const c = changes?.changes.find((x) => x.kind === kind && x.id === id)
  if (!c || !base) return null
  return (
    <div className={`element-change chg-row-${c.status}`}>
      <div className="flex items-center gap-2">
        {!c.with && <ChangeBadge change={c} />}
        <b className={`chg-word-${c.status}`}>{c.status === 'new' ? 'New' : 'Changed'}</b>
        <span className="muted">since “{base.name}”{c.with ? ', with its new entity' : ''}</span>
      </div>
      {c.details.length > 0 && (
        <ul className="chg-details">
          {c.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
