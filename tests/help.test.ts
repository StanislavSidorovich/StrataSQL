// Help cards (SPEC §8): enough cards, valid links, and mini-models that are themselves good models.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { lintModel, RULES } from '../src/core/lint'
import { integrityProblems } from '../src/core/serialize'
import { HELP_CARDS, helpCard, searchHelp } from '../src/data/help'

describe('help cards', () => {
  it('has at least 15 cards with mini-diagrams and unique ids', () => {
    expect(HELP_CARDS.filter((c) => c.miniModel).length).toBeGreaterThanOrEqual(15)
    expect(new Set(HELP_CARDS.map((c) => c.id)).size).toBe(HELP_CARDS.length)
  })

  it('links only to existing cards', () => {
    for (const c of HELP_CARDS) for (const s of c.seeAlso) expect(helpCard(s), `${c.id} → ${s}`).toBeDefined()
    for (const [rule, r] of Object.entries(RULES)) expect(helpCard(r.help), `${rule} → ${r.help}`).toBeDefined()
  })

  it.each(HELP_CARDS.filter((c) => c.miniModel).map((c) => [c.id, c] as const))(
    '%s: mini-model is consistent, lint-clean and generates SQL',
    (_, card) => {
      const m = card.miniModel!()
      expect(integrityProblems(m)).toEqual([])
      expect(lintModel(m).map((i) => i.message)).toEqual([])
      const pdm = generatePdm(m)
      expect(pdm.notes.filter((n) => n.level === 'warning').map((n) => n.message)).toEqual([])
      expect(pdm.tables.every((t) => t.primaryKey)).toBe(true)
      expect(generateSqlServer(pdm)).toContain('CREATE TABLE')
    },
  )

  it('the cycle card shares show_id in EPISODE', () => {
    const pdm = generatePdm(helpCard('circular-relationship')!.miniModel!())
    const ep = pdm.tables.find((t) => t.name === 'EPISODE')!
    expect(ep.columns.filter((c) => c.name === 'show_id')).toHaveLength(1)
    expect(ep.foreignKeys.filter((f) => f.columns.includes('show_id'))).toHaveLength(2)
  })

  it('searches titles, one-liners and signals', () => {
    expect(searchHelp('').length).toBe(HELP_CARDS.length)
    expect(searchHelp('weak').map((c) => c.id)).toContain('dependent-entity')
    expect(searchHelp('origin').map((c) => c.id)).toContain('multiple-relationships')
  })
})
