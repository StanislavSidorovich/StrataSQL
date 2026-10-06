import { DATA_TYPES, TYPES_WITH_LENGTH, TYPES_WITH_PRECISION, type DataType, type Model } from '../../core/metamodel'
import { addDomain, removeDomain, renameModel, updateDomain } from '../../core/ops'
import { useEditor } from '../store'
import { Field, IconButton, NumberInput, Section, Select, SizeInput, TextArea, TextInput } from './fields'
import { AuthorLinks } from '../AuthorLinks'
import { referenceModelOf } from '../../data/reference-models'

export function ModelPanel({ model }: { model: Model }) {
  const apply = useEditor((s) => s.apply)
  // A real database (Examples → Real database): link to where it can be queried.
  const reference = referenceModelOf(model)
  const usage = (domainId: string) =>
    model.entities.reduce((n, e) => n + e.attributes.filter((a) => a.domainId === domainId).length, 0)

  return (
    <div className="model-panel">
      <Section title="Model">
        <Field label="Name">
          <TextInput value={model.name} onChange={(v) => apply((m) => renameModel(m, v), { coalesce: 'model-name' })} />
        </Field>
        <Field label="Comment">
          <TextArea
            rows={8}
            value={model.comment}
            onChange={(v) =>
              apply(
                (m) => {
                  m.comment = v || undefined
                },
                { coalesce: 'model-comment' },
              )
            }
          />
        </Field>
        <p className="muted">
          {model.entities.length} entities · {model.relationships.length} relationships · {model.inheritances.length} inheritances
        </p>
        {reference && (
          <p>
            <a href={reference.link.url} target="_blank" rel="noopener">
              {reference.link.label} ↗
            </a>
          </p>
        )}
      </Section>

      <Section
        title="Domains"
        help="domain"
        actions={
          <button type="button" className="btn btn-small" onClick={() => apply((m) => void addDomain(m))}>
            + Domain
          </button>
        }
      >
        <p className="muted">Reusable attribute types (Email, Phone…). Changing a domain updates every attribute that uses it.</p>
        {model.domains.map((d) => {
          const hasLength = TYPES_WITH_LENGTH.includes(d.dataType) || TYPES_WITH_PRECISION.includes(d.dataType)
          return (
            <div key={d.id} className="domain-row">
              <TextInput ariaLabel="Domain name" value={d.name} onChange={(v) => apply((m) => updateDomain(m, d.id, { name: v }), { coalesce: `dn:${d.id}` })} />
              <Select
                ariaLabel="Domain type"
                value={d.dataType}
                options={DATA_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => apply((m) => updateDomain(m, d.id, { dataType: v as DataType }))}
              />
              {TYPES_WITH_PRECISION.includes(d.dataType) ? (
                <SizeInput
                  ariaLabel="Domain precision and scale"
                  length={d.length}
                  precision={d.precision}
                  onChange={(v) => apply((m) => updateDomain(m, d.id, { length: v.length, precision: v.precision }), { coalesce: `dl:${d.id}` })}
                />
              ) : hasLength ? (
                <NumberInput ariaLabel="Domain length" value={d.length} onChange={(v) => apply((m) => updateDomain(m, d.id, { length: v }), { coalesce: `dl:${d.id}` })} />
              ) : (
                <span />
              )}
              <IconButton title={`Delete domain (${usage(d.id)} uses)`} danger onClick={() => apply((m) => removeDomain(m, d.id))}>
                ✕
              </IconButton>
            </div>
          )
        })}
      </Section>

      <Section title="How to model">
        <ul className="muted list-disc space-y-1 pl-4">
          <li>Double-click the canvas to add an entity.</li>
          <li>Drag from the ● handle of an entity onto another one to link them. The toolbar chooses relationship or inheritance (child → parent).</li>
          <li>Click an entity, line or inheritance symbol to edit it here.</li>
          <li>Ctrl+Z / Ctrl+Y undo and redo · Ctrl+D duplicates an entity · Delete removes the selection · Ctrl+S saves a file.</li>
          <li>
            Every <b>?</b> opens a help card with a mini-model;{' '}
            <button type="button" className="link" onClick={() => useEditor.getState().openHelp()}>
              browse all concepts
            </button>
            .
          </li>
        </ul>
      </Section>
      <AuthorLinks className="model-panel-author" />
    </div>
  )
}
