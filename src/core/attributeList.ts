// Attributes from pasted text: a list copied from a requirements document or a chat ("Status (Requested,
// Scheduled), Priority, RequestedTimeSlot" or one per bullet) becomes one attribute each. Pure, no React.
import type { DataType, Id, Model } from './metamodel'
import { addAttribute, type NewAttribute } from './ops'

const BULLET = /^\s*(?:[-*•○◦▪●·‣–]|\d+[.)])\s+/
const MAX_NAME = 60

/** The attribute names in a pasted text: split on commas, semicolons, new lines and bullets; the values in brackets are dropped. */
export function parseAttributeNames(text: string): string[] {
  const names: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(BULLET, '')
    // Values in brackets (Status (Requested, Scheduled)) are not attributes; so is an unclosed bracket to the end of the line.
    while (/\([^()]*\)/.test(line)) line = line.replace(/\([^()]*\)/g, '')
    line = line.replace(/\(.*$/, '').replace(/\)/g, '')
    line = line.replace(/\s[—–-]\s.*$/, '') // an explanation after a dash
    for (const part of line.split(/[,;]|\s\/\s|\s[•○◦▪●·]\s/)) {
      const name = part
        .replace(/[`"“”«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.:]+$/, '')
        .replace(BULLET, '')
        .trim()
      if (!name || name.length > MAX_NAME || /:$/.test(part.trim())) continue // empty, a sentence, or a heading ("Invoices:")
      names.push(name)
    }
  }
  const seen = new Set<string>()
  return names.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()))
}

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** A data type guessed from the words of a name; nothing when the name says nothing (the usual default applies). */
export function guessAttributeType(name: string): Pick<NewAttribute, 'dataType' | 'length' | 'precision'> {
  const w = words(name)
  const last = w.at(-1) ?? ''
  const has = (...x: string[]) => w.some((v) => x.includes(v))
  const t = (dataType: DataType, extra: { length?: number; precision?: number } = {}) => ({ dataType, ...extra })
  if (has('is', 'has') && w[0] !== last) return t('Boolean')
  if (has('flag', 'active', 'paid')) return t('Boolean')
  if (last === 'at' || has('timestamp', 'datetime')) return t('Date & time')
  if (last === 'time') return w.length > 1 ? t('Date & time') : t('Time')
  if (has('date', 'dob', 'birthday')) return t('Date')
  if (has('amount', 'price', 'total', 'cost', 'fee', 'salary', 'balance', 'rate')) return t('Decimal', { length: 10, precision: 2 })
  if (has('quantity', 'qty', 'count', 'age', 'year', 'duration')) return t('Integer')
  if (last === 'id') return t('Integer')
  if (has('description', 'notes', 'note', 'comment', 'comments', 'remarks', 'recommendations')) return t('Text')
  return {}
}

/** Adds one attribute per name (types guessed). Returns the new attributes' ids. */
export function addAttributesFromNames(m: Model, entityId: Id, names: string[]): Id[] {
  return names.map((name) => addAttribute(m, entityId, { name, ...guessAttributeType(name) }).id)
}
