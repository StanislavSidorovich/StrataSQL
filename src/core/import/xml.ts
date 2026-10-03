// A tiny XML reader: enough for PowerDesigner model files (elements, attributes, text, CDATA).
// Pure TS so the importer also runs in Vitest (node has no DOMParser).

export interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e] ?? all
  })
}

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlElement[] = [root]
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    const top = stack[stack.length - 1]
    if (lt < 0) break
    if (lt > i) top.text += decode(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) {
      i = end(src, '-->', lt) + 3
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = end(src, ']]>', lt)
      top.text += src.slice(lt + 9, e)
      i = e + 3
    } else if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      i = end(src, '>', lt) + 1
    } else if (src[lt + 1] === '/') {
      const e = end(src, '>', lt)
      const name = src.slice(lt + 2, e).trim()
      if (top.name !== name) throw new Error(`XML: </${name}> does not close <${top.name}>`)
      stack.pop()
      i = e + 1
    } else {
      const e = end(src, '>', lt)
      let body = src.slice(lt + 1, e)
      const selfClosing = body.endsWith('/')
      if (selfClosing) body = body.slice(0, -1)
      const m = /^([^\s/>]+)/.exec(body)
      if (!m) throw new Error('XML: bad tag')
      const el: XmlElement = { name: m[1], attrs: {}, children: [], text: '' }
      for (const a of body.slice(m[1].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = decode(a[3] ?? a[4])
      top.children.push(el)
      if (!selfClosing) stack.push(el)
      i = e + 1
    }
  }
  if (stack.length > 1) throw new Error(`XML: <${stack[stack.length - 1].name}> is not closed`)
  return root
}

function end(src: string, token: string, from: number): number {
  const e = src.indexOf(token, from)
  if (e < 0) throw new Error('XML: unexpected end of file')
  return e
}

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name)
}

export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el?.children.filter((c) => c.name === name) ?? []
}

/** Text of a direct child element (`<a:Name>…</a:Name>`), trimmed. */
export function textOf(el: XmlElement | undefined, name: string): string | undefined {
  const c = child(el, name)
  return c ? c.text.trim() : undefined
}

/** Every descendant with this name (depth-first). */
export function descendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (c.name === name) out.push(c)
    descendants(c, name, out)
  }
  return out
}
