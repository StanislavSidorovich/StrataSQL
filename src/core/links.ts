// Links inside free text (comments): full URLs and bare web addresses such as "quaera.app".
// The panels show such a comment with clickable links until the user clicks it to edit.

export type TextPart = { text: string } | { text: string; url: string }

// A full URL, or a bare domain with a common top-level domain (optionally followed by a path).
const LINK =
  /\bhttps?:\/\/[^\s<>"]+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:app|com|org|net|io|dev|edu|pt|eu|ru|uk|de|fr)\b(?:\/[^\s<>"]*)?/gi

// Sentence punctuation right after a link belongs to the sentence, not to the address.
const TRAILING = /[.,;:!?)\]'"]+$/

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    const link = m[0].replace(TRAILING, '')
    const start = m.index
    if (start > at) parts.push({ text: text.slice(at, start) })
    parts.push({ text: link, url: /^https?:\/\//i.test(link) ? link : `https://${link}` })
    at = start + link.length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

export function hasLinks(text: string | undefined): boolean {
  return !!text && splitLinks(text).some((p) => 'url' in p)
}
