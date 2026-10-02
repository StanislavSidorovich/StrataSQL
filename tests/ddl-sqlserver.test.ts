import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer, quoteIdent, sqlServerType } from '../src/core/ddl/sqlserver'
import { CARD, emptyModel } from '../src/core/metamodel'
import { addAttribute, addEntity, addIdentifier, addRelationship } from '../src/core/ops'
import { buildTvShows } from '../src/data/examples/tv-shows'

describe('SQL Server types', () => {
  it('map conceptual types like PowerDesigner does', () => {
    expect(sqlServerType({ dataType: 'Integer' })).toBe('int')
    expect(sqlServerType({ dataType: 'Short integer' })).toBe('smallint')
    expect(sqlServerType({ dataType: 'Long integer' })).toBe('bigint')
    expect(sqlServerType({ dataType: 'Decimal', length: 10, precision: 2 })).toBe('decimal(10,2)')
    expect(sqlServerType({ dataType: 'Decimal' })).toBe('decimal(18,2)')
    expect(sqlServerType({ dataType: 'Money' })).toBe('money')
    expect(sqlServerType({ dataType: 'Boolean' })).toBe('bit')
    expect(sqlServerType({ dataType: 'Characters', length: 2 })).toBe('char(2)')
    expect(sqlServerType({ dataType: 'Variable characters', length: 100 })).toBe('varchar(100)')
    expect(sqlServerType({ dataType: 'Variable characters' })).toBe('varchar(max)')
    expect(sqlServerType({ dataType: 'Text' })).toBe('varchar(max)')
    expect(sqlServerType({ dataType: 'Date' })).toBe('date')
    expect(sqlServerType({ dataType: 'Time' })).toBe('time')
    expect(sqlServerType({ dataType: 'Date & time' })).toBe('datetime')
    expect(sqlServerType({ dataType: 'Binary', length: 16 })).toBe('varbinary(16)')
  })
})

describe('identifiers', () => {
  it('are bracketed only when reserved or unusual', () => {
    expect(quoteIdent('TRIP')).toBe('TRIP')
    expect(quoteIdent('ORDER')).toBe('[ORDER]')
    expect(quoteIdent('user')).toBe('[user]')
    expect(quoteIdent('first name')).toBe('[first name]')
    expect(quoteIdent('a]b')).toBe('[a]]b]')
  })
})

describe('DDL script', () => {
  function shop() {
    const m = emptyModel('Shop')
    const customer = addEntity(m, { name: 'Customer' })
    addAttribute(m, customer.id, { name: 'customer_id', dataType: 'Integer', primary: true })
    const email = addAttribute(m, customer.id, { name: 'email', length: 100, mandatory: true })
    addIdentifier(m, customer.id, { name: 'email', isPrimary: false, attributeIds: [email.id] })
    const order = addEntity(m, { name: 'Order' })
    addAttribute(m, order.id, { name: 'order_id', dataType: 'Integer', primary: true })
    addAttribute(m, order.id, { name: 'total', dataType: 'Decimal', length: 10, precision: 2 })
    addRelationship(m, customer.id, order.id, { name: 'places', cardinalityB: CARD.zeroMany })
    return generatePdm(m)
  }

  it('creates tables with PK and UNIQUE, then adds FKs with ALTER TABLE', () => {
    const sql = generateSqlServer(shop())
    expect(sql).toContain(
      [
        'CREATE TABLE CUSTOMER (',
        '   customer_id          int              NOT NULL,',
        '   email                varchar(100)     NOT NULL,',
        '   CONSTRAINT PK_CUSTOMER PRIMARY KEY (customer_id),',
        '   CONSTRAINT AK_EMAIL_CUSTOMER UNIQUE (email)',
        ')',
        'GO',
      ].join('\n'),
    )
    expect(sql).toContain('CREATE TABLE [ORDER] (')
    expect(sql).toContain('   total                decimal(10,2)    NULL,')
    expect(sql).toContain(
      'ALTER TABLE [ORDER]\n   ADD CONSTRAINT FK_ORDER_PLACES_CUSTOMER FOREIGN KEY (customer_id)\n      REFERENCES CUSTOMER (customer_id)\nGO',
    )
    // All tables exist before the first FK.
    expect(sql.lastIndexOf('CREATE TABLE')).toBeLessThan(sql.indexOf('ALTER TABLE'))
    expect(sql).not.toContain('DROP')
  })

  it('can drop the previous version first (FKs, then tables)', () => {
    const sql = generateSqlServer(shop(), { drop: true })
    expect(sql).toContain("IF OBJECT_ID('FK_ORDER_PLACES_CUSTOMER', 'F') IS NOT NULL\n   ALTER TABLE [ORDER] DROP CONSTRAINT FK_ORDER_PLACES_CUSTOMER\nGO")
    expect(sql).toContain('DROP TABLE IF EXISTS CUSTOMER\nGO')
    expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(sql.indexOf('DROP TABLE'))
    expect(sql.indexOf('DROP TABLE')).toBeLessThan(sql.indexOf('CREATE TABLE'))
  })

  it('writes CHECK constraints and table comments', () => {
    const m = buildTvShows()
    const sql = generateSqlServer(generatePdm(m))
    expect(sql).toContain('-- Table ROLE\n-- Actor × Scene, no own id: just one role per actor in each scene.\nCREATE TABLE ROLE (')
    expect(sql).toContain('CONSTRAINT PK_ROLE PRIMARY KEY (person_id, episode_id, order_no)')
    expect(sql.match(/^ALTER TABLE/gm)).toHaveLength(14)
  })

  it('is deterministic (no timestamps), so it can be diffed and tested', () => {
    expect(generateSqlServer(shop())).toBe(generateSqlServer(shop()))
  })
})
