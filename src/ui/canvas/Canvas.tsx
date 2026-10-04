import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import type { Model } from '../../core/metamodel'
import { addEntity, addRelationship, linkInheritance, updateEntity, updateInheritance } from '../../core/ops'
import { FkEdge, TableNode } from '../pdm/PdmCanvas'
import { useEditor, type Selection } from '../store'
import { EntityNode, type EntityNodeType } from './EntityNode'
import { InheritanceEdge, type InheritanceEdgeType } from './InheritanceEdge'
import { InheritanceNode, type InheritanceNodeType } from './InheritanceNode'
import { RelationshipEdge, type RelationshipEdgeType } from './RelationshipEdge'

// `table` / `fk` too: see PdmCanvas (shared React Flow store across views).
const nodeTypes = { entity: EntityNode, inheritance: InheritanceNode, table: TableNode }
const edgeTypes = { relationship: RelationshipEdge, inheritance: InheritanceEdge, fk: FkEdge }

type AnyNode = EntityNodeType | InheritanceNodeType
const PARALLEL_GAP = 26

function buildNodes(m: Model, sel: Selection): AnyNode[] {
  return [
    ...m.entities.map(
      (e): EntityNodeType => ({
        id: e.id,
        type: 'entity',
        position: e.position,
        data: { entityId: e.id },
        selected: sel?.kind === 'entity' && sel.id === e.id,
      }),
    ),
    ...m.inheritances.map(
      (i): InheritanceNodeType => ({
        id: i.id,
        type: 'inheritance',
        position: i.position,
        data: { inheritanceId: i.id },
        selected: sel?.kind === 'inheritance' && sel.id === i.id,
      }),
    ),
  ]
}

function buildEdges(m: Model, sel: Selection): Edge[] {
  // Parallel relationships between the same pair are spread sideways.
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const groups = new Map<string, string[]>()
  for (const r of m.relationships) {
    const k = pairKey(r.entityA, r.entityB)
    groups.set(k, [...(groups.get(k) ?? []), r.id])
  }
  const rels = m.relationships.map((r): RelationshipEdgeType => {
    const group = groups.get(pairKey(r.entityA, r.entityB))!
    const index = group.indexOf(r.id)
    // Offsets are measured relative to the A→B direction; flip for reversed pairs so lines don't overlap.
    const sign = r.entityA < r.entityB ? 1 : -1
    return {
      id: r.id,
      type: 'relationship',
      source: r.entityA,
      target: r.entityB,
      data: { relationshipId: r.id, offset: sign * (index - (group.length - 1) / 2) * PARALLEL_GAP },
      selected: sel?.kind === 'relationship' && sel.id === r.id,
    }
  })
  const inhs = m.inheritances.flatMap((i): InheritanceEdgeType[] => {
    const selected = sel?.kind === 'inheritance' && sel.id === i.id
    return [
      { id: `${i.id}:parent`, type: 'inheritance', source: i.id, target: i.parentId, data: { inheritanceId: i.id, toParent: true }, selected },
      ...i.childIds.map(
        (c): InheritanceEdgeType => ({
          id: `${i.id}:${c}`,
          type: 'inheritance',
          source: c,
          target: i.id,
          data: { inheritanceId: i.id, toParent: false },
          selected,
        }),
      ),
    ]
  })
  return [...inhs, ...rels]
}

// Readable on open: never zoom past 100 % (one new entity used to fill the screen).
const FIT = { padding: 0.15, maxZoom: 1 }
// A small model fits on screen; the minimap would only hide part of it.
const MINIMAP_FROM = 10

export function Canvas({ dark }: { dark: boolean }) {
  const model = useEditor((s) => s.model)
  const selection = useEditor((s) => s.selection)
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const flow = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>(buildNodes(model, selection))
  useEffect(() => {
    // Keep measured sizes of existing nodes, otherwise React Flow hides them until re-measured.
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return buildNodes(model, selection).map((n) => {
        const p = byId.get(n.id)
        return p ? ({ ...p, ...n, measured: p.measured } as AnyNode) : n
      })
    })
  }, [model, selection, setNodes])
  const edges = useMemo(() => buildEdges(model, selection), [model, selection])

  const onNodeClick: NodeMouseHandler<AnyNode> = useCallback(
    (_, node) => select(node.type === 'entity' ? { kind: 'entity', id: node.id } : { kind: 'inheritance', id: node.id }),
    [select],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      apply((m) => {
        for (const n of dragged) {
          const pos = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
          if (n.type === 'entity') updateEntity(m, n.id, { position: pos })
          else updateInheritance(m, n.id, { position: pos })
        }
      })
    },
    [apply],
  )

  const onEdgeClick = useCallback(
    (_: ReactMouseEvent, edge: Edge) => {
      if (edge.type === 'relationship') select({ kind: 'relationship', id: edge.id })
      else select({ kind: 'inheritance', id: (edge.data as { inheritanceId: string }).inheritanceId })
    },
    [select],
  )

  // Links are created by dragging from an entity's handle and dropping anywhere on another entity.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const fromId = state.fromNode?.id
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      const el = document.elementFromPoint(point.clientX, point.clientY)
      const toId = el?.closest('.react-flow__node')?.getAttribute('data-id')
      if (!fromId || !toId || fromId === toId) return
      const { model: m, linkKind } = useEditor.getState()
      if (!m.entities.some((e) => e.id === toId)) return
      if (linkKind === 'relationship') {
        let createdId = ''
        if (apply((d) => (createdId = addRelationship(d, fromId, toId).id))) select({ kind: 'relationship', id: createdId })
      } else {
        let createdId = ''
        if (apply((d) => (createdId = linkInheritance(d, fromId, toId).id))) select({ kind: 'inheritance', id: createdId })
      }
    },
    [apply, select],
  )

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (!(event.target as HTMLElement).classList.contains('react-flow__pane')) return
      const pos = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      let createdId = ''
      apply((m) => (createdId = addEntity(m, { position: { x: Math.round(pos.x), y: Math.round(pos.y) } }).id))
      select({ kind: 'entity', id: createdId })
      useEditor.setState({ focusName: createdId })
    },
    [apply, flow, select],
  )

  return (
    <div className="h-full w-full" onDoubleClick={onDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => select(null)}
        onConnectEnd={onConnectEnd}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode="Shift"
        colorMode={dark ? 'dark' : 'light'}
        fitView
        fitViewOptions={FIT}
        minZoom={0.2}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        {nodes.length >= MINIMAP_FROM && <MiniMap pannable zoomable className="!bg-[var(--panel-bg)]" />}
      </ReactFlow>
    </div>
  )
}
