// Case files (`*.strata-case.json`): a trainer case kept outside the app — its text, the phrases that
// map to the model, the walkthrough plan and the reference model in one JSON file. File → Open of such
// a file starts its walkthrough. Meant for tasks that must not ship with the public app (a graded
// project shared only inside a group), and for teachers who write their own cases.

import { MODEL_FORMAT } from '../core/metamodel'
import { ModelFormatError, parseModel } from '../core/serialize'
import { splitParagraph, TAGS, type TagSpan, type TrainerCase, type WalkPlan } from './cases'
import { walkthroughSteps } from './walkthrough'

export const CASE_FORMAT = 'strata-case'
export const CASE_VERSION = 1
export const CASE_EXTENSION = '.strata-case.json'
/** File cases get this id prefix, so they never replace a built-in case. */
export const FILE_CASE_PREFIX = 'file:'

/** True when the text is a case file (not a model file). */
export function isCaseFile(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown }).format === CASE_FORMAT
  } catch {
    return false
  }
}

const fail = (msg: string): never => {
  throw new ModelFormatError(msg)
}
const strings = (v: unknown, where: string): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : fail(`${where} must be a list of strings`)

/** Reads and checks a case file: every phrase is found in its paragraph and the walkthrough builds. */
export function parseCaseFile(text: string): TrainerCase {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch (e) {
    return fail(`Not valid JSON: ${(e as Error).message}`)
  }
  if (raw.format !== CASE_FORMAT) fail(`Not a StrataSQL case (format = ${String(raw.format)})`)
  if (raw.version !== CASE_VERSION) fail(`Unsupported case version ${String(raw.version)}`)
  const model = parseModel({ format: MODEL_FORMAT, ...(raw.model as object) })
  const o = (raw.case ?? fail('case is missing')) as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) fail('case.id is missing')
  if (typeof o.title !== 'string' || !o.title) fail('case.title is missing')
  const tags = TAGS.map((t) => t.id as string)
  const spans = (Array.isArray(o.spans) ? o.spans : fail('case.spans must be a list')) as TagSpan[]
  spans.forEach((s, i) => {
    if (typeof s.p !== 'number' || typeof s.phrase !== 'string' || typeof s.why !== 'string') fail(`case.spans[${i}] needs p, phrase and why`)
    if (!tags.includes(s.tag)) fail(`case.spans[${i}]: unknown tag “${String(s.tag)}”`)
  })
  const walk = (o.walk ?? fail('case.walk is missing')) as WalkPlan
  strings(walk.order, 'case.walk.order')
  const c: TrainerCase = {
    id: FILE_CASE_PREFIX + o.id,
    title: o.title as string,
    source: typeof o.source === 'string' ? o.source : 'Case file',
    difficulty: o.difficulty === 1 || o.difficulty === 2 || o.difficulty === 3 ? o.difficulty : 2,
    concepts: o.concepts === undefined ? [] : strings(o.concepts, 'case.concepts'),
    build: () => structuredClone(model),
    spec: strings(o.spec, 'case.spec'),
    spans,
    lessons: o.lessons === undefined ? [] : strings(o.lessons, 'case.lessons'),
    synonyms: (o.synonyms as Record<string, string[]>) ?? {},
    hints: (o.hints as Record<string, string[]>) ?? {},
    walk,
  }
  // The same checks the built-in cases pass in their tests, as readable errors.
  c.spec.forEach((_, p) => {
    try {
      splitParagraph(c, p)
    } catch (e) {
      fail((e as Error).message)
    }
  })
  const bad = spans.find((s) => s.p < 0 || s.p >= c.spec.length)
  if (bad) fail(`phrase “${bad.phrase}” points at paragraph ${bad.p}, the text has ${c.spec.length}`)
  try {
    walkthroughSteps(c, model)
  } catch (e) {
    fail((e as Error).message)
  }
  return c
}
