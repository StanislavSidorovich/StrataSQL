// Reads the table definitions of a SQL script: CREATE TABLE and ALTER TABLE … ADD, in SQL Server
// (GO, [brackets]) or PostgreSQL (;, "quotes") syntax — the scripts StrataSQL and PowerDesigner
// generate, and what a student types. Everything else (DROP, INSERT, CREATE INDEX…) is skipped.
// The first half of SQL → CDM; `sql-reverse.ts` turns the tables into entities and relationships.

import type { DataType } from '../metamodel'

export interface SqlType {
  dataType: DataType
  length?: number
  precision?: number
}

export interface SqlColumn {
  name: string
  /** The type as written: `varchar(50)`, `double precision`. */
  type: string
  sqlType: SqlType
  /** False when the type is not one we know (it is read as Variable characters). */
  knownType: boolean
  nullable: boolean
}

export interface SqlKey {
  name?: string
  columns: string[]
}

export interface SqlForeignKey extends SqlKey {
  refTable: string
  /** Empty when the script leaves them out (`REFERENCES ROOM`): the referenced table's PK. */
  refColumns: string[]
}

export interface SqlTable {
  name: string
  comment?: string
  columns: SqlColumn[]
  primaryKey: SqlKey | null
  uniques: SqlKey[]
  foreignKeys: SqlForeignKey[]
  checks: number
}

export interface SqlScript {
  /** Tables created by the script (ALTER TABLEs on them are merged in). */
  tables: SqlTable[]
  /** Additions to tables the script does not create (they may exist in the model). */
  alters: SqlTable[]
  /** Statements that were skipped or could not be read, in plain words. */
  warnings: string[]
}

// ---------------------------------------------------------------- types

/** SQL type → conceptual type (both dialects, plus common synonyms). */
export function sqlTypeOf(type: string): { sqlType: SqlType; known: boolean } {
  const t = type.toLowerCase().replace(/\s+/g, ' ').trim()
  const m = /^([a-z_][a-z0-9_ ]*?)\s*(?:\(\s*(max|\d+)\s*(?:,\s*(\d+)\s*)?\))?(?:\s+(?:with|without) time zone)?(?:\s*\[\])?$/.exec(t)
  if (!m) return { sqlType: { dataType: 'Variable characters', length: 50 }, known: false }
  const base = m[1].trim()
  const max = m[2] === 'max'
  const n1 = m[2] && !max ? Number(m[2]) : undefined
  const n2 = m[3] !== undefined ? Number(m[3]) : undefined
  const known = (sqlType: SqlType) => ({ sqlType, known: true })
  switch (base) {
    case 'int':
    case 'integer':
    case 'int4':
    case 'serial':
    case 'serial4':
    case 'mediumint':
      return known({ dataType: 'Integer' })
    case 'smallint':
    case 'tinyint':
    case 'int2':
    case 'smallserial':
      return known({ dataType: 'Short integer' })
    case 'bigint':
    case 'int8':
    case 'bigserial':
    case 'serial8':
      return known({ dataType: 'Long integer' })
    case 'decimal':
    case 'numeric':
    case 'dec':
    case 'number':
      return known({ dataType: 'Decimal', length: n1, precision: n1 !== undefined ? (n2 ?? 0) : undefined })
    case 'float':
    case 'real':
    case 'double':
    case 'double precision':
    case 'float4':
    case 'float8':
      return known({ dataType: 'Float' })
    case 'money':
    case 'smallmoney':
      return known({ dataType: 'Money' })
    case 'bit':
    case 'boolean':
    case 'bool':
      return known({ dataType: 'Boolean' })
    case 'char':
    case 'nchar':
    case 'character':
    case 'bpchar':
      return known({ dataType: 'Characters', length: n1 ?? 1 })
    case 'varchar':
    case 'nvarchar':
    case 'character varying':
    case 'varchar2':
    case 'nvarchar2':
      return known(max || n1 === undefined ? { dataType: 'Text' } : { dataType: 'Variable characters', length: n1 })
    case 'text':
    case 'ntext':
    case 'clob':
    case 'longtext':
    case 'mediumtext':
    case 'citext':
      return known({ dataType: 'Text' })
    case 'date':
      return known({ dataType: 'Date' })
    case 'time':
      return known({ dataType: 'Time' })
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
    case 'datetimeoffset':
    case 'timestamp':
    case 'timestamptz':
      return known({ dataType: 'Date & time' })
    case 'binary':
    case 'varbinary':
    case 'bytea':
    case 'image':
    case 'blob':
    case 'longblob':
      return known(n1 !== undefined ? { dataType: 'Binary', length: n1 } : { dataType: 'Binary' })
    case 'uniqueidentifier':
    case 'uuid':
      return known({ dataType: 'Characters', length: 36 })
  }
  return { sqlType: { dataType: 'Variable characters', length: 50 }, known: false }
}

// ---------------------------------------------------------------- tokens

interface Token {
  kind: 'word' | 'quoted' | 'number' | 'string' | 'punct'
  text: string
  line: number
}

/** Splits the script into tokens; a line with only `GO` becomes a `;`. Comments are kept by line. */
function tokenize(src: string): { tokens: Token[]; comments: Map<number, string> } {
  const tokens: Token[] = []
  const comments = new Map<number, string>()
  let i = 0
  let line = 1
  let lineStart = true
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') {
      line++
      i++
      lineStart = true
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (lineStart && /^go\b/i.test(src.slice(i, i + 3))) {
      const end = src.indexOf('\n', i)
      const rest = src.slice(i + 2, end < 0 ? src.length : end)
      if (/^\s*(\d+\s*)?;?\s*(--.*)?$/.test(rest)) {
        tokens.push({ kind: 'punct', text: ';', line })
        i = end < 0 ? src.length : end
        continue
      }
    }
    lineStart = false
    if (c === '-' && src[i + 1] === '-') {
      const end = src.indexOf('\n', i)
      comments.set(line, src.slice(i + 2, end < 0 ? src.length : end).trim())
      i = end < 0 ? src.length : end
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const body = src.slice(i, end < 0 ? src.length : end + 2)
      line += body.split('\n').length - 1
      i += body.length
      continue
    }
    if (c === "'") {
      let j = i + 1
      while (j < src.length && !(src[j] === "'" && src[j + 1] !== "'")) j += src[j] === "'" ? 2 : 1
      const text = src.slice(i, j + 1)
      tokens.push({ kind: 'string', text, line })
      line += text.split('\n').length - 1
      i = j + 1
      continue
    }
    if (c === '"' || c === '[' || c === '`') {
      const close = c === '[' ? ']' : c
      let j = i + 1
      let text = ''
      while (j < src.length) {
        if (src[j] === close) {
          if (src[j + 1] === close) {
            text += close
            j += 2
            continue
          }
          break
        }
        text += src[j++]
      }
      tokens.push({ kind: 'quoted', text, line })
      i = j + 1
      continue
    }
    const word = /^[\p{L}_#@$][\p{L}\p{N}_#@$]*/u.exec(src.slice(i, i + 200))
    if (word) {
      tokens.push({ kind: 'word', text: word[0], line })
      i += word[0].length
      continue
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i, i + 50))
    if (num) {
      tokens.push({ kind: 'number', text: num[0], line })
      i += num[0].length
      continue
    }
    tokens.push({ kind: 'punct', text: c, line })
    i++
  }
  return { tokens, comments }
}

function splitStatements(tokens: Token[]): Token[][] {
  const out: Token[][] = []
  let cur: Token[] = []
  for (const t of tokens) {
    if (t.kind === 'punct' && t.text === ';') {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push(t)
  }
  if (cur.length) out.push(cur)
  return out
}

// ---------------------------------------------------------------- parser

const COLUMN_MODIFIERS = new Set([
  'NOT',
  'NULL',
  'PRIMARY',
  'UNIQUE',
  'REFERENCES',
  'DEFAULT',
  'CONSTRAINT',
  'CHECK',
  'IDENTITY',
  'GENERATED',
  'COLLATE',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'ROWGUIDCOL',
  'SPARSE',
  'FILESTREAM',
  'ON',
])

/** Statements that never describe tables; skipped without a word. */
const QUIET = new Set(['DROP', 'IF', 'USE', 'SET', 'BEGIN', 'COMMIT', 'END', 'PRINT', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'TRUNCATE'])

class Cursor {
  i = 0
  constructor(readonly toks: Token[]) {}
  peek(k = 0): Token | undefined {
    return this.toks[this.i + k]
  }
  is(word: string, k = 0): boolean {
    const t = this.peek(k)
    return !!t && t.kind === 'word' && t.text.toUpperCase() === word
  }
  isPunct(p: string, k = 0): boolean {
    const t = this.peek(k)
    return !!t && t.kind === 'punct' && t.text === p
  }
  next(): Token | undefined {
    return this.toks[this.i++]
  }
  accept(...words: string[]): boolean {
    if (!words.every((w, k) => this.is(w, k))) return false
    this.i += words.length
    return true
  }
  done(): boolean {
    return this.i >= this.toks.length
  }
  /** An identifier, `schema.name` or `db.schema.name`: the last part. */
  name(): string | null {
    const t = this.peek()
    if (!t || (t.kind !== 'word' && t.kind !== 'quoted')) return null
    this.i++
    let name = t.text
    while (this.isPunct('.') && (this.peek(1)?.kind === 'word' || this.peek(1)?.kind === 'quoted')) {
      this.i++
      name = this.next()!.text
    }
    return name
  }
  /** `( a, b )` → names; null when there is no list here. */
  nameList(): string[] | null {
    if (!this.isPunct('(')) return null
    this.i++
    const out: string[] = []
    while (!this.done() && !this.isPunct(')')) {
      const n = this.name()
      if (n) out.push(n)
      else this.i++
      // ASC / DESC after a key column
      if (this.is('ASC') || this.is('DESC')) this.i++
      if (this.isPunct(',')) this.i++
    }
    this.i++
    return out
  }
  /** Skips a balanced `( … )` group if one starts here. */
  skipGroup(): void {
    if (!this.isPunct('(')) return
    let depth = 0
    do {
      const t = this.next()
      if (t?.kind === 'punct' && t.text === '(') depth++
      if (t?.kind === 'punct' && t.text === ')') depth--
    } while (depth > 0 && !this.done())
  }
}

/** Splits `( item, item, … )` at top-level commas. */
function splitItems(c: Cursor): Token[][] {
  const items: Token[][] = []
  if (!c.isPunct('(')) return items
  c.next()
  let depth = 0
  let cur: Token[] = []
  while (!c.done()) {
    const t = c.next()!
    if (t.kind === 'punct' && t.text === '(') depth++
    if (t.kind === 'punct' && t.text === ')') {
      if (depth === 0) break
      depth--
    }
    if (depth === 0 && t.kind === 'punct' && t.text === ',') {
      items.push(cur)
      cur = []
      continue
    }
    cur.push(t)
  }
  if (cur.length) items.push(cur)
  return items
}

function emptyTable(name: string): SqlTable {
  return { name, columns: [], primaryKey: null, uniques: [], foreignKeys: [], checks: 0 }
}

/** A table constraint (`[CONSTRAINT n] PRIMARY KEY (…)` …); false when the item is not one. */
function readConstraint(c: Cursor, t: SqlTable): boolean {
  const start = c.i
  let name: string | undefined
  if (c.accept('CONSTRAINT')) name = c.name() ?? undefined
  if (c.accept('PRIMARY', 'KEY')) {
    c.accept('CLUSTERED') || c.accept('NONCLUSTERED')
    t.primaryKey = { name, columns: c.nameList() ?? [] }
    return true
  }
  if (c.accept('UNIQUE')) {
    c.accept('KEY') || c.accept('INDEX')
    c.accept('CLUSTERED') || c.accept('NONCLUSTERED')
    t.uniques.push({ name, columns: c.nameList() ?? [] })
    return true
  }
  if (c.accept('FOREIGN', 'KEY')) {
    const columns = c.nameList() ?? []
    if (c.accept('REFERENCES')) {
      const refTable = c.name()
      if (refTable) t.foreignKeys.push({ name, columns, refTable, refColumns: c.nameList() ?? [] })
    }
    return true
  }
  if (c.accept('CHECK')) {
    t.checks++
    return true
  }
  if (!name && (c.is('INDEX') || c.is('KEY'))) return true // MySQL inline index: not a constraint
  c.i = start
  return false
}

/** `name type [modifiers]`. */
function readColumn(c: Cursor, t: SqlTable, warnings: string[]): void {
  const name = c.name()
  if (!name) return
  const typeParts: string[] = []
  while (!c.done()) {
    const tok = c.peek()!
    if (tok.kind === 'word' && COLUMN_MODIFIERS.has(tok.text.toUpperCase())) break
    if (tok.kind === 'punct' && tok.text === '(') {
      const from = c.i
      c.skipGroup()
      typeParts[typeParts.length - 1] += c.toks.slice(from, c.i).map((x) => x.text).join('')
      continue
    }
    if (tok.kind === 'punct' && tok.text === '[') {
      c.i++
      continue
    }
    typeParts.push(tok.text)
    c.i++
  }
  const type = typeParts.join(' ')
  const { sqlType, known } = sqlTypeOf(type || 'varchar')
  if (!type) warnings.push(`${t.name}.${name} has no type; read as Variable characters.`)
  const col: SqlColumn = { name, type, sqlType, knownType: known || !type, nullable: true }
  let constraintName: string | undefined
  while (!c.done()) {
    if (c.accept('NOT', 'NULL')) col.nullable = false
    else if (c.accept('NULL')) col.nullable = true
    else if (c.accept('CONSTRAINT')) {
      constraintName = c.name() ?? undefined
      continue
    } else if (c.accept('PRIMARY', 'KEY')) {
      c.accept('CLUSTERED') || c.accept('NONCLUSTERED')
      col.nullable = false
      if (t.primaryKey) t.primaryKey.columns.push(name)
      else t.primaryKey = { name: constraintName, columns: [name] }
    } else if (c.accept('UNIQUE')) {
      c.accept('CLUSTERED') || c.accept('NONCLUSTERED')
      t.uniques.push({ name: constraintName, columns: [name] })
    } else if (c.accept('REFERENCES')) {
      const refTable = c.name()
      if (refTable) t.foreignKeys.push({ name: constraintName, columns: [name], refTable, refColumns: c.nameList() ?? [] })
      // ON DELETE / ON UPDATE … are skipped below
    } else if (c.accept('CHECK')) {
      c.skipGroup()
      t.checks++
    } else if (c.peek()?.kind === 'punct' && c.peek()!.text === '(') c.skipGroup()
    else c.i++ // DEFAULT x, IDENTITY(1,1), COLLATE x, ON DELETE CASCADE …
    constraintName = undefined
  }
  t.columns.push(col)
}

function readTableItems(items: Token[][], t: SqlTable, warnings: string[]): void {
  for (const item of items) {
    if (!item.length) continue
    const c = new Cursor(item)
    if (!readConstraint(c, t)) readColumn(new Cursor(item), t, warnings)
  }
}

/** The comment lines right above a statement (our `-- Table X` header line left out). */
function commentAbove(line: number, comments: Map<number, string>): string | undefined {
  const lines: string[] = []
  for (let l = line - 1; comments.has(l); l--) lines.unshift(comments.get(l)!)
  const text = lines.filter((l) => !/^Table\s+\S+$/i.test(l)).join('\n').trim()
  return text || undefined
}

function mergeInto(target: SqlTable, add: SqlTable): void {
  target.columns.push(...add.columns.filter((c) => !target.columns.some((x) => x.name.toLowerCase() === c.name.toLowerCase())))
  if (add.primaryKey) target.primaryKey = add.primaryKey
  target.uniques.push(...add.uniques)
  target.foreignKeys.push(...add.foreignKeys)
  target.checks += add.checks
}

export function readSqlScript(src: string): SqlScript {
  const { tokens, comments } = tokenize(src.replace(/^﻿/, ''))
  const tables: SqlTable[] = []
  const alters: SqlTable[] = []
  const warnings: string[] = []
  const skipped = new Map<string, number>()
  const find = (list: SqlTable[], name: string) => list.find((t) => t.name.toLowerCase() === name.toLowerCase())

  for (const stmt of splitStatements(tokens)) {
    const c = new Cursor(stmt)
    const first = stmt[0].text.toUpperCase()
    if (c.accept('CREATE')) {
      c.accept('GLOBAL') || c.accept('LOCAL')
      c.accept('TEMPORARY') || c.accept('TEMP') || c.accept('UNLOGGED')
      if (c.accept('TABLE')) {
        c.accept('IF', 'NOT', 'EXISTS')
        const name = c.name()
        if (!name) {
          warnings.push(`A CREATE TABLE on line ${stmt[0].line} has no table name; skipped.`)
          continue
        }
        if (c.is('AS')) {
          warnings.push(`CREATE TABLE ${name} AS SELECT … copies a query, it does not define columns; skipped.`)
          continue
        }
        const t = emptyTable(name)
        t.comment = commentAbove(stmt[0].line, comments)
        const items = splitItems(c)
        if (!items.length) {
          warnings.push(`CREATE TABLE ${name} has no column list; skipped.`)
          continue
        }
        readTableItems(items, t, warnings)
        const dup = find(tables, name)
        if (dup) {
          warnings.push(`Table ${name} is created twice; the second CREATE TABLE was skipped.`)
          continue
        }
        // An ALTER written before the CREATE stays an ALTER: it may be meant for the model's own
        // table of that name (and the CREATE then skipped as a duplicate).
        tables.push(t)
        continue
      }
      const what = c.peek()?.text.toUpperCase() ?? ''
      if (!['INDEX', 'UNIQUE', 'CLUSTERED', 'NONCLUSTERED', 'SCHEMA', 'DATABASE', 'SEQUENCE', 'EXTENSION'].includes(what))
        skipped.set(`CREATE ${what}`, (skipped.get(`CREATE ${what}`) ?? 0) + 1)
      continue
    }
    if (c.accept('ALTER', 'TABLE')) {
      c.accept('ONLY')
      c.accept('IF', 'EXISTS')
      const name = c.name()
      if (!name) continue
      if (!c.is('ADD')) {
        if (!c.is('DROP') && !c.is('NOCHECK') && !c.is('CHECK')) skipped.set(`ALTER TABLE … ${c.peek()?.text.toUpperCase() ?? ''}`, (skipped.get(`ALTER TABLE … ${c.peek()?.text.toUpperCase() ?? ''}`) ?? 0) + 1)
        continue
      }
      const add = emptyTable(name)
      // ADD a, b  (SQL Server)  ·  ADD a, ADD b  (PostgreSQL)  ·  ADD COLUMN a
      const items: Token[][] = []
      let cur: Token[] = []
      let depth = 0
      for (const tok of stmt.slice(c.i + 1)) {
        if (tok.kind === 'punct' && tok.text === '(') depth++
        if (tok.kind === 'punct' && tok.text === ')') depth--
        if (depth === 0 && tok.kind === 'punct' && tok.text === ',') {
          items.push(cur)
          cur = []
          continue
        }
        cur.push(tok)
      }
      items.push(cur)
      for (let item of items) {
        if (item[0]?.kind === 'word' && item[0].text.toUpperCase() === 'ADD') item = item.slice(1)
        if (item[0]?.kind === 'word' && item[0].text.toUpperCase() === 'COLUMN') item = item.slice(1)
        if (item[0]?.kind === 'word' && item[0].text.toUpperCase() === 'IF') item = item.slice(3) // IF NOT EXISTS
        readTableItems([item], add, warnings)
      }
      const into = find(tables, name) ?? find(alters, name)
      if (into) mergeInto(into, add)
      else alters.push(add)
      continue
    }
    if (!QUIET.has(first) && first !== 'EXEC' && first !== 'EXECUTE' && first !== 'GRANT' && first !== 'COMMENT')
      skipped.set(first, (skipped.get(first) ?? 0) + 1)
  }
  for (const [what, n] of skipped) warnings.push(`${n} ${what} statement${n > 1 ? 's' : ''} skipped: only CREATE TABLE and ALTER TABLE … ADD describe the model.`)
  return { tables, alters, warnings }
}

/** True when the script defines or changes tables (the Sandbox then offers to add it to the model). */
export function changesSchema(src: string): boolean {
  const { tokens } = tokenize(src)
  return splitStatements(tokens).some((s) => {
    const c = new Cursor(s)
    if (c.accept('CREATE')) {
      c.accept('GLOBAL') || c.accept('LOCAL')
      c.accept('TEMPORARY') || c.accept('TEMP') || c.accept('UNLOGGED')
      return c.is('TABLE')
    }
    if (!c.accept('ALTER', 'TABLE')) return false
    c.accept('ONLY')
    c.accept('IF', 'EXISTS')
    c.name()
    return c.is('ADD')
  })
}
