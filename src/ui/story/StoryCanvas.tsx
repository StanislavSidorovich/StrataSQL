// Story mode on the canvas: ghost boxes and their dashed lines, the camera that moves to each beat,
// and the comment card next to the beat's focus, tied to it by a thin leader line.

import { BaseEdge, Handle, Position, useInternalNode, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { quotesOf, textsOf, type PlacedGhost, type StoryFrame } from '../../data/story'
import { HiddenTarget } from '../canvas/EntityNode'
import { edgeEnds } from '../canvas/geometry'
import { nodeRect } from '../canvas/RelationshipEdge'
import { richText } from '../help/HelpDrawer'
import { useFrame, useStory } from './storyStore'

export type GhostNodeType = Node<{ ghost: PlacedGhost; isNew: boolean }, 'ghost'>
export type GhostEdgeType = Edge<{ isNew: boolean }, 'ghost'>

/** A dashed box: what the task asks for and the model does not hold yet. */
export function GhostNode({ id, data }: NodeProps<GhostNodeType>) {
  const frame = useFrame()
  const focus = frame?.focus === id
  const { ghost, isNew } = data
  // An earlier beat's ghost steps back like the entities, unless the beat shows everything.
  const dim = !isNew && !focus && !frame?.beat.overview && !frame?.fit.includes(id)
  return (
    <div className={`ghost-node ${isNew ? 'story-new' : ''} ${focus ? 'story-focus' : ''} ${dim ? 'story-dim' : ''}`} title="Asked for by the task, not in the model yet">
      <HiddenTarget />
      <Handle type="source" position={Position.Right} className="hidden-handle" isConnectable={false} />
      <div className="ghost-header">{ghost.name}</div>
      {!!ghost.attributes?.length && (
        <div className="ghost-body">
          {ghost.attributes.map((a) => (
            <div key={a}>{a}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GhostEdge({ id, source, target, data }: EdgeProps<GhostEdgeType>) {
  const a = nodeRect(useInternalNode(source))
  const b = nodeRect(useInternalNode(target))
  const overview = useFrame()?.beat.overview
  if (!a || !b) return null
  const { from, to } = edgeEnds(a, b)
  return (
    <g className={data?.isNew ? 'story-fade' : overview ? undefined : 'story-dim'}>
      <BaseEdge id={id} path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} interactionWidth={0} className="ghost-edge" />
    </g>
  )
}

export function ghostNodes(f: StoryFrame): GhostNodeType[] {
  return f.ghosts.map((g) => ({ id: g.id, type: 'ghost', position: g.position, data: { ghost: g, isNew: f.currentGhosts.includes(g.id) }, draggable: false, selectable: false }))
}

export function ghostEdges(f: StoryFrame): GhostEdgeType[] {
  return f.ghosts.flatMap((g) => g.linkIds.map((e) => ({ id: `${g.id}->${e}`, type: 'ghost', source: g.id, target: e, data: { isNew: f.currentGhosts.includes(g.id) }, selectable: false })))
}

/** Room kept on the right for the comment card (px of the canvas). */
const cardRoom = (width: number) => Math.min(440, Math.max(300, width * 0.36))

/** Moves the camera to each beat: its elements fit the left part, the card gets the right. */
export function StoryCamera() {
  const flow = useReactFlow()
  const frame = useFrame()
  const beat = useStory((s) => s.beat)
  const width = useStore((s) => s.width)
  const presenting = useStory((s) => s.presenting)
  useEffect(() => {
    if (!frame) return
    const fit = (duration: number) => {
      const ids = frame.fit.length ? frame.fit : flow.getNodes().map((n) => n.id)
      flow.fitView({
        nodes: ids.map((id) => ({ id })),
        padding: { top: '56px', bottom: '56px', left: '56px', right: `${cardRoom(width)}px` },
        // Closer than 100 % while presenting: a projector needs larger boxes.
        maxZoom: presenting ? 1.4 : 1,
        minZoom: 0.2,
        duration,
      })
    }
    // New nodes are measured first, or fitView leaves them out; after a reload the canvas comes later.
    const timers = [setTimeout(() => fit(800), 120), setTimeout(() => fit(400), 950)]
    return () => timers.forEach(clearTimeout)
    // A wider canvas (Present, a hidden column, a resized window) fits the beat again.
  }, [beat, frame, flow, width, presenting])
  return null
}

/** The comment of the beat: right of the beat's elements, level with its focus, with a leader line. */
export function StoryCallout() {
  const frame = useFrame()
  const beat = useStory((s) => s.beat)
  const total = useStory((s) => s.frames.length)
  const [tx, ty, zoom] = useStore((s) => s.transform)
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const nodeLookup = useStore((s) => s.nodeLookup)
  const focus = useInternalNode(frame?.focus ?? '')
  const card = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(200)
  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight)
  })
  if (!frame) return null
  const b = frame.beat
  const quotes = quotesOf(b)
  const texts = textsOf(b)
  if (!b.title && !quotes.length && !texts.length) return null

  const cardW = cardRoom(width) - 48
  const screen = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x * zoom + tx, y: r.y * zoom + ty, w: r.width * zoom, h: r.height * zoom })
  const focusRect = nodeRect(focus)
  // No focus: top right, or in the middle of an empty canvas (the title of the story).
  const empty = frame.model.entities.length === 0
  let left = empty ? (width - cardW) / 2 : width - cardW - 24
  let top = empty ? Math.max(24, height * 0.32 - cardH / 2) : 24
  let leader: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (focusRect && frame.focus) {
    const f = screen(focusRect)
    // Right of everything the beat shows, so the card covers none of it.
    const right = frame.fit.reduce((m, id) => {
      const r = nodeRect(nodeLookup.get(id))
      return r ? Math.max(m, screen(r).x + screen(r).w) : m
    }, f.x + f.w)
    left = Math.max(16, Math.min(right + 40, width - cardW - 16))
    top = Math.max(16, Math.min(f.y + f.h / 2 - cardH / 2, height - cardH - 16))
    const y = Math.max(top + 18, Math.min(f.y + f.h / 2, top + cardH - 18))
    if (left > f.x + f.w + 8) leader = { x1: f.x + f.w + 4, y1: Math.max(f.y + 6, Math.min(y, f.y + f.h - 6)), x2: left, y2: y }
  }

  return (
    <>
      {leader && (
        <svg className="story-leader" width={width} height={height} aria-hidden>
          <line {...leader} />
          <circle cx={leader.x1} cy={leader.y1} r={3.5} />
        </svg>
      )}
      <div key={beat} ref={card} className="story-card" style={{ left, top, width: cardW }} role="status" aria-live="polite">
        <div className="story-card-step">
          {beat === 0 ? 'Story' : `${beat} / ${total - 1}`}
        </div>
        <h3>{b.title}</h3>
        {quotes.map((q, k) => (
          <blockquote key={k}>“{q}”</blockquote>
        ))}
        {texts.map((t, k) => (
          <p key={k}>{richText(t)}</p>
        ))}
        {b.status && (
          <div className="story-status" aria-label="Status">
            {b.status.values.map((v, k) => (
              <span key={v} className={k === b.status!.now ? 'is-now' : k < b.status!.now ? 'is-past' : ''}>
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
