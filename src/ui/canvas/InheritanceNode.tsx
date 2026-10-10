import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ChangeBadge } from '../changes/ChangesPanel'
import { useEditor, useShownChange, useSpotlight } from '../store'
import { HiddenTarget } from './EntityNode'

export type InheritanceNodeType = Node<{ inheritanceId: string }, 'inheritance'>

/** PD-style inheritance symbol: a half circle; a cross bar marks mutually exclusive children. */
export function InheritanceNode({ data, selected }: NodeProps<InheritanceNodeType>) {
  const inh = useEditor((s) => s.model.inheritances.find((i) => i.id === data.inheritanceId))
  const isNew = useSpotlight(data.inheritanceId)
  const change = useShownChange('inheritance', data.inheritanceId)
  if (!inh) return null
  const stroke = selected ? 'var(--edge-selected)' : isNew ? 'var(--walk-new)' : change ? `var(--chg-${change.status})` : 'var(--edge)'
  const title = `${inh.name}: ${inh.mutuallyExclusive ? 'exclusive' : 'overlapping'}, ${inh.complete ? 'complete' : 'incomplete'}, generate ${inh.generation}`
  return (
    <div className="inheritance-node" title={title}>
      <HiddenTarget />
      {change && <ChangeBadge change={change} className="on-node" />}
      <Handle type="source" position={Position.Bottom} className="hidden-handle" isConnectable={false} />
      <svg width={40} height={24} viewBox="0 0 40 24">
        <path
          d="M 2 22 A 18 18 0 0 1 38 22 Z"
          fill="var(--entity-bg)"
          stroke={stroke}
          strokeWidth={selected ? 2 : 1.4}
          strokeDasharray={inh.complete ? undefined : '3 2'}
        />
        {inh.mutuallyExclusive && <path d="M 12 10 L 28 20 M 28 10 L 12 20" stroke={stroke} strokeWidth={1.4} />}
      </svg>
    </div>
  )
}
