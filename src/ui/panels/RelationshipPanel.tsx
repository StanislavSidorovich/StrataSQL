import { formatCardinality, parseCardinality, type Cardinality, type Model, type Relationship } from '../../core/metamodel'
import { removeRelationship, setDependentSide, swapRelationshipSides, updateRelationship } from '../../core/ops'
import { useEditor } from '../store'
import { Field, Section, Select, TextArea, TextInput } from './fields'

const CARD_OPTIONS = ['0,1', '1,1', '0,n', '1,n'].map((v) => ({ value: v, label: v }))

function phrase(c: Cardinality): string {
  if (c.min === 1 && c.max === 1) return 'exactly one'
  if (c.min === 0 && c.max === 1) return 'at most one'
  if (c.min === 0) return 'zero or more'
  return 'one or more'
}

export function RelationshipPanel({ rel, model }: { rel: Relationship; model: Model }) {
  const apply = useEditor((s) => s.apply)
  const id = rel.id
  const nameOf = (eid: string) => model.entities.find((e) => e.id === eid)?.name ?? '?'
  const a = nameOf(rel.entityA)
  const b = nameOf(rel.entityB)
  const entityOptions = model.entities.map((e) => ({ value: e.id, label: e.name }))
  const reflexive = rel.entityA === rel.entityB
  const kind =
    rel.cardinalityA.max === 'n' && rel.cardinalityB.max === 'n'
      ? 'many-to-many'
      : rel.cardinalityA.max === 1 && rel.cardinalityB.max === 1
        ? 'one-to-one'
        : 'one-to-many'

  return (
    <div>
      <Section title="Relationship">
        <Field label="Name">
          <TextInput value={rel.name} onChange={(v) => apply((m) => updateRelationship(m, id, { name: v }), { coalesce: `rn:${id}` })} />
        </Field>
        <div className="rel-ends">
          <EndEditor
            label="Entity A"
            entity={rel.entityA}
            card={rel.cardinalityA}
            role={rel.roleA}
            options={entityOptions}
            onEntity={(v) => apply((m) => updateRelationship(m, id, { entityA: v }))}
            onCard={(c) => apply((m) => updateRelationship(m, id, { cardinalityA: c }))}
            onRole={(v) => apply((m) => updateRelationship(m, id, { roleA: v }), { coalesce: `ra:${id}` })}
          />
          <EndEditor
            label="Entity B"
            entity={rel.entityB}
            card={rel.cardinalityB}
            role={rel.roleB}
            options={entityOptions}
            onEntity={(v) => apply((m) => updateRelationship(m, id, { entityB: v }))}
            onCard={(c) => apply((m) => updateRelationship(m, id, { cardinalityB: c }))}
            onRole={(v) => apply((m) => updateRelationship(m, id, { roleB: v }), { coalesce: `rb:${id}` })}
          />
        </div>
        <button type="button" className="btn btn-small" onClick={() => apply((m) => swapRelationshipSides(m, id))}>
          ⇄ Swap A and B
        </button>
        <div className="reading" data-testid="relationship-reading">
          <p>
            Each <b>{b}</b> is related to <b>{phrase(rel.cardinalityA)}</b> {a}.
          </p>
          <p>
            Each <b>{a}</b> is related to <b>{phrase(rel.cardinalityB)}</b> {b}.
          </p>
          <p className="muted">
            {kind} · {formatCardinality(rel.cardinalityA)} — {formatCardinality(rel.cardinalityB)}
          </p>
        </div>
      </Section>

      <Section title="Dependency">
        {reflexive ? (
          <p className="muted">A reflexive relationship cannot be dependent.</p>
        ) : (
          <div className="radio-list">
            <Radio name={`dep-${id}`} checked={rel.dependentSide === null} onChange={() => apply((m) => setDependentSide(m, id, null))}>
              Independent — FK only
            </Radio>
            <Radio name={`dep-${id}`} checked={rel.dependentSide === 'B'} onChange={() => apply((m) => setDependentSide(m, id, 'B'))}>
              <b>{b}</b> depends on <b>{a}</b> — {b} is identified through {a}
            </Radio>
            <Radio name={`dep-${id}`} checked={rel.dependentSide === 'A'} onChange={() => apply((m) => setDependentSide(m, id, 'A'))}>
              <b>{a}</b> depends on <b>{b}</b> — {a} is identified through {b}
            </Radio>
            <p className="muted">The parent end becomes 1,1 and its identifier joins the dependent entity's primary key.</p>
          </div>
        )}
      </Section>

      <Section title="Comment">
        <TextArea value={rel.comment} onChange={(v) => apply((m) => updateRelationship(m, id, { comment: v }), { coalesce: `rc:${id}` })} />
      </Section>

      <div className="panel-footer">
        <button type="button" className="btn btn-danger" onClick={() => apply((m) => removeRelationship(m, id))}>
          Delete relationship
        </button>
      </div>
    </div>
  )
}

function EndEditor(props: {
  label: string
  entity: string
  card: Cardinality
  role?: string
  options: { value: string; label: string }[]
  onEntity: (v: string) => void
  onCard: (c: Cardinality) => void
  onRole: (v: string) => void
}) {
  return (
    <fieldset className="rel-end">
      <legend>{props.label}</legend>
      <Select ariaLabel={`${props.label} entity`} value={props.entity} options={props.options} onChange={props.onEntity} />
      <Field label="Cardinality" hint="How many of this entity per one of the other">
        <Select
          ariaLabel={`${props.label} cardinality`}
          value={formatCardinality(props.card)}
          options={CARD_OPTIONS}
          onChange={(v) => props.onCard(parseCardinality(v)!)}
        />
      </Field>
      <Field label="Role">
        <TextInput value={props.role} placeholder="optional" onChange={props.onRole} />
      </Field>
    </fieldset>
  )
}

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="check items-start">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  )
}
