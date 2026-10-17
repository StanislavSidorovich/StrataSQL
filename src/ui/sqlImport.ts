// SQL → model in the UI: File → Open of a .sql script, and the summary lines both entry points show.

import { readSqlScript } from '../core/import/sql-reader'
import { applySqlScript, type SqlApplyReport } from '../core/import/sql-reverse'
import { emptyModel, type Model } from '../core/metamodel'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`

/** `2 entities, 7 attributes, 1 relationship` (only what is there). */
export function sqlReportSummary(r: SqlApplyReport): string {
  const parts = [
    r.counts.entities && plural(r.counts.entities, 'entity'),
    r.counts.attributes && plural(r.counts.attributes, 'attribute'),
    r.counts.relationships && plural(r.counts.relationships, 'relationship'),
    r.counts.identifiers && `${r.counts.identifiers} key${r.counts.identifiers === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return parts.join(', ') || 'nothing new'
}

/** A new model from a script's tables; `source` says where the script came from, in the notice and comment. */
export function modelFromSql(text: string, name: string, source: string): { model: Model; notice: string } {
  const script = readSqlScript(text)
  if (!script.tables.length) throw new Error('there is no CREATE TABLE in it')
  const model = emptyModel(name || 'From SQL')
  model.comment = `Built from ${source}: tables became entities, foreign keys became relationships.`
  const report = applySqlScript(model, script)
  const notice =
    `Built the conceptual model from ${source}: ${sqlReportSummary(report)}. Check the cardinalities against your text.` +
    (report.warnings.length ? `\n${report.warnings.join('\n')}` : '')
  return { model, notice }
}

/** File → Open of a .sql script: a new model from its tables. */
export function modelFromSqlFile(text: string, fileName: string): { model: Model; notice: string } {
  return modelFromSql(text, fileName.replace(/\.sql$/i, ''), `the SQL script ${fileName}`)
}

/** “Show as model” in StrataLab (`#sql=…&name=…`): the tables of a dataset or the student's own. */
export function modelFromStrataLab(text: string, name: string): { model: Model; notice: string } {
  return modelFromSql(text, name, `the tables of “${name}” in StrataLab`)
}
