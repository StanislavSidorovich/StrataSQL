// PNG / SVG export of the diagram currently on screen (CDM or PDM), cropped to its content.

import type { Rect } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'

const PADDING = 32

/** `b`: bounds of all nodes (`useReactFlow().getNodesBounds(getNodes())`). */
export async function exportDiagram(b: Rect, format: 'png' | 'svg', fileName: string): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport || b.width === 0) throw new Error('Nothing to export')
  const width = Math.ceil(b.width + PADDING * 2)
  const height = Math.ceil(b.height + PADDING * 2)
  const options = {
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${PADDING - b.x}px, ${PADDING - b.y}px) scale(1)`,
    },
  }
  const url = format === 'png' ? await toPng(viewport, { ...options, pixelRatio: 2 }) : await toSvg(viewport, options)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.${format}`
  a.click()
}
