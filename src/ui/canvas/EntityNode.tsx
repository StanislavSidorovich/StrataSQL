import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { formatDataType } from '../../core/metamodel'
import { issueTouches } from '../../core/lint'
import { worstSeverity } from '../lint/IssuesPanel'
import { useEditor, useLint, useSpotlight } from '../store'

export type EntityNodeType = Node<{ entityId: string }, 'entity'>

/** Hidden target handle: links are dropped anywhere on a node (see Canvas.onConnectEnd). */
export function HiddenTarget() {
  return <Handle type="target" position={Position.Top} className="hidden-handle" isConnectable={false} />
}

export function EntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const entity = useEditor((s) => s.model.entities.find((e) => e.id === data.entityId))
  const parentName = useEditor((s) => {
    const inh = s.model.inheritances.find((i) => i.childIds.includes(data.entityId))
    return inh ? s.model.entities.find((e) => e.id === inh.parentId)?.name : undefined
  })
  const issues = useLint()
  const focused = useEditor((s) => (s.focusedIssue ? issueTouches(s.focusedIssue, 'entity', data.entityId) : false))
  const isNew = useSpotlight(data.entityId)
  if (!entity) return null
  const severity = worstSeverity(issues, 'entity', entity.id)
  const pi = entity.identifiers.find((i) => i.isPrimary)
  const alternates = entity.identifiers.filter((i) => !i.isPrimary)
  const akIndex = (attrId: string) => alternates.findIndex((i) => i.attributeIds.includes(attrId))

  return (
    <div
      className={`entity-node ${selected ? 'is-selected' : ''} ${severity ? `lint-${severity}` : ''} ${focused ? 'lint-focus' : ''} ${isNew ? 'walk-new' : ''}`}
      data-testid={`entity-${entity.name}`}
    >
      <HiddenTarget />
      <Handle type="source" position={Position.Right} className="link-handle" title="Drag to another entity to link" />
      <div className="entity-header">
        <span>{entity.name}</span>
        {parentName && <span className="entity-parent">⊂ {parentName}</span>}
        {severity && (
          <span
            className={`lint-dot lint-dot-${severity}`}
            title={issues
              .filter((i) => issueTouches(i, 'entity', entity.id))
              .map((i) => `${i.rule}: ${i.message}`)
              .join('\n\n')}
          />
        )}
      </div>
      <div className="entity-body">
        {entity.attributes.length === 0 && <div className="entity-empty">no attributes</div>}
        {entity.attributes.map((a) => {
          const inPi = pi?.attributeIds.includes(a.id) ?? false
          const ak = akIndex(a.id)
          return (
            <div key={a.id} className="entity-attr">
              <span className={inPi ? 'attr-pi' : ''}>{a.name}</span>
              <span className="attr-flags">
                {inPi && <b>&lt;pi&gt;</b>}
                {ak >= 0 && <b>&lt;ai{alternates.length > 1 ? ak + 1 : ''}&gt;</b>}
              </span>
              <span className="attr-type">{formatDataType(a)}</span>
              <span className="attr-m">{a.mandatory ? '<M>' : ''}</span>
            </div>
          )
        })}
      </div>
      {entity.identifiers.length > 0 && (
        <div className="entity-idents">
          {entity.identifiers.map((i) => (
            <div key={i.id}>
              {i.name} <b>{i.isPrimary ? '<pi>' : '<ai>'}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
