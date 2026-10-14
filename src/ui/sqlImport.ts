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

/** File → Open of a .sql script: a new model from its tables. */
export function modelFromSqlFile(text: string, fileName: string): { model: Model; notice: string } {
  const script = readSqlScript(text)
  if (!script.tables.length) throw new Error('there is no CREATE TABLE in it')
  const model = emptyModel(fileName.replace(/\.sql$/i, '') || 'From SQL')
  model.comment = `Built from the SQL script ${fileName}: tables became entities, foreign keys became relationships.`
  const report = applySqlScript(model, script)
  const notice =
    `Built the conceptual model from ${fileName}: ${sqlReportSummary(report)}. Check the cardinalities against your text.` +
    (report.warnings.length ? `\n${report.warnings.join('\n')}` : '')
  return { model, notice }
}
