import { useEffect, useRef, useState } from 'react'
import {
  DATA_TYPES,
  TYPES_WITH_LENGTH,
  TYPES_WITH_PRECISION,
  formatCardinality,
  type Attribute,
  type DataType,
  type Entity,
  type Model,
} from '../../core/metamodel'
import {
  addAttribute,
  addIdentifier,
  moveAttribute,
  removeAttribute,
  removeEntity,
  removeIdentifier,
  renameIdentifier,
  setAttributeInPrimary,
  setPrimaryIdentifier,
  toggleIdentifierAttribute,
  updateAttribute,
  uniqueName,
  updateEntity,
} from '../../core/ops'
import { ElementIssues } from '../lint/IssuesPanel'
import { EntityResult } from '../pdm/PhysicalResult'
import { duplicateSelectedEntity, useEditor } from '../store'
import { Check, Field, HelpButton, IconButton, NameInput, NumberInput, Section, Select, SizeInput, TextArea, TextInput } from './fields'

/** Names the editor gives a new element; the name field shows them as a grey hint. */
const DEFAULT_ENTITY = /^Entity(_\d+)?$/
const DEFAULT_ATTRIBUTE = /^attribute(_\d+)?$/

export function EntityPanel({ entity, model }: { entity: Entity; model: Model }) {
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const id = entity.id
  const pi = entity.identifiers.find((i) => i.isPrimary)

  const relationships = model.relationships.filter((r) => r.entityA === id || r.entityB === id)
  const nameOf = (eid: string) => model.entities.find((e) => e.id === eid)?.name ?? '?'
  const asChild = model.inheritances.find((i) => i.childIds.includes(id))
  const asParent = model.inheritances.find((i) => i.parentId === id)
  // Just drawn: no attributes and no links yet. The linter gives one next-step hint; the empty table is not worth a warning.
  const empty = entity.attributes.length === 0 && relationships.length === 0 && !asChild && !asParent

  // A just-added attribute takes the focus, so its name can be typed right away.
  const [newAttr, setNewAttr] = useState<string | null>(null)
  const nameBox = useRef<HTMLDivElement>(null)
  const focusName = useEditor((s) => s.focusName)
  useEffect(() => {
    if (focusName !== id) return
    const input = nameBox.current?.querySelector('input')
    input?.focus()
    input?.select()
    useEditor.setState({ focusName: null })
  }, [focusName, id])

  return (
    <div>
      <ElementIssues kind="entity" id={id} />
      <Section title="Entity" help="entity">
        <Field label="Name" help="names-and-codes">
          <div ref={nameBox} className="contents">
          <NameInput
            value={entity.name}
            isDefault={(n) => DEFAULT_ENTITY.test(n)}
            list="suggest-entity"
            fallback={uniqueName('Entity', model.entities.filter((e) => e.id !== id).map((e) => e.name))}
            onChange={(v) => apply((m) => updateEntity(m, id, { name: v }), { coalesce: `en:${id}` })}
          />
          </div>
        </Field>
        <Field label="Code" hint="Table name in the PDM" help="names-and-codes">
          <TextInput value={entity.code} onChange={(v) => apply((m) => updateEntity(m, id, { code: v }), { coalesce: `ec:${id}` })} />
        </Field>
        <Field label="Comment">
          <TextArea value={entity.comment} onChange={(v) => apply((m) => updateEntity(m, id, { comment: v }), { coalesce: `em:${id}` })} />
        </Field>
      </Section>

      <Section
        title={`Attributes (${entity.attributes.length})`}
        help="attribute"
        actions={
          <button type="button" className="btn btn-small" onClick={() => {
              let aid = ''
              apply((m) => void (aid = addAttribute(m, id).id))
              setNewAttr(aid)
            }}
          >
            + Attribute
          </button>
        }
      >
        {entity.attributes.length > 0 && (
          <div className="attr-grid attr-grid-head">
            <span title="Primary identifier">
              PI<HelpButton card="identifier" title="What is a primary identifier?" />
            </span>
            <span>Name</span>
            <span>
              Type<HelpButton card="domain" title="Data types and domains" />
            </span>
            <span title="Length, or precision,scale (10,2)">Len</span>
            <span title="Mandatory">
              M<HelpButton card="attribute" title="Mandatory attributes" />
            </span>
            <span />
          </div>
        )}
        {entity.attributes.map((a, idx) => (
          <AttributeRow
            key={a.id}
            entityId={id}
            attr={a}
            model={model}
            inPi={pi?.attributeIds.includes(a.id) ?? false}
            first={idx === 0}
            last={idx === entity.attributes.length - 1}
            autoFocus={a.id === newAttr}
          />
        ))}
        {entity.attributes.length === 0 && (
          <p className="muted">
            No attributes. That is fine for an inheritance child or an intermediate entity identified by its parents.
          </p>
        )}
      </Section>

      <Section
        title="Identifiers"
        help="identifier"
        actions={
          <button
            type="button"
            className="btn btn-small"
            disabled={entity.attributes.length === 0}
            onClick={() => apply((m) => void addIdentifier(m, id, { isPrimary: !pi }))}
          >
            + Identifier
          </button>
        }
      >
        {entity.identifiers.length > 1 && (
          <p className="muted">
            The primary one becomes the PK; the others become alternate keys (UNIQUE).
            <HelpButton card="alternate-identifier" title="What is an alternate identifier?" />
          </p>
        )}
        {entity.identifiers.length === 0 && (
          <p className="muted">No identifier. Tick PI on an attribute, or make this entity dependent on another one.</p>
        )}
        {entity.identifiers.map((ident) => (
          <div key={ident.id} className="ident-card">
            <div className="flex items-center gap-2">
              <TextInput
                className="flex-1"
                ariaLabel="Identifier name"
                value={ident.name}
                onChange={(v) => apply((m) => renameIdentifier(m, id, ident.id, v), { coalesce: `in:${ident.id}` })}
              />
              <label className="check" title="Primary identifier (becomes the PK); others are alternate (UNIQUE)">
                <input
                  type="radio"
                  name={`pi-${id}`}
                  checked={ident.isPrimary}
                  onChange={() => apply((m) => setPrimaryIdentifier(m, id, ident.id))}
                />
                <span>primary</span>
              </label>
              <IconButton title="Delete identifier" danger onClick={() => apply((m) => removeIdentifier(m, id, ident.id))}>
                ✕
              </IconButton>
            </div>
            <div className="chips">
              {entity.attributes.map((a) => {
                const on = ident.attributeIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => apply((m) => toggleIdentifierAttribute(m, id, ident.id, a.id))}
                  >
                    {a.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Links" help="relationship">
        {relationships.length === 0 && !asChild && !asParent && <p className="muted">Drag from the ● handle on the entity to another entity.</p>}
        <ul className="link-list">
          {relationships.map((r) => {
            const other = r.entityA === id ? r.entityB : r.entityA
            const mine = r.entityA === id ? r.cardinalityA : r.cardinalityB
            const theirs = r.entityA === id ? r.cardinalityB : r.cardinalityA
            const dependsOnOther = (r.dependentSide === 'A' && r.entityA === id) || (r.dependentSide === 'B' && r.entityB === id)
            return (
              <li key={r.id}>
                <button type="button" className="link" onClick={() => select({ kind: 'relationship', id: r.id })}>
                  {r.name || 'relationship'}
                </button>{' '}
                <span className="muted">
                  {formatCardinality(mine)} — {formatCardinality(theirs)} {nameOf(other)}
                  {dependsOnOther && ' · dependent'}
                </span>
              </li>
            )
          })}
          {asChild && (
            <li>
              <button type="button" className="link" onClick={() => select({ kind: 'inheritance', id: asChild.id })}>
                inherits from {nameOf(asChild.parentId)}
              </button>
            </li>
          )}
          {asParent && (
            <li>
              <button type="button" className="link" onClick={() => select({ kind: 'inheritance', id: asParent.id })}>
                parent of {asParent.childIds.map(nameOf).join(', ')}
              </button>
            </li>
          )}
        </ul>
      </Section>

      {!empty && <EntityResult entityId={id} />}

      <div className="panel-footer">
        <button type="button" className="btn" onClick={() => duplicateSelectedEntity(id)} title="Copy this entity with its attributes and identifiers, without its links (Ctrl+D)">
          Duplicate
        </button>
        <button type="button" className="btn btn-danger" onClick={() => apply((m) => removeEntity(m, id))}>
          Delete entity
        </button>
      </div>
    </div>
  )
}

function AttributeRow({
  entityId,
  attr,
  model,
  inPi,
  first,
  last,
  autoFocus,
}: {
  entityId: string
  attr: Attribute
  model: Model
  inPi: boolean
  first: boolean
  last: boolean
  autoFocus: boolean
}) {
  const apply = useEditor((s) => s.apply)
  const aid = attr.id
  const typeValue = attr.domainId ? `domain:${attr.domainId}` : attr.dataType
  const typeOptions = [
    ...DATA_TYPES.map((t) => ({ value: t as string, label: t, group: 'Data types' })),
    ...model.domains.map((d) => ({ value: `domain:${d.id}`, label: d.name, group: 'Domains' })),
  ]
  const hasLength = TYPES_WITH_LENGTH.includes(attr.dataType) || TYPES_WITH_PRECISION.includes(attr.dataType)

  return (
    <div className="attr-grid" data-testid={`attr-${attr.name}`}>
      <Check
        checked={inPi}
        title="Part of the primary identifier"
        onChange={(v) => apply((m) => setAttributeInPrimary(m, entityId, aid, v))}
      />
      <NameInput
        ariaLabel="Attribute name"
        value={attr.name}
        isDefault={(n) => DEFAULT_ATTRIBUTE.test(n)}
        list="suggest-attribute"
        fallback={uniqueName('attribute', model.entities.find((e) => e.id === entityId)!.attributes.filter((x) => x.id !== aid).map((x) => x.name))}
        autoFocus={autoFocus}
        onChange={(v) => apply((m) => updateAttribute(m, entityId, aid, { name: v }), { coalesce: `an:${aid}` })}
      />
      <Select
        ariaLabel="Data type"
        value={typeValue}
        options={typeOptions}
        onChange={(v) =>
          apply((m) =>
            v.startsWith('domain:')
              ? updateAttribute(m, entityId, aid, { domainId: v.slice(7) })
              : updateAttribute(m, entityId, aid, { dataType: v as DataType }),
          )
        }
      />
      {TYPES_WITH_PRECISION.includes(attr.dataType) ? (
        <SizeInput
          ariaLabel="Precision and scale"
          length={attr.length}
          precision={attr.precision}
          onChange={(v) =>
            apply((m) => updateAttribute(m, entityId, aid, { length: v.length, precision: v.precision, domainId: undefined }), { coalesce: `al:${aid}` })
          }
        />
      ) : hasLength ? (
        <NumberInput
          ariaLabel="Length"
          value={attr.length}
          onChange={(v) => apply((m) => updateAttribute(m, entityId, aid, { length: v, domainId: undefined }), { coalesce: `al:${aid}` })}
        />
      ) : (
        <span />
      )}
      <Check
        checked={attr.mandatory}
        title={inPi ? 'Identifier attributes are always mandatory' : 'Mandatory (NOT NULL)'}
        onChange={(v) => apply((m) => updateAttribute(m, entityId, aid, { mandatory: v }))}
      />
      <span className="flex">
        <IconButton title="Move up" disabled={first} onClick={() => apply((m) => moveAttribute(m, entityId, aid, -1))}>
          ↑
        </IconButton>
        <IconButton title="Move down" disabled={last} onClick={() => apply((m) => moveAttribute(m, entityId, aid, 1))}>
          ↓
        </IconButton>
        <IconButton title="Delete attribute" danger onClick={() => apply((m) => removeAttribute(m, entityId, aid))}>
          ✕
        </IconButton>
      </span>
    </div>
  )
}
