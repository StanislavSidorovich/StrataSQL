import { beforeAll, describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generatePostgres, pgIdent, postgresType } from '../src/core/ddl/postgres'
import { createPgliteEngine } from '../src/core/engine-pglite'
import { findTable } from '../src/core/pdm'
import { deleteStatement, insertStatement, resetDatabase, run, sqlLiteral, type SqlEngine } from '../src/core/sandbox'
import { buildTimetables } from '../src/data/examples/timetables'
import { buildTvShows } from '../src/data/examples/tv-shows'
import { CASES } from '../src/data/cases'
import { SCENARIOS, scenariosFor } from '../src/data/scenarios'

// Every trainer case (course and own ones) must run in the Sandbox.
const EXAMPLES = CASES.map((c) => c.build)

let engine: SqlEngine
beforeAll(async () => {
  engine = await createPgliteEngine()
}, 60_000)

describe('PostgreSQL dialect', () => {
  it('maps conceptual types', () => {
    expect(postgresType({ dataType: 'Integer' })).toBe('integer')
    expect(postgresType({ dataType: 'Decimal', length: 9, precision: 6 })).toBe('numeric(9,6)')
    expect(postgresType({ dataType: 'Money' })).toBe('numeric(19,4)')
    expect(postgresType({ dataType: 'Boolean' })).toBe('boolean')
    expect(postgresType({ dataType: 'Variable characters', length: 20 })).toBe('varchar(20)')
    expect(postgresType({ dataType: 'Variable characters' })).toBe('text')
    expect(postgresType({ dataType: 'Date & time' })).toBe('timestamp')
    expect(postgresType({ dataType: 'Binary' })).toBe('bytea')
  })

  it('quotes only reserved or unusual identifiers, in lower case', () => {
    expect(pgIdent('EPISODE')).toBe('EPISODE')
    expect(pgIdent('ORDER')).toBe('"order"')
    expect(pgIdent('user')).toBe('"user"')
    expect(pgIdent('first name')).toBe('"first name"')
    expect(pgIdent('ROLE')).toBe('ROLE') // not reserved in Postgres
  })

  it.each(EXAMPLES.map((b) => [b().name, b] as const))('%s schema runs in PGlite', async (_, build) => {
    const pdm = generatePdm(build())
    await resetDatabase(engine, pdm)
    const [res] = await engine.run(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`)
    expect(Number(res.rows[0][0])).toBe(pdm.tables.length)
    expect(generatePostgres(pdm)).not.toMatch(/\bGO\b|\[/)
  })
})

describe('statements from the grid', () => {
  const pdm = generatePdm(buildTvShows())
  const tvshow = findTable(pdm, 'TVSHOW')!

  it('quote values and leave empty cells out', () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
    expect(sqlLiteral('  ')).toBe('NULL')
    expect(insertStatement(tvshow, { show_id: '1', title: 'Dark', genre: '' })).toBe("INSERT INTO TVSHOW (show_id, title)\nVALUES ('1', 'Dark');")
    expect(deleteStatement(tvshow, { show_id: '1', title: 'Dark' })).toBe("DELETE FROM TVSHOW WHERE show_id = '1';")
  })

  it('run, and a failing batch leaves nothing behind', async () => {
    await resetDatabase(engine, pdm)
    expect((await run(engine, pdm, insertStatement(tvshow, { show_id: '1', title: 'Dark' }))).ok).toBe(true)
    const out = await run(engine, pdm, "INSERT INTO TVSHOW (show_id, title) VALUES (2, 'Lost'); INSERT INTO TVSHOW (show_id, title) VALUES (1, 'Again');")
    expect(out.ok).toBe(false)
    const [res] = await engine.run('SELECT count(*) FROM tvshow')
    expect(res.rows[0][0]).toBe('1')
  })
})

describe('violations are explained and traced back to the CDM', () => {
  const model = buildTvShows()
  const pdm = generatePdm(model)
  const setup = `INSERT INTO TVSHOW (show_id, title) VALUES (1, 'Dark');
INSERT INTO PERSON (person_id, name) VALUES (10, 'Baran');
INSERT INTO DIRECTOR (person_id) VALUES (10);
INSERT INTO SHOWDIRECTOR (show_id, person_id) VALUES (1, 10);
INSERT INTO EPISODE (episode_id, title, show_id, person_id) VALUES (100, 'Secrets', 1, 10);`

  async function fail(sql: string) {
    await resetDatabase(engine, pdm)
    await engine.run(setup)
    const out = await run(engine, pdm, sql)
    if (out.ok) throw new Error(`expected a violation: ${sql}`)
    return out.violation
  }

  it('primary key → the entity', async () => {
    const v = await fail("INSERT INTO TVSHOW (show_id, title) VALUES (1, 'Again')")
    expect(v).toMatchObject({ kind: 'primaryKey', rejectedBy: 'PK_TVSHOW', table: 'TVSHOW', columns: ['show_id'] })
    expect(v.source?.kind).toBe('entity')
    expect(v.engineMessage).toContain('already exists')
  })

  it('primary key with migrated columns names the parent', async () => {
    const v = await fail('INSERT INTO SCENE VALUES (100, 1), (100, 1)')
    expect(v.rejectedBy).toBe('PK_SCENE')
    expect(v.explanation).toContain('came from EPISODE')
  })

  it('foreign key → relationship', async () => {
    const v = await fail('INSERT INTO SCENE VALUES (999, 1)')
    const rel = model.relationships.find((r) => r.name === 'has_scenes')!
    expect(v).toMatchObject({ kind: 'foreignKey', rejectedBy: 'FK_SCENE_HAS_SCENES_EPISODE', source: { kind: 'relationship' } })
    expect((v.source as { id: string }).id.split(':')[0]).toBe(rel.id)
    expect(v.explanation).toContain('cannot exist without its EPISODE')
  })

  it('foreign key on delete of a referenced row', async () => {
    const v = await fail('INSERT INTO SCENE VALUES (100, 1); DELETE FROM EPISODE WHERE episode_id = 100;')
    expect(v).toMatchObject({ kind: 'foreignKey', rejectedBy: 'FK_SCENE_HAS_SCENES_EPISODE' })
    expect(v.explanation).toContain('still reference')
  })

  it('foreign key of an inheritance child → inheritance', async () => {
    const v = await fail('INSERT INTO ACTOR VALUES (77)')
    expect(v).toMatchObject({ kind: 'foreignKey', source: { kind: 'inheritance' } })
  })

  it('NOT NULL of a mandatory reference', async () => {
    const v = await fail("INSERT INTO EPISODE (episode_id, title, show_id) VALUES (101, 'x', 1)")
    expect(v).toMatchObject({ kind: 'notNull', rejectedBy: 'NOT NULL EPISODE.person_id', columns: ['person_id'] })
    expect(v.explanation).toContain('minimum cardinality 1')
  })

  it('NOT NULL of a mandatory attribute', async () => {
    const v = await fail('INSERT INTO TVSHOW (show_id) VALUES (5)')
    expect(v).toMatchObject({ kind: 'notNull', rejectedBy: 'NOT NULL TVSHOW.title', source: { kind: 'attribute' } })
  })

  it('wrong type and too long values', async () => {
    expect((await fail("INSERT INTO TVSHOW (show_id, title) VALUES ('abc', 'x')")).kind).toBe('type')
    expect((await fail(`INSERT INTO TVSHOW (show_id, title) VALUES (5, '${'x'.repeat(101)}')`)).explanation).toContain('too long')
  })

  it('alternate key', async () => {
    const tt = generatePdm(buildTimetables())
    await resetDatabase(engine, tt)
    const out = await run(engine, tt, "INSERT INTO PROGRAM VALUES (1, 'IMS', 'A'), (2, 'IMS', 'B')")
    expect(!out.ok && out.violation).toMatchObject({ kind: 'alternateKey', rejectedBy: 'AK_CODE_PROGRAM', columns: ['code'] })
  })
})

describe('scenarios (acceptance: conflicting rows are rejected by the expected constraint)', () => {
  it('cover every trainer case', () => {
    for (const b of EXAMPLES) expect(scenariosFor(b().name).length).toBeGreaterThan(0)
  })

  for (const s of SCENARIOS) {
    it(`${s.model}: ${s.title}`, async () => {
      const build = EXAMPLES.find((b) => b().name === s.model)!
      const pdm = generatePdm(build())
      await resetDatabase(engine, pdm)
      for (const step of s.steps) {
        const out = await run(engine, pdm, step.sql)
        const got = out.ok ? 'ok' : { rejectedBy: out.violation.rejectedBy }
        expect(got, `${step.title}${out.ok ? '' : `\n${out.violation.engineMessage}`}`).toEqual(step.expect)
      }
    })
  }
})
