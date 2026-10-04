// “My task”: the student's own task text (pasted or loaded from .txt / .md). It works like an open
// exercise — no reference, no score — plus a check that needs no reference: the student tags phrases of
// the text, and the pane lists tagged phrases with nothing in the model yet, and model elements no
// tagged phrase mentions.

import type { Model } from '../core/metamodel'
import type { Exercise } from './exercises'
import { singular, STOP } from './suggest'

export const MY_TASK_ID = 'my-task'

export type MarkTag = 'entity' | 'attribute' | 'identifier' | 'relationship' | 'inheritance' | 'rule'

export const MARK_TAGS: { id: MarkTag; label: string; key: string }[] = [
  { id: 'entity', label: 'Entity', key: '1' },
  { id: 'attribute', label: 'Attribute', key: '2' },
  { id: 'identifier', label: 'Identifier', key: '3' },
  { id: 'relationship', label: 'Relationship', key: '4' },
  { id: 'inheritance', label: 'Inheritance', key: '5' },
  { id: 'rule', label: 'Rule', key: '6' },
]

/** A tagged phrase: paragraph, character range in it, the text (to re-find it after an edit). */
export interface Mark {
  p: number
  start: number
  end: number
  tag: MarkTag
  text: string
}

export interface MyTask {
  title: string
  text: string
  marks: Mark[]
}

/** Paragraphs of the text: blank lines (or single line breaks) separate them; Markdown headings and bullets lose their marks. */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/\*\*|__/g, '')
        .trim(),
    )
    .filter(Boolean)
}

/** The self-review questions for any text. */
export const MY_TASK_CHECKLIST = [
  'Is every noun the text keeps data about an entity — and every one-fact noun an attribute, not an entity?',
  'Does every entity have a primary identifier the text supports (or its own id)? Are “unique” things alternate identifiers?',
  'For every link: how many on each side, and can it be empty (0) or must it exist (1)?',
  'Does a many-to-many with data of its own (a date, a quantity) become an intermediate entity?',
  'Which attributes may stay empty? Are the others ticked M?',
  'Open the Physical view: is every foreign key where you expect it? Try a wrong row in the Sandbox.',
]

export function myTaskExercise(t: MyTask): Exercise {
  return { id: MY_TASK_ID, title: t.title || 'My task', difficulty: 1, concepts: ['your own text'], spec: paragraphs(t.text), checklist: MY_TASK_CHECKLIST }
}

/** Adds a mark; marks it overlaps are replaced. */
export function addMark(marks: Mark[], m: Mark): Mark[] {
  return [...marks.filter((x) => x.p !== m.p || x.end <= m.start || x.start >= m.end), m].sort((a, b) => a.p - b.p || a.start - b.start)
}

/** After the text changed: keep marks whose text is still there (same place, else the first match in any paragraph). */
export function remapMarks(marks: Mark[], text: string): Mark[] {
  const ps = paragraphs(text)
  const out: Mark[] = []
  for (const m of marks) {
    if (ps[m.p]?.slice(m.start, m.end) === m.text) {
      out.push(m)
      continue
    }
    const p = ps.findIndex((t) => t.includes(m.text))
    if (p >= 0) {
      const start = ps[p].indexOf(m.text)
      out.push({ ...m, p, start, end: start + m.text.length })
    }
  }
  return out.reduce<Mark[]>((acc, m) => addMark(acc, m), [])
}

/** Words of a name or phrase, singular, without filler words: “the loan dates” → loan, date; `Birth_year` → birth, year. */
export function nameWords(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(singular)
}

/** A phrase names a model element when their words are the same, or all words of one are in the other (“number” ~ Card_number). */
export function sameName(phrase: string, name: string): boolean {
  const a = nameWords(phrase)
  const b = nameWords(name)
  if (a.length === 0 || b.length === 0) return false
  if (a.join('_') === b.join('_')) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 1 && short.every((w) => long.includes(w)) && (short.length > 1 || long.length <= 2)
}

export interface Coverage {
  /** Tagged phrases with nothing of that kind in the model. */
  missing: { mark: Mark; why: string }[]
  /** Entities and attributes no tagged phrase names. */
  unmentioned: { kind: 'entity' | 'attribute'; name: string; entity?: string }[]
  /** Rules: checked by hand (keys, CHECKs, the Sandbox). */
  rules: Mark[]
}

export function coverage(marks: Mark[], model: Model): Coverage {
  const entities = model.entities.map((e) => e.name)
  const attrs = model.entities.flatMap((e) => e.attributes.map((a) => ({ name: a.name, entity: e.name, inId: e.identifiers.some((i) => i.attributeIds.includes(a.id)) })))
  const rels = model.relationships.map((r) => r.name)
  const missing: Coverage['missing'] = []
  for (const m of marks) {
    const t = m.text
    if (m.tag === 'entity' && !entities.some((n) => sameName(t, n))) missing.push({ mark: m, why: 'no entity with this name yet' })
    if (m.tag === 'attribute' && !attrs.some((a) => sameName(t, a.name))) missing.push({ mark: m, why: 'no attribute with this name yet' })
    if (m.tag === 'identifier') {
      const a = attrs.filter((x) => sameName(t, x.name))
      if (a.length === 0) missing.push({ mark: m, why: 'no attribute with this name yet' })
      else if (!a.some((x) => x.inId)) missing.push({ mark: m, why: `${a[0].entity}.${a[0].name} is not in an identifier yet` })
    }
    // A link phrase may become a relationship or an intermediate entity (borrow → Loan); names are free, so only a soft note.
    if (m.tag === 'relationship' && model.relationships.length === 0) missing.push({ mark: m, why: 'no relationships in the model yet' })
    if (m.tag === 'relationship' && model.relationships.length > 0 && !rels.some((n) => sameName(t, n)) && !entities.some((n) => sameName(t, n)))
      missing.push({ mark: m, why: 'no relationship or entity named like it — fine if it is drawn under another name' })
    if (m.tag === 'inheritance' && model.inheritances.length === 0) missing.push({ mark: m, why: 'no inheritance in the model yet' })
  }
  const named = (kinds: MarkTag[], name: string) => marks.some((m) => kinds.includes(m.tag) && sameName(m.text, name))
  const unmentioned: Coverage['unmentioned'] = marks.length === 0 ? [] : [
    ...entities.filter((n) => !named(['entity', 'relationship', 'inheritance'], n)).map((name) => ({ kind: 'entity' as const, name })),
    ...attrs.filter((a) => !named(['attribute', 'identifier'], a.name)).map((a) => ({ kind: 'attribute' as const, name: a.name, entity: a.entity })),
  ]
  return { missing, unmentioned, rules: marks.filter((m) => m.tag === 'rule') }
}
