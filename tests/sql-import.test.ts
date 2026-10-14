import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generatePostgres } from '../src/core/ddl/postgres'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { changesSchema, readSqlScript, sqlTypeOf } from '../src/core/import/sql-reader'
import { applySqlScript, entityNameFromTable } from '../src/core/import/sql-reverse'
import { lintModel } from '../src/core/lint'
import { emptyModel, type Model } from '../src/core/metamodel'
import { addAttribute, addEntity, findEntityByName } from '../src/core/ops'
import { CASES } from '../src/data/cases'
import { buildHotel } from '../src/data/examples/hotel'

const fromSql = (sql: string, base: Model = emptyModel('From SQL')) => {
  const report = applySqlScript(base, readSqlScript(sql))
  return { m: base, report }
}
const entity = (m: Model, name: string) => {
  const e = findEntityByName(m, name)
  if (!e) throw new Error(`no entity ${name}: ${m.entities.map((x) => x.name).join(', ')}`)
  return e
}
const attrs = (m: Model, name: string) => entity(m, name).attributes.map((a) => a.name)
const relBetween = (m: Model, a: string, b: string) => m.relationships.filter((r) => r.entityA === entity(m, a).id && r.entityB === entity(m, b).id)
/** The script without comments (table comments come back, column comments are not in SQL). */
const code = (sql: string) => sql.split('\n').filter((l) => !l.startsWith('--')).join('\n')

describe('SQL types → conceptual types', () => {
  it('reads both dialects', () => {
    expect(sqlTypeOf('int').sqlType).toEqual({ dataType: 'Integer' })
    expect(sqlTypeOf('INTEGER').sqlType).toEqual({ dataType: 'Integer' })
    expect(sqlTypeOf('serial').sqlType).toEqual({ dataType: 'Integer' })
    expect(sqlTypeOf('decimal(8,2)').sqlType).toEqual({ dataType: 'Decimal', length: 8, precision: 2 })
    expect(sqlTypeOf('numeric(10)').sqlType).toEqual({ dataType: 'Decimal', length: 10, precision: 0 })
    expect(sqlTypeOf('double precision').sqlType).toEqual({ dataType: 'Float' })
    expect(sqlTypeOf('nvarchar(40)').sqlType).toEqual({ dataType: 'Variable characters', length: 40 })
    expect(sqlTypeOf('character varying(20)').sqlType).toEqual({ dataType: 'Variable characters', length: 20 })
    expect(sqlTypeOf('varchar(max)').sqlType).toEqual({ dataType: 'Text' })
    expect(sqlTypeOf('bit').sqlType).toEqual({ dataType: 'Boolean' })
    expect(sqlTypeOf('datetime2').sqlType).toEqual({ dataType: 'Date & time' })
    expect(sqlTypeOf('timestamp with time zone').sqlType).toEqual({ dataType: 'Date & time' })
    expect(sqlTypeOf('bytea').sqlType).toEqual({ dataType: 'Binary' })
    expect(sqlTypeOf('geometry').known).toBe(false)
  })

  it('names entities from table names', () => {
    expect(entityNameFromTable('BOOKED_ROOM')).toBe('Booked Room')
    expect(entityNameFromTable('order_line')).toBe('Order Line')
    expect(entityNameFromTable('TVShow')).toBe('TVShow')
    expect(entityNameFromTable('GUEST')).toBe('Guest')
  })
})

describe('reading a script', () => {
  it('SQL Server syntax: GO, brackets, named constraints, ALTER TABLE', () => {
    const s = readSqlScript(`
-- Table [ORDER]
-- One purchase.
CREATE TABLE [dbo].[ORDER] (
   [order_id]  int IDENTITY(1,1) NOT NULL,
   placed_on   datetime          NOT NULL DEFAULT (getdate()),
   note        varchar(max)      NULL,
   CONSTRAINT PK_ORDER PRIMARY KEY CLUSTERED (order_id ASC)
)
GO
ALTER TABLE [ORDER] ADD customer_id int NOT NULL, channel char(3) NULL
GO
CREATE INDEX IX_ORDER ON [ORDER] (placed_on)
GO`)
    expect(s.tables).toHaveLength(1)
    const t = s.tables[0]
    expect(t.name).toBe('ORDER')
    expect(t.comment).toBe('One purchase.')
    expect(t.columns.map((c) => [c.name, c.sqlType.dataType, c.nullable])).toEqual([
      ['order_id', 'Integer', false],
      ['placed_on', 'Date & time', false],
      ['note', 'Text', true],
      ['customer_id', 'Integer', false],
      ['channel', 'Characters', true],
    ])
    expect(t.primaryKey).toEqual({ name: 'PK_ORDER', columns: ['order_id'] })
    expect(s.warnings).toEqual([])
  })

  it('PostgreSQL syntax: inline keys, quotes, ADD COLUMN, skipped statements', () => {
    const s = readSqlScript(`
create table "user" (id serial primary key, email text not null unique, boss_id int references "user"(id));
alter table "user" add column born date, add constraint ck check (born > '1900-01-01');
alter table team add constraint fk_x foreign key (owner_id) references "user";
insert into "user" (email) values ('a;b');
create view v as select 1;`)
    const t = s.tables[0]
    expect(t.name).toBe('user')
    expect(t.primaryKey?.columns).toEqual(['id'])
    expect(t.uniques).toEqual([{ name: undefined, columns: ['email'] }])
    expect(t.foreignKeys).toEqual([{ name: undefined, columns: ['boss_id'], refTable: 'user', refColumns: ['id'] }])
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'email', 'boss_id', 'born'])
    expect(t.checks).toBe(1)
    expect(s.alters).toEqual([expect.objectContaining({ name: 'team', foreignKeys: [{ name: 'fk_x', columns: ['owner_id'], refTable: 'user', refColumns: [] }] })])
    expect(s.warnings).toEqual(['1 CREATE VIEW statement skipped: only CREATE TABLE and ALTER TABLE … ADD describe the model.'])
  })

  it('knows which scripts change the schema', () => {
    expect(changesSchema('CREATE TABLE x (a int)')).toBe(true)
    expect(changesSchema('alter table x add b int')).toBe(true)
    expect(changesSchema('SELECT * FROM x; -- CREATE TABLE y')).toBe(false)
    expect(changesSchema("INSERT INTO x VALUES ('CREATE TABLE')")).toBe(false)
    expect(changesSchema('ALTER TABLE x DROP COLUMN b')).toBe(false)
    expect(changesSchema('DROP TABLE x')).toBe(false)
  })
})

describe('round trip: model → SQL → model gives the same SQL', () => {
  for (const c of CASES)
    for (const [dialect, gen] of [
      ['SQL Server', generateSqlServer],
      ['PostgreSQL', generatePostgres],
    ] as const)
      it(`${c.build().name} (${dialect})`, () => {
        const sql = gen(generatePdm(c.build()))
        const { m } = fromSql(sql)
        expect(code(gen(generatePdm(m)))).toBe(code(sql))
      })

  it('a subtype table is read as a dependent one-to-one, with a word about inheritance', () => {
    const { report } = fromSql(generateSqlServer(generatePdm(CASES.find((c) => c.build().name === 'Hospital')!.build())))
    expect(report.warnings.some((w) => /Doctor: its key is its foreign key to Staff Member.*inheritance/.test(w))).toBe(true)
  })
})

describe('a hand-written script', () => {
  const { m, report } = fromSql(`
CREATE TABLE customer (
  customer_id serial PRIMARY KEY,
  email varchar(100) NOT NULL UNIQUE,
  name varchar(80) NOT NULL
);
CREATE TABLE orders (
  order_id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customer(customer_id),
  placed_on date NOT NULL DEFAULT current_date
);
CREATE TABLE product (product_id int primary key, title text);
CREATE TABLE order_line (
  order_id int REFERENCES orders,
  product_id int REFERENCES product(product_id),
  qty smallint NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE employee (employee_id int PRIMARY KEY, manager_employee_id int REFERENCES employee(employee_id));
CREATE TABLE passport (customer_id int PRIMARY KEY REFERENCES customer, number varchar(20) NOT NULL);
CREATE TABLE note (note_id int PRIMARY KEY, author_id int REFERENCES writer(writer_id));`)

  it('tables become entities, FK columns do not become attributes', () => {
    expect(m.entities.map((e) => e.name)).toEqual(['Customer', 'Orders', 'Product', 'Order Line', 'Employee', 'Passport', 'Note'])
    expect(attrs(m, 'Customer')).toEqual(['customer_id', 'email', 'name'])
    expect(attrs(m, 'Orders')).toEqual(['order_id', 'placed_on'])
    expect(attrs(m, 'Order Line')).toEqual(['qty'])
  })

  it('keys become identifiers', () => {
    const c = entity(m, 'Customer')
    const name = (id: string) => c.attributes.find((a) => a.id === id)!.name
    expect(c.identifiers.map((i) => [i.isPrimary, i.attributeIds.map(name)])).toEqual([
      [true, ['customer_id']],
      [false, ['email']],
    ])
  })

  it('FKs become relationships with cardinalities and dependency', () => {
    const [placed] = relBetween(m, 'Customer', 'Orders')
    expect([placed.cardinalityA, placed.cardinalityB, placed.dependentSide]).toEqual([{ min: 1, max: 1 }, { min: 0, max: 'n' }, null])
    for (const parent of ['Orders', 'Product']) expect(relBetween(m, parent, 'Order Line')[0].dependentSide).toBe('B')
    const [boss] = relBetween(m, 'Employee', 'Employee')
    expect([boss.cardinalityA, boss.roleA]).toEqual([{ min: 0, max: 1 }, 'manager'])
    const [pass] = relBetween(m, 'Customer', 'Passport')
    expect([pass.cardinalityB, pass.dependentSide, pass.foreignKeySide]).toEqual([{ min: 0, max: 1 }, 'B', 'B'])
  })

  it('generates the same tables back', () => {
    const t = generatePdm(m).tables
    const orderLine = t.find((x) => x.name === 'order_line')!
    expect(orderLine.primaryKey?.columns).toEqual(['order_id', 'product_id'])
    expect(t.find((x) => x.name === 'employee')!.columns.map((c) => c.name)).toEqual(['employee_id', 'manager_employee_id'])
    expect(t.find((x) => x.name === 'orders')!.foreignKeys.map((f) => [f.columns, f.refTable, f.mandatory])).toEqual([[['customer_id'], 'customer', true]])
  })

  it('reports what it could not express, and the model passes the check', () => {
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'note (author_id) → writer: table writer is neither in the script nor in the model, so this foreign key stays plain columns.',
        'order_line: 1 CHECK constraint(s) skipped — the conceptual model has no place for them.',
        expect.stringMatching(/^Passport: its key is its foreign key to Customer/),
        'SQL cannot say whether every Customer must have at least one Orders: the minimum at that end of each relationship is set to 0. Check them against the text.',
      ]),
    )
    expect(attrs(m, 'Note')).toEqual(['note_id', 'author_id'])
    expect(report.counts).toEqual({ entities: 7, attributes: 12, relationships: 5, identifiers: 1 })
    expect(lintModel(m).filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('adding to an existing model (the Sandbox console)', () => {
  it('new columns, a new table linked to an existing one, a skipped duplicate', () => {
    const m = buildHotel()
    const before = m.entities.length
    const { report } = fromSql(
      `ALTER TABLE GUEST ADD email varchar(100) NOT NULL;
       CREATE TABLE REVIEW (review_id int NOT NULL, booking_id int NOT NULL, stars smallint NULL,
         CONSTRAINT PK_REVIEW PRIMARY KEY (review_id),
         CONSTRAINT FK_REVIEW_ABOUT_BOOKING FOREIGN KEY (booking_id) REFERENCES BOOKING (booking_id));
       CREATE TABLE GUEST (guest_no int);`,
      m,
    )
    expect(m.entities).toHaveLength(before + 1)
    expect(entity(m, 'Guest').attributes.find((a) => a.name === 'email')).toMatchObject({ dataType: 'Variable characters', length: 100, mandatory: true })
    expect(attrs(m, 'Review')).toEqual(['review_id', 'stars'])
    const [about] = relBetween(m, 'Booking', 'Review')
    expect(about.name).toBe('about')
    expect(report.warnings).toContain('Table GUEST is already in the model; its CREATE TABLE was skipped. Add columns with ALTER TABLE GUEST ADD …')
    const review = generatePdm(m).tables.find((t) => t.name === 'REVIEW')!
    expect(review.foreignKeys.map((f) => f.name)).toEqual(['FK_REVIEW_ABOUT_BOOKING'])
  })

  it('an attribute that is really a foreign key becomes a relationship', () => {
    const m = emptyModel()
    const room = addEntity(m, { name: 'Room' })
    addAttribute(m, room.id, { name: 'room_no', dataType: 'Integer', primary: true })
    const booking = addEntity(m, { name: 'Booking' })
    addAttribute(m, booking.id, { name: 'booking_id', dataType: 'Integer', primary: true })
    addAttribute(m, booking.id, { name: 'room_no', dataType: 'Integer', mandatory: true })
    const { report } = fromSql('ALTER TABLE BOOKING ADD CONSTRAINT FK_BOOKING_FOR_ROOM FOREIGN KEY (room_no) REFERENCES ROOM (room_no)', m)
    expect(attrs(m, 'Booking')).toEqual(['booking_id'])
    const [rel] = relBetween(m, 'Room', 'Booking')
    expect([rel.name, rel.cardinalityA]).toEqual(['for', { min: 1, max: 1 }])
    expect(report.changes[0]).toMatch(/Booking.room_no removed: the relationship to Room brings room_no/)
    expect(generatePdm(m).tables.find((t) => t.name === 'BOOKING')!.columns.map((c) => [c.name, c.nullable])).toEqual([
      ['booking_id', false],
      ['room_no', false],
    ])
  })

  it('the generated script of the model itself adds nothing', () => {
    const m = buildHotel()
    const sql = generateSqlServer(generatePdm(m))
    const alters = sql.slice(sql.indexOf('ALTER TABLE'))
    for (const script of [sql, alters]) {
      const { report } = fromSql(script, m)
      expect(report.changes).toEqual([])
      expect(m.relationships).toHaveLength(buildHotel().relationships.length)
    }
  })
})
