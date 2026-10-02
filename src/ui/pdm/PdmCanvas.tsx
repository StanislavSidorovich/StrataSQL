// Read-only diagram of the generated PDM. Tables sit where their entities are on the conceptual
// canvas (join tables halfway between their two entities), so both views are easy to compare.

import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useInternalNode,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import { sqlServerType } from '../../core/ddl/sqlserver'
import type { Model, Point } from '../../core/metamodel'
import { columnFlags, type Pdm, type PdmForeignKey, type PdmTable } from '../../core/pdm'
import { add, edgeEnds, perp, scale, sub, unit } from '../canvas/geometry'
import { EntityNode } from '../canvas/EntityNode'
import { InheritanceNode } from '../canvas/InheritanceNode'
import { InheritanceEdge } from '../canvas/InheritanceEdge'
import { nodeRect, RelationshipEdge } from '../canvas/RelationshipEdge'
import { useEditor, usePdm } from '../store'

type TableNodeType = Node<{ table: PdmTable }, 'table'>
type FkEdgeType = Edge<{ fk: PdmForeignKey; offset: number; highlighted: boolean }, 'fk'>

// Both canvases share one React Flow store: when the view switches, the first render still sees the
// other view's nodes and edges, so every type is registered in both.
const nodeTypes = { table: TableNode, entity: EntityNode, inheritance: InheritanceNode }
const edgeTypes = { fk: FkEdge, relationship: RelationshipEdge, inheritance: InheritanceEdge }

/** Tables are wider than entities: spread the conceptual layout a little. */
const SPREAD = { x: 1.3, y: 1.12 }
const PARALLEL_GAP = 22

function tablePosition(m: Model, t: PdmTable): Point {
  const spread = (p: Point) => ({ x: Math.round(p.x * SPREAD.x), y: Math.round(p.y * SPREAD.y) })
  if (t.source.kind === 'entity') {
    const id = t.source.id
    const e = m.entities.find((x) => x.id === id)
    return spread(e?.position ?? { x: 0, y: 0 })
  }
  const relId = t.source.kind === 'relationship' ? t.source.id : ''
  const r = m.relationships.find((x) => x.id === relId)
  const a = m.entities.find((e) => e.id === r?.entityA)?.position ?? { x: 0, y: 0 }
  const b = m.entities.find((e) => e.id === r?.entityB)?.position ?? a
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  // A reflexive join table would sit on top of its entity: move it aside.
  return spread(r?.entityA === r?.entityB ? { x: mid.x + 260, y: mid.y } : mid)
}

function buildNodes(m: Model, pdm: Pdm, selected: string | null): TableNodeType[] {
  return pdm.tables.map((t) => ({
    id: t.name,
    type: 'table',
    position: tablePosition(m, t),
    data: { table: t },
    selected: t.name === selected,
  }))
}

function buildEdges(pdm: Pdm, selected: string | null): FkEdgeType[] {
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const groups = new Map<string, string[]>()
  const all = pdm.tables.flatMap((t) => t.foreignKeys.map((fk) => ({ t, fk })))
  for (const { t, fk } of all) {
    const k = pairKey(t.name, fk.refTable)
    groups.set(k, [...(groups.get(k) ?? []), fk.name])
  }
  return all.map(({ t, fk }) => {
    const group = groups.get(pairKey(t.name, fk.refTable))!
    const sign = t.name < fk.refTable ? 1 : -1
    return {
      id: fk.name,
      type: 'fk',
      source: t.name,
      target: fk.refTable,
      data: {
        fk,
        offset: sign * (group.indexOf(fk.name) - (group.length - 1) / 2) * PARALLEL_GAP,
        highlighted: selected === t.name || selected === fk.refTable,
      },
    }
  })
}

export function PdmCanvas({ dark }: { dark: boolean }) {
  const model = useEditor((s) => s.model)
  const selected = useEditor((s) => s.tableSelection)
  const selectTable = useEditor((s) => s.selectTable)
  const pdm = usePdm()

  // Tables can be moved for a better view (not saved: the view starts from the CDM layout each time).
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(buildNodes(model, pdm, selected))
  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return buildNodes(model, pdm, selected).map((n) => {
        const p = byId.get(n.id)
        return p ? { ...n, position: p.position, measured: p.measured } : n
      })
    })
  }, [model, pdm, selected, setNodes])
  const edges = useMemo(() => buildEdges(pdm, selected), [pdm, selected])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => selectTable(n.id)}
        onEdgeClick={(_, e) => selectTable(e.source)}
        onPaneClick={() => selectTable(null)}
        nodesConnectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        zoomOnDoubleClick={false}
        colorMode={dark ? 'dark' : 'light'}
        fitView
        minZoom={0.15}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-[var(--panel-bg)]" />
      </ReactFlow>
    </div>
  )
}

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const t = data.table
  if (!t) return null // transitional render with the other view's node (see nodeTypes)
  const flags = columnFlags(t)
  return (
    <div className={`entity-node table-node ${selected ? 'is-selected' : ''}`} data-testid={`table-${t.name}`}>
      <Handle type="target" position={Position.Top} className="hidden-handle" isConnectable={false} />
      <Handle type="source" position={Position.Top} className="hidden-handle" isConnectable={false} />
      <div className="entity-header">
        <span>{t.name}</span>
        {t.source.kind === 'relationship' && <span className="entity-parent">join table</span>}
      </div>
      <div className="entity-body">
        {t.columns.map((c) => {
          const f = flags.get(c.name) ?? []
          return (
            <div key={c.name} className={`table-col ${c.migrated ? 'is-migrated' : ''}`} title={c.migrated ? 'Migrated through a foreign key' : undefined}>
              <span className={f.includes('pk') ? 'attr-pi' : ''}>{c.name}</span>
              <span className="attr-type">{sqlServerType(c)}</span>
              <span className="col-null">{c.nullable ? 'null' : 'not null'}</span>
              <span className="attr-flags">{f.length > 0 && <b>&lt;{f.join(',')}&gt;</b>}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Reference line from the child table to the parent table, with an arrow at the parent. */
export function FkEdge({ id, source, target, data }: EdgeProps<FkEdgeType>) {
  const a = nodeRect(useInternalNode(source))
  const b = nodeRect(useInternalNode(target))
  if (!a || !b || !data?.fk) return null
  const stroke = data.highlighted ? 'var(--edge-selected)' : 'var(--edge)'
  const width = data.highlighted ? 1.8 : 1.2
  const title = `${data.fk.name}\n(${data.fk.columns.join(', ')}) → ${data.fk.refTable} (${data.fk.refColumns.join(', ')})`

  if (source === target) {
    // Reflexive: a loop on the right side of the table.
    const x = a.x + a.width
    const y = a.y + 20 + Math.abs(data.offset)
    const path = `M ${x} ${y} h 30 v 26 h -30`
    return (
      <g>
        <title>{title}</title>
        <BaseEdge id={id} path={path} interactionWidth={14} style={{ stroke, strokeWidth: width }} />
        <Arrow at={{ x, y: y + 26 }} dir={{ x: -1, y: 0 }} stroke={stroke} />
      </g>
    )
  }

  const { from, to } = edgeEnds(a, b, data.offset)
  const dir = unit(sub(to, from))
  return (
    <g>
      <title>{title}</title>
      <BaseEdge id={id} path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} interactionWidth={14} style={{ stroke, strokeWidth: width }} />
      <Arrow at={to} dir={dir} stroke={stroke} />
    </g>
  )
}

function Arrow({ at, dir, stroke }: { at: { x: number; y: number }; dir: { x: number; y: number }; stroke: string }) {
  const back = scale(dir, -9)
  const side = scale(perp(dir), 4.5)
  const p1 = add(add(at, back), side)
  const p2 = sub(add(at, back), side)
  return <path d={`M ${p1.x} ${p1.y} L ${at.x} ${at.y} L ${p2.x} ${p2.y} Z`} fill={stroke} stroke={stroke} className="pointer-events-none" />
}
