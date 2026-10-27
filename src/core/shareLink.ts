// Share by link: the whole model travels in the URL fragment (`#m=…`), compressed. Nothing is
// uploaded: the fragment never reaches the server, and opening the link gives the reader a copy.

import type { Model } from './metamodel'
import { parseModel, serializeModel } from './serialize'
import { parseStory, serializeStory, type Story } from '../data/story'

/** The fragment key: `https://model.quaera.app/#m=<data>`. */
export const SHARE_PARAM = 'm'
/** The earlier version the model is compared with, when there is one: `#m=<data>&b=<data>`. */
export const BASE_PARAM = 'b'

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/**
 * A copy with short ids (`0`, `1`, … `z`, `10`…). Generated ids like `att_muzbof4c1lf7mepf4` are
 * random, so deflate cannot shrink them; on a 12-entity model they were over a third of the link.
 */
export function withShortIds(m: Model): Model {
  const copy = JSON.parse(serializeModel(m)) as Model
  const ids = new Map<string, string>()
  const short = (id: string) => ids.get(id) ?? id
  const own = (o: { id: string }) => {
    ids.set(o.id, ids.size.toString(36))
    o.id = short(o.id)
  }
  copy.domains.forEach(own)
  for (const e of copy.entities) {
    own(e)
    e.attributes.forEach(own)
    e.identifiers.forEach(own)
    e.physicalKeys?.forEach(own)
  }
  copy.relationships.forEach(own)
  copy.inheritances.forEach(own)
  for (const e of copy.entities) {
    for (const a of e.attributes) if (a.domainId) a.domainId = short(a.domainId)
    for (const i of e.identifiers) i.attributeIds = i.attributeIds.map(short)
  }
  for (const r of copy.relationships) {
    r.entityA = short(r.entityA)
    r.entityB = short(r.entityB)
  }
  for (const h of copy.inheritances) {
    h.parentId = short(h.parentId)
    h.childIds = h.childIds.map(short)
  }
  return copy
}

/** Text as a URL-safe string: UTF-8, deflate-raw, base64url without padding. */
export async function packText(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')))
}

/** The model as a URL-safe string (short ids, compact JSON, deflate, base64url). */
export async function encodeShare(m: Model): Promise<string> {
  return packText(JSON.stringify(withShortIds(m)))
}

/** The model back from {@link encodeShare}; a damaged link throws a readable error. */
export async function decodeShare(data: string): Promise<Model> {
  let json: string
  try {
    json = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')))
  } catch {
    throw new Error('The link is damaged or incomplete (it may have been cut when it was copied).')
  }
  return parseModel(json)
}

/** The share data in a URL fragment, or null when the fragment holds none. */
export function shareDataFromHash(hash: string): string | null {
  const data = new URLSearchParams(hash.replace(/^#/, '')).get(SHARE_PARAM)
  return data || null
}

/** The full link for a model, based on the current page address (without its query and fragment). */
export async function shareUrl(m: Model, base: string, comparedWith?: Model | null): Promise<string> {
  const url = new URL(base)
  url.search = ''
  url.hash = `${SHARE_PARAM}=${await encodeShare(m)}` + (comparedWith ? `&${BASE_PARAM}=${await encodeShare(comparedWith)}` : '')
  return url.toString()
}

/** A story travels as `#s=<data>`: the story file (model inside, short ids) as compact JSON, packed like a model. */
export const STORY_PARAM = 's'
/** The address a shared file always points at. */
export const LIVE_ORIGIN = 'https://model.quaera.app'
/** Above this many characters of URL some browsers cut the link. */
export const SOFT_URL_LIMIT = 1_500_000
export const SHARE_EXTENSION = '.model.html'

/** The story as a URL-safe string; `model` is the one told when the story carries none. Stories name elements, so ids may be shortened. */
export async function encodeStoryShare(story: Story, model: Model): Promise<string> {
  const text = serializeStory({ ...story, model: withShortIds(story.model ?? model) })
  return packText(JSON.stringify(JSON.parse(text)))
}

/** The story back from {@link encodeStoryShare}; a damaged link throws a readable error. */
export async function decodeStoryShare(data: string): Promise<Story> {
  let text: string
  try {
    text = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')))
  } catch {
    throw new Error('The link is damaged or incomplete (it may have been cut when it was copied).')
  }
  return parseStory(text)
}

/** The story data in a URL fragment, or null when the fragment holds none. */
export function storyDataFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get(STORY_PARAM) || null
}

/** The full link to a story on `origin`. */
export async function storyShareUrl(story: Story, model: Model, origin = LIVE_ORIGIN): Promise<string> {
  return `${origin.replace(/\/+$/, '')}/#${STORY_PARAM}=${await encodeStoryShare(story, model)}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The tiny page that carries the link: redirects by script, shows a big link as the fallback. Nothing external. */
export function shareHtml(title: string, url: string, what: 'model' | 'story' = 'model'): string {
  const t = esc(title.trim() || 'Shared from Quaera Model')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#1f2430}
h1{font-size:1.4rem;margin:0 0 .5rem}
a.go{display:block;margin:1.5rem 0;padding:1rem 1.25rem;background:#2563eb;color:#fff;border-radius:10px;text-align:center;font-size:1.25rem;font-weight:600;text-decoration:none}
p{color:#4a5160}
</style>
</head>
<body>
<h1>${t}</h1>
<p>Opening in Quaera Model…</p>
<a class="go" id="go" href="${esc(url)}">Open in Quaera Model</a>
<p>This file holds ${what === 'story' ? 'a story' : 'a data model'} from Quaera Model (CDM → PDM → SQL, part of Quaera). The whole content is inside the link after the # sign, which stays in your browser and is never sent to a server. If nothing opens, press the button.</p>
<script>location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script>
</body>
</html>
`
}

/** StrataLab, the SQL workbench of the Quaera family (DuckDB in the browser). */
export const LAB_URL = 'https://lab.quaera.app/'
/** StrataLab's fragment key for CREATE TABLE statements to run on open (its SPEC §5). */
export const DDL_PARAM = 'ddl'

/**
 * A link that opens the tables in StrataLab: `#ddl=<packed DDL>`, packed like the share links.
 * StrataLab's src/core/ddlLink.ts decodes it and must stay in step with {@link packText}.
 */
export async function labUrl(ddl: string, base: string = LAB_URL): Promise<string> {
  const url = new URL(base)
  url.hash = `${DDL_PARAM}=${await packText(ddl)}`
  return url.toString()
}

/**
 * The way back (StrataLab stage 2c): StrataLab's “Show as model” sends CREATE TABLE statements
 * in `#sql=<packed>&name=<label>`, packed like {@link packText}; they open as a new model
 * (SQL → model, #32). StrataLab's src/core/modelLink.ts writes them and must stay in step.
 */
export const SQL_PARAM = 'sql'
export const NAME_PARAM = 'name'
/** A script that inflates past this many bytes is refused (a crafted link could inflate without end). */
export const MAX_SQL_BYTES = 5_000_000

/** Text back from {@link packText}, inflated chunk by chunk up to `limit` bytes. */
export async function unpackText(data: string, limit = MAX_SQL_BYTES): Promise<string> {
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = new Blob([fromBase64Url(data) as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  } catch {
    throw new Error('The link is damaged or incomplete (it may have been cut when it was copied).')
  }
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) {
        await reader.cancel()
        throw new RangeError()
      }
      parts.push(value)
    }
    const all = new Uint8Array(size)
    let at = 0
    for (const p of parts) all.set(p, (at += p.length) - p.length)
    return new TextDecoder('utf-8', { fatal: true }).decode(all)
  } catch (e) {
    if (e instanceof RangeError) throw new Error('The tables in the link are too many to open.')
    throw new Error('The link is damaged or incomplete (it may have been cut when it was copied).')
  }
}

/** `#sql=…&name=…` in a URL fragment, or null when the fragment holds none. */
export function sqlLinkFromHash(hash: string): { data: string; name: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const data = p.get(SQL_PARAM)
  return data ? { data, name: (p.get(NAME_PARAM) || '').trim().slice(0, 80) || 'From Quaera Lab' } : null
}
