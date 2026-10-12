import { BaseEdge, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import { add, edgeEnds, perp, scale, sub, unit } from './geometry'
import { nodeRect } from './RelationshipEdge'
import { useStoryLook } from '../story/storyStore'

/** `toParent`: edge from the inheritance symbol to the parent entity (drawn with an arrow head). */
export type InheritanceEdgeData = { inheritanceId: string; toParent: boolean }
export type InheritanceEdgeType = Edge<InheritanceEdgeData, 'inheritance'>

export function InheritanceEdge({ id, source, target, data, selected }: EdgeProps<InheritanceEdgeType>) {
  const a = nodeRect(useInternalNode(source))
  const b = nodeRect(useInternalNode(target))
  // In a story the lines follow their inheritance symbol: animated in, dimmed or as usual.
  const storyLook = useStoryLook(data?.inheritanceId)
  if (!a || !b) return null
  const { from, to } = edgeEnds(a, b)
  const stroke = selected ? 'var(--edge-selected)' : 'var(--edge)'
  let arrow: string | null = null
  if (data?.toParent) {
    const d = unit(sub(from, to))
    const n = perp(d)
    const base = add(to, scale(d, 11))
    const l = add(base, scale(n, 5))
    const r = add(base, scale(n, -5))
    arrow = `M ${to.x} ${to.y} L ${l.x} ${l.y} L ${r.x} ${r.y} Z`
  }
  return (
    <g className={storyLook.includes('story-new') ? 'story-fade' : storyLook.includes('story-dim') ? 'story-dim' : undefined}>
      <BaseEdge
        id={id}
        path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
        interactionWidth={14}
        style={{ stroke, strokeWidth: selected ? 2 : 1.4 }}
      />
      {arrow && <path d={arrow} fill={stroke} stroke={stroke} className="pointer-events-none" />}
    </g>
  )
}
