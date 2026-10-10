import type { Inheritance, InheritanceGeneration, Model } from '../../core/metamodel'
import { addInheritanceChild, ancestorsOf, removeInheritance, removeInheritanceChild, updateInheritance } from '../../core/ops'
import { ElementChange } from '../changes/ChangesPanel'
import { ElementIssues } from '../lint/IssuesPanel'
import { useEditor } from '../store'
import { Check, Field, IconButton, Section, Select, TextArea, TextInput } from './fields'

const GENERATION: { value: InheritanceGeneration; label: string; hint: string }[] = [
  { value: 'both', label: 'Parent + children tables', hint: 'Course default. Child PK = FK to the parent PK.' },
  { value: 'parent', label: 'Parent table only', hint: 'One table; child columns become nullable.' },
  { value: 'children', label: 'Children tables only', hint: 'Parent columns are copied into each child table.' },
]

export function InheritancePanel({ inh, model }: { inh: Inheritance; model: Model }) {
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const id = inh.id
  const nameOf = (eid: string) => model.entities.find((e) => e.id === eid)?.name ?? '?'
  const taken = new Set(model.inheritances.flatMap((i) => i.childIds))
  const ancestors = new Set([inh.parentId, ...ancestorsOf(model, inh.parentId)])
  const candidates = model.entities.filter((e) => !taken.has(e.id) && !ancestors.has(e.id))

  return (
    <div>
      <ElementIssues kind="inheritance" id={id} />
      <ElementChange kind="inheritance" id={id} />
      <Section title="Inheritance" help="inheritance">
        <Field label="Name">
          <TextInput value={inh.name} onChange={(v) => apply((m) => updateInheritance(m, id, { name: v }), { coalesce: `hn:${id}` })} />
        </Field>
        <Field label="Parent">
          <button type="button" className="link text-left" onClick={() => select({ kind: 'entity', id: inh.parentId })}>
            {nameOf(inh.parentId)}
          </button>
        </Field>
        <Field label="Children">
          <ul className="link-list">
            {inh.childIds.map((c) => (
              <li key={c} className="flex items-center justify-between">
                <button type="button" className="link" onClick={() => select({ kind: 'entity', id: c })}>
                  {nameOf(c)}
                </button>
                <IconButton title={`Remove ${nameOf(c)}`} danger onClick={() => apply((m) => removeInheritanceChild(m, id, c))}>
                  ✕
                </IconButton>
              </li>
            ))}
          </ul>
          {candidates.length > 0 && (
            <Select
              ariaLabel="Add child"
              value=""
              options={[{ value: '', label: '+ add child…' }, ...candidates.map((e) => ({ value: e.id, label: e.name }))]}
              onChange={(v) => v && apply((m) => addInheritanceChild(m, id, v))}
            />
          )}
        </Field>
      </Section>

      <Section title="Constraints" help="inheritance">
        <Check
          checked={inh.mutuallyExclusive}
          onChange={(v) => apply((m) => updateInheritance(m, id, { mutuallyExclusive: v }))}
          label="Mutually exclusive — an instance belongs to at most one child"
        />
        <Check
          checked={inh.complete}
          onChange={(v) => apply((m) => updateInheritance(m, id, { complete: v }))}
          label="Complete — every instance belongs to some child"
        />
      </Section>

      <Section title="PDM generation" help="inheritance-generation">
        <div className="radio-list">
          {GENERATION.map((g) => (
            <label key={g.value} className="check items-start">
              <input
                type="radio"
                name={`gen-${id}`}
                checked={inh.generation === g.value}
                onChange={() => apply((m) => updateInheritance(m, id, { generation: g.value }))}
              />
              <span>
                {g.label}
                <span className="block muted">{g.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {inh.generation === 'both' && (
          <Check
            checked={!!inh.inheritAll}
            onChange={(v) => apply((m) => updateInheritance(m, id, { inheritAll: v }))}
            label="Children also copy the parent's attributes (PowerDesigner “Inherit all attributes”, its default) — repeats data; off = children keep only the key"
          />
        )}
        {inh.generation === 'parent' && (
          <Field label="Discriminator column" hint="Says which child a row belongs to" help="inheritance-generation">
            <TextInput
              value={inh.discriminator}
              placeholder="e.g. scene_type"
              onChange={(v) => apply((m) => updateInheritance(m, id, { discriminator: v }), { coalesce: `hd:${id}` })}
            />
          </Field>
        )}
      </Section>

      <Section title="Comment">
        <TextArea value={inh.comment} onChange={(v) => apply((m) => updateInheritance(m, id, { comment: v }), { coalesce: `hc:${id}` })} />
      </Section>

      <div className="panel-footer">
        <button type="button" className="btn btn-danger" onClick={() => apply((m) => removeInheritance(m, id))}>
          Delete inheritance
        </button>
      </div>
    </div>
  )
}
