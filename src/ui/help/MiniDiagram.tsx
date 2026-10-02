// Static SVG rendering of a tiny CDM (help cards). Same symbols as the canvas, no React Flow.

import { formatCardinality, formatDataType, type Model } from '../../core/metamodel'
import { EndLabel, EndMarker } from '../canvas/RelationshipEdge'
import { add, center, edgeEnds, perp, scale, sub, unit, type Rect } from '../canvas/geometry'

const HEADER = 22
const LINE = 15
const CHAR = 6.4

function entityRect(m: Model, id: string): Rect {
  const e = m.entities.find((x) => x.id === id)!
  const lines = e.attributes.map((a) => `${a.name}  <pi>  ${formatDataType(a)}  <M>`)
  const width = Math.max(110, (e.name.length + 2) * 7.5, ...lines.map((l) => l.length * CHAR + 16))
  const height = HEADER + Math.max(1, e.attributes.length) * LINE + 8
  return { x: e.position.x, y: e.position.y, width, height }
}

export function MiniDiagram({ model }: { model: Model }) {
  const rects = new Map(model.entities.map((e) => [e.id, entityRect(model, e.id)]))
  const inhRects = new Map(model.inheritances.map((i) => [i.id, { x: i.position.x, y: i.position.y, width: 34, height: 20 }]))
  const all = [...rects.values(), ...inhRects.values()]
  const pad = 46
  const minX = Math.min(...all.map((r) => r.x)) - pad
  const minY = Math.min(...all.map((r) => r.y)) - pad
  const maxX = Math.max(...all.map((r) => r.x + r.width)) + pad
  const maxY = Math.max(...all.map((r) => r.y + r.height)) + pad
  const stroke = 'var(--edge)'

  const pairIndex = new Map<string, number>()
  const pairCount = new Map<string, number>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  for (const r of model.relationships) pairCount.set(pairKey(r.entityA, r.entityB), (pairCount.get(pairKey(r.entityA, r.entityB)) ?? 0) + 1)

  return (
    <svg className="mini-diagram" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={`Diagram: ${model.name}`}>
      {model.relationships.map((r) => {
        const a = rects.get(r.entityA)!
        const b = rects.get(r.entityB)!
        if (r.entityA === r.entityB) {
          const start = { x: a.x + a.width - 30, y: a.y }
          const end = { x: a.x + a.width, y: a.y + 26 }
          return (
            <g key={r.id}>
              <path d={`M ${start.x} ${start.y} C ${start.x} ${start.y - 60}, ${end.x + 60} ${end.y}, ${end.x} ${end.y}`} fill="none" stroke={stroke} strokeWidth={1.3} />
              <g stroke={stroke} fill="none" strokeWidth={1.3}>
                <EndMarker at={start} dir={{ x: 0, y: -1 }} card={r.cardinalityA} dependent={false} stroke={stroke} />
                <EndMarker at={end} dir={{ x: 1, y: 0 }} card={r.cardinalityB} dependent={false} stroke={stroke} />
              </g>
              <g fontSize={11} fill="var(--edge-label)">
                <text x={start.x - 30} y={start.y - 20} fontWeight={600}>{formatCardinality(r.cardinalityA)}</text>
                <text x={end.x + 20} y={end.y + 18} fontWeight={600}>{formatCardinality(r.cardinalityB)}</text>
                {r.roleA && <text x={start.x - 30} y={start.y - 34} fontStyle="italic" fill="var(--edge-name)">{r.roleA}</text>}
                {r.roleB && <text x={end.x + 20} y={end.y + 32} fontStyle="italic" fill="var(--edge-name)">{r.roleB}</text>}
              </g>
            </g>
          )
        }
        const k = pairKey(r.entityA, r.entityB)
        const index = pairIndex.get(k) ?? 0
        pairIndex.set(k, index + 1)
        const sign = r.entityA < r.entityB ? 1 : -1
        const { from, to } = edgeEnds(a, b, sign * (index - ((pairCount.get(k) ?? 1) - 1) / 2) * 26)
        const dirA = unit(sub(to, from))
        const mid = scale(add(from, to), 0.5)
        return (
          <g key={r.id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={1.3} />
            <g stroke={stroke} fill="none" strokeWidth={1.3}>
              <EndMarker at={from} dir={dirA} card={r.cardinalityA} dependent={r.dependentSide === 'A'} stroke={stroke} />
              <EndMarker at={to} dir={scale(dirA, -1)} card={r.cardinalityB} dependent={r.dependentSide === 'B'} stroke={stroke} />
            </g>
            <g fontSize={11} fill="var(--edge-label)">
              <EndLabel at={from} dir={dirA} text={formatCardinality(r.cardinalityA)} role={r.roleA} />
              <EndLabel at={to} dir={scale(dirA, -1)} text={formatCardinality(r.cardinalityB)} role={r.roleB} />
              {r.name && (
                <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontStyle="italic" fill="var(--edge-name)">
                  {r.name}
                </text>
              )}
            </g>
          </g>
        )
      })}

      {model.inheritances.map((i) => {
        const sym = inhRects.get(i.id)!
        const c = center(sym)
        const parent = rects.get(i.parentId)!
        const toParent = edgeEnds(sym, parent)
        const d = unit(sub(toParent.from, toParent.to))
        const n = perp(d)
        const base = add(toParent.to, scale(d, 10))
        const l = add(base, scale(n, 5))
        const rr = add(base, scale(n, -5))
        return (
          <g key={i.id} stroke={stroke} strokeWidth={1.3}>
            <line x1={toParent.from.x} y1={toParent.from.y} x2={toParent.to.x} y2={toParent.to.y} />
            <path d={`M ${toParent.to.x} ${toParent.to.y} L ${l.x} ${l.y} L ${rr.x} ${rr.y} Z`} fill={stroke} />
            {i.childIds.map((cid) => {
              const e = edgeEnds(rects.get(cid)!, sym)
              return <line key={cid} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} />
            })}
            <path
              d={`M ${sym.x} ${sym.y + sym.height} A 17 17 0 0 1 ${sym.x + sym.width} ${sym.y + sym.height} Z`}
              fill="var(--entity-bg)"
              strokeDasharray={i.complete ? undefined : '3 2'}
            />
            {i.mutuallyExclusive && <path d={`M ${c.x - 7} ${c.y - 2} L ${c.x + 7} ${c.y + 8} M ${c.x + 7} ${c.y - 2} L ${c.x - 7} ${c.y + 8}`} fill="none" />}
          </g>
        )
      })}

      {model.entities.map((e) => {
        const r = rects.get(e.id)!
        const pi = e.identifiers.find((x) => x.isPrimary)
        const ak = e.identifiers.filter((x) => !x.isPrimary)
        return (
          <g key={e.id} fontSize={11}>
            <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={3} fill="var(--entity-bg)" stroke="var(--entity-border)" strokeWidth={1.3} />
            <rect x={r.x} y={r.y} width={r.width} height={HEADER} rx={3} fill="var(--entity-header)" stroke="var(--entity-border)" strokeWidth={1.3} />
            <text x={r.x + 8} y={r.y + 15} fontWeight={700} fill="var(--text)">
              {e.name}
            </text>
            {e.attributes.length === 0 && (
              <text x={r.x + 8} y={r.y + HEADER + 12} fontStyle="italic" fill="var(--muted)">
                no attributes
              </text>
            )}
            {e.attributes.map((a, idx) => {
              const inPi = pi?.attributeIds.includes(a.id)
              const inAk = ak.some((x) => x.attributeIds.includes(a.id))
              const y = r.y + HEADER + 12 + idx * LINE
              return (
                <g key={a.id}>
                  <text x={r.x + 8} y={y} fill="var(--text)" textDecoration={inPi ? 'underline' : undefined}>
                    {a.name}
                    {inPi && <tspan fill="var(--accent)" fontWeight={600}>{'  <pi>'}</tspan>}
                    {inAk && <tspan fill="var(--accent)" fontWeight={600}>{'  <ai>'}</tspan>}
                  </text>
                  <text x={r.x + r.width - 8} y={y} textAnchor="end" fill="var(--muted)">
                    {formatDataType(a)}
                    {a.mandatory ? '  <M>' : ''}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
