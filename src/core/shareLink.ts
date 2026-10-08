// Share by link: the whole model travels in the URL fragment (`#m=…`), compressed. Nothing is
// uploaded: the fragment never reaches the server, and opening the link gives the reader a copy.

import type { Model } from './metamodel'
import { parseModel, serializeModel } from './serialize'

/** The fragment key: `https://model.quaera.app/#m=<data>`. */
export const SHARE_PARAM = 'm'

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

/** The model as a URL-safe string (short ids, compact JSON, deflate, base64url). */
export async function encodeShare(m: Model): Promise<string> {
  const json = JSON.stringify(withShortIds(m))
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))
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
export async function shareUrl(m: Model, base: string): Promise<string> {
  const url = new URL(base)
  url.search = ''
  url.hash = `${SHARE_PARAM}=${await encodeShare(m)}`
  return url.toString()
}
