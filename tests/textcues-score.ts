// Scores text cues against a case's hand-tagged spans (used by tests/textcues.test.ts).
import type { TagSpan, TrainerCase } from '../src/data/cases'
import type { Cue } from '../src/data/textcues'

/** Gold tags a cue tag counts for: an identifier cue matches an attribute or rule span, and so on. */
const MATCH: Record<Cue['tag'], TagSpan['tag'][]> = {
  entity: ['entity'],
  attribute: ['attribute'],
  identifier: ['attribute', 'rule'],
  relationship: ['relationship'],
  inheritance: ['inheritance'],
  rule: ['rule'],
}

export function goldRanges(c: TrainerCase) {
  const at = new Map<number, number>()
  return c.spans.map((s) => {
    const k = c.spec[s.p].indexOf(s.phrase, at.get(s.p) ?? 0)
    at.set(s.p, k + s.phrase.length)
    return { ...s, start: k, end: k + s.phrase.length }
  })
}

export function scoreCues(c: TrainerCase, cues: Cue[]) {
  const gold = goldRanges(c)
  const ok = (q: Cue, g: (typeof gold)[number]) => [g.tag, ...(g.accept ?? [])].some((t) => MATCH[q.tag].includes(t))
  const cueOk = new Map<Cue, boolean>()
  const cueWrong = new Map<Cue, string>()
  const goldFound = new Set<number>()
  for (const q of cues) {
    const over = gold.map((g, i) => ({ g, i })).filter(({ g }) => g.p === q.p && g.start < q.end && g.end > q.start)
    const good = over.filter(({ g }) => ok(q, g))
    if (good.length) {
      cueOk.set(q, true)
      good.forEach(({ i }) => goldFound.add(i))
    } else if (over.length && !(q.tag === 'entity' && over.every(({ g }) => g.tag !== 'entity' && !g.accept?.includes('entity') && g.phrase.length > q.text.length + 3)))
      // An entity named inside a longer relationship or rule phrase is one of its ends, not a wrong tag.
      cueWrong.set(q, over.map(({ g }) => g.tag).join('/'))
  }
  const hit = cueOk.size
  return {
    hit,
    found: goldFound.size,
    /** Cues that overlap a gold span of a matching tag, out of the cues that overlap gold spans of matching or other tags. */
    precision: hit + cueWrong.size ? hit / (hit + cueWrong.size) : 0,
    /** Cues that agree with the hand tagging, out of all cues (unmatched ones may still be right: the hand tagging names each thing once). */
    strict: cues.length ? hit / cues.length : 0,
    /** Gold spans found by some cue of a matching tag. */
    recall: gold.length ? goldFound.size / gold.length : 0,
    /** Cues that overlap gold spans of other tags only. */
    wrong: cueWrong.size,
    cueOk,
    cueWrong,
    missed: gold.filter((_, i) => !goldFound.has(i)),
  }
}
