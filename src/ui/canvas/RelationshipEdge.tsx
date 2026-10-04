import { BaseEdge, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react'
import { formatCardinality, type Cardinality } from '../../core/metamodel'
import { issueTouches } from '../../core/lint'
import { worstSeverity } from '../lint/IssuesPanel'
import { useEditor, useLint, useSpotlight } from '../store'
import { add, edgeEnds, perp, scale, sub, unit, type Rect, type Vec } from './geometry'

export type RelationshipEdgeData = { relationshipId: string; offset: number }
export type RelationshipEdgeType = Edge<RelationshipEdgeData, 'relationship'>

export function nodeRect(n: InternalNode | undefined): Rect | null {
  if (!n?.measured.width || !n.measured.height) return null
  const p = n.internals.positionAbsolute
  return { x: p.x, y: p.y, width: n.measured.width, height: n.measured.height }
}

export function RelationshipEdge({ id, source, target, data, selected }: EdgeProps<RelationshipEdgeType>) {
  const rel = useEditor((s) => s.model.relationships.find((r) => r.id === data?.relationshipId))
  const a = nodeRect(useInternalNode(source))
  const b = nodeRect(useInternalNode(target))
  const severity = worstSeverity(useLint(), 'relationship', data?.relationshipId ?? '')
  const focused = useEditor((s) => (s.focusedIssue ? issueTouches(s.focusedIssue, 'relationship', data?.relationshipId ?? '') : false))
  const isNew = useSpotlight(data?.relationshipId)
  if (!rel || !a || !b) return null

  const stroke = selected
    ? 'var(--edge-selected)'
    : isNew
      ? 'var(--walk-new)'
      : focused || severity === 'error'
      ? 'var(--lint-error)'
      : severity === 'warning'
        ? 'var(--lint-warning)'
        : 'var(--edge)'

  if (source === target) return <ReflexiveEdge id={id} rect={a} rel={rel} stroke={stroke} />

  const { from, to } = edgeEnds(a, b, data?.offset ?? 0)
  const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  const mid = scale(add(from, to), 0.5)
  const dirA = unit(sub(to, from))
  const dirB = scale(dirA, -1)
  // A parallel line (same pair of entities) keeps its labels on its outer side, away from its neighbour.
  const outer = Math.sign(data?.offset ?? 0)
  const nameAt = outer ? add(mid, scale(perp(dirA), outer * 8)) : { x: mid.x, y: mid.y - 6 }

  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={16} style={{ stroke, strokeWidth: selected || focused || isNew ? 2.4 : 1.4 }} />
      <g className="pointer-events-none" stroke={stroke} fill="none" strokeWidth={1.4}>
        <EndMarker at={from} dir={dirA} card={rel.cardinalityA} dependent={rel.dependentSide === 'A'} stroke={stroke} />
        <EndMarker at={to} dir={dirB} card={rel.cardinalityB} dependent={rel.dependentSide === 'B'} stroke={stroke} />
      </g>
      <g className="pointer-events-none select-none" style={{ fontSize: 'calc(11px * var(--diagram-zoom, 1))' }} fill="var(--edge-label)">
        <EndLabel at={from} dir={dirA} text={formatCardinality(rel.cardinalityA)} role={rel.roleA} outer={outer} />
        <EndLabel at={to} dir={dirB} text={formatCardinality(rel.cardinalityB)} role={rel.roleB} outer={-outer} />
        {rel.name && (
          <text x={nameAt.x} y={outer ? nameAt.y + 4 : nameAt.y} textAnchor={outer ? anchorAway(scale(perp(dirA), outer)) : 'middle'} fontStyle="italic" fill="var(--edge-name)">
            {rel.name}
          </text>
        )}
      </g>
    </>
  )
}

/**
 * Information Engineering end symbol, drawn at the entity border.
 * Closest to the entity: max (bar = 1, crow's foot = n); further out: min (bar = 1, circle = 0).
 * A dependent end additionally gets a small triangle pointing at the parent.
 */
export function EndMarker({ at, dir, card, dependent, stroke }: { at: Vec; dir: Vec; card: Cardinality; dependent: boolean; stroke: string }) {
  const n = perp(dir)
  const p = (along: number, side = 0) => add(add(at, scale(dir, along)), scale(n, side))
  const line = (u: Vec, v: Vec) => `M ${u.x} ${u.y} L ${v.x} ${v.y}`
  const parts: string[] = []
  if (card.max === 'n') {
    const tip = p(12)
    parts.push(line(tip, p(0, -7)), line(tip, p(0, 7)), line(tip, p(0)))
  } else {
    parts.push(line(p(8, -6), p(8, 6)))
  }
  let circle: Vec | null = null
  if (card.min === 1) parts.push(line(p(18, -6), p(18, 6)))
  else circle = p(21)
  const tri = dependent ? [p(28, -5), p(28, 5), p(36)] : null
  return (
    <>
      <path d={parts.join(' ')} />
      {circle && <circle cx={circle.x} cy={circle.y} r={4} fill="var(--canvas-bg)" />}
      {tri && <path d={`M ${tri[0].x} ${tri[0].y} L ${tri[1].x} ${tri[1].y} L ${tri[2].x} ${tri[2].y} Z`} fill={stroke} />}
    </>
  )
}

/** Text anchor that keeps a label on the side `away` points to (a vertical line: left or right of it). */
function anchorAway(away: Vec): 'start' | 'middle' | 'end' {
  return away.x > 0.3 ? 'start' : away.x < -0.3 ? 'end' : 'middle'
}

/**
 * Cardinality (and role) near one end. `outer` (+1 / −1 along the end's normal) is set for parallel
 * lines: both labels go to that side, stacked along the line, so they don't cross the neighbour.
 */
export function EndLabel({ at, dir, text, role, outer = 0 }: { at: Vec; dir: Vec; text: string; role?: string; outer?: number }) {
  const n = perp(dir)
  if (outer) {
    const away = scale(n, outer)
    const anchor = anchorAway(away)
    const shift = anchor === 'middle' ? 12 : 6
    const pos = add(add(at, scale(dir, 28)), scale(away, shift))
    const rolePos = add(add(at, scale(dir, 44)), scale(away, shift))
    return (
      <>
        <text x={pos.x} y={pos.y + 4} textAnchor={anchor} fontWeight={600}>
          {text}
        </text>
        {role && (
          <text x={rolePos.x} y={rolePos.y + 4} textAnchor={anchor} fontStyle="italic" fill="var(--edge-name)">
            {role}
          </text>
        )}
      </>
    )
  }
  // Put the label on the side of the line that points "up/left" so it reads consistently.
  const side = n.y > 0 || (n.y === 0 && n.x > 0) ? -1 : 1
  const pos = add(add(at, scale(dir, 30)), scale(n, side * 12))
  const rolePos = add(add(at, scale(dir, 30)), scale(n, -side * 14))
  return (
    <>
      <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontWeight={600}>
        {text}
      </text>
      {role && (
        <text x={rolePos.x} y={rolePos.y + 4} textAnchor="middle" fontStyle="italic" fill="var(--edge-name)">
          {role}
        </text>
      )}
    </>
  )
}

function ReflexiveEdge({ id, rect, rel, stroke }: { id: string; rect: Rect; rel: { cardinalityA: Cardinality; cardinalityB: Cardinality; roleA?: string; roleB?: string; name: string }; stroke: string }) {
  // Loop from the top border to the right border near the top-right corner.
  const start = { x: rect.x + rect.width - 40, y: rect.y }
  const end = { x: rect.x + rect.width, y: rect.y + 30 }
  const path = `M ${start.x} ${start.y} C ${start.x} ${start.y - 70}, ${end.x + 70} ${end.y}, ${end.x} ${end.y}`
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={16} style={{ stroke, strokeWidth: 1.4 }} />
      <g className="pointer-events-none" stroke={stroke} fill="none" strokeWidth={1.4}>
        <EndMarker at={start} dir={{ x: 0, y: -1 }} card={rel.cardinalityA} dependent={false} stroke={stroke} />
        <EndMarker at={end} dir={{ x: 1, y: 0 }} card={rel.cardinalityB} dependent={false} stroke={stroke} />
      </g>
      <g className="pointer-events-none select-none" style={{ fontSize: 'calc(11px * var(--diagram-zoom, 1))' }} fill="var(--edge-label)">
        <text x={start.x - 26} y={start.y - 22} fontWeight={600}>{formatCardinality(rel.cardinalityA)}</text>
        <text x={end.x + 22} y={end.y + 18} fontWeight={600}>{formatCardinality(rel.cardinalityB)}</text>
        {rel.roleA && <text x={start.x - 26} y={start.y - 36} fontStyle="italic" fill="var(--edge-name)">{rel.roleA}</text>}
        {rel.roleB && <text x={end.x + 22} y={end.y + 32} fontStyle="italic" fill="var(--edge-name)">{rel.roleB}</text>}
      </g>
    </>
  )
}
