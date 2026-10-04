// Keeps the diagram where it is on the screen when the canvas itself moves: hiding, showing or
// resizing the left column shifts the canvas's left edge, and the viewport moves back by the same
// amount. Centring instead would push the diagram far to the right once the column comes back.
// Rendered inside <ReactFlow>.

import { useReactFlow, useStore } from '@xyflow/react'
import { useEffect } from 'react'

/** The diagram's left edge stays at least this far inside the canvas when the column widens. */
const MARGIN = 16

export function KeepOnScreen() {
  const flow = useReactFlow()
  const dom = useStore((s) => s.domNode)

  useEffect(() => {
    if (!dom) return
    let left = dom.getBoundingClientRect().left
    const follow = () => {
      const now = dom.getBoundingClientRect().left
      const dx = now - left
      left = now
      if (!dx) return
      const vp = flow.getViewport()
      let x = vp.x - dx
      // The canvas got narrower from the left: do not slide the diagram out of sight.
      if (dx > 0) {
        const nodes = flow.getNodes()
        if (nodes.length) {
          const minX = Math.min(...nodes.map((n) => n.position.x))
          x = Math.min(vp.x, Math.max(x, MARGIN - minX * vp.zoom))
        }
      }
      flow.setViewport({ ...vp, x })
    }
    const ro = new ResizeObserver(follow)
    ro.observe(dom)
    window.addEventListener('resize', follow)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', follow)
    }
  }, [dom, flow])

  return null
}
