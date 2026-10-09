// Case files (`*.strata-case.json`): a built-in case written to a file opens again as the same
// walkthrough, and a broken file fails with a readable message.

import { describe, expect, it } from 'vitest'
import { ModelFormatError } from '../src/core/serialize'
import { addFileCase, caseById, CASES } from '../src/data/cases'
import { CASE_FORMAT, FILE_CASE_PREFIX, isCaseFile, parseCaseFile } from '../src/data/caseFile'
import { walkthroughSteps } from '../src/data/walkthrough'

const library = CASES.find((c) => c.id === 'library')!
const { build, ...data } = library
// Built once: every build() makes new ids.
const ref = build()
const file = (patch: (o: Record<string, any>) => void = () => {}) => {
  const o: Record<string, any> = { format: CASE_FORMAT, version: 1, case: structuredClone(data), model: ref }
  patch(o)
  return JSON.stringify(o)
}

describe('case files', () => {
  it('tells a case file from a model file', () => {
    expect(isCaseFile(file())).toBe(true)
    expect(isCaseFile(JSON.stringify(ref))).toBe(false)
    expect(isCaseFile('not json')).toBe(false)
  })

  it('opens as the same walkthrough under a file: id, found by caseById once added', () => {
    const c = parseCaseFile(file())
    expect(c.id).toBe(FILE_CASE_PREFIX + 'library')
    expect(c.build()).toEqual(ref)
    expect(c.build()).not.toBe(c.build())
    const steps = walkthroughSteps(c)
    expect(steps.map((s) => s.key)).toEqual(walkthroughSteps(library).map((s) => s.key))
    expect(steps.at(-1)!.model).toEqual(ref)
    expect(caseById(c.id)).toBeUndefined()
    addFileCase(c)
    expect(caseById(c.id)).toBe(c)
    expect(CASES).not.toContain(c)
  })

  it('fails with a readable message', () => {
    const bad = (patch: (o: Record<string, any>) => void, msg: RegExp) => {
      expect(() => parseCaseFile(file(patch))).toThrow(ModelFormatError)
      expect(() => parseCaseFile(file(patch))).toThrow(msg)
    }
    bad((o) => (o.version = 2), /version 2/)
    bad((o) => (o.case.spans[0].phrase = 'unicorns'), /“unicorns” not found in paragraph 0/)
    bad((o) => (o.case.spans[0].tag = 'thing'), /unknown tag “thing”/)
    bad((o) => (o.case.walk.order = ['Book', 'Dragon']), /“Dragon” is not in the reference model/)
    bad((o) => delete o.case.title, /case.title is missing/)
    bad((o) => (o.model.entities[0].id = o.model.entities[1].id), /duplicate id/)
  })
})
