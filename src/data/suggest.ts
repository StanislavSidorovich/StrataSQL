// Name suggestions from the task text: every word of the text (and every pair of words), so the
// name fields can complete "co…" to "contacts". All words are offered, not only those that are
// answers, so a suggestion gives nothing away.

export const STOP = new Set(
  `a an the and or but nor of to in on at by for from with without into onto about as is are was were be been being has have had
  do does did can could may might must shall should will would this that these those it its they them their there here who whom whose
  which what when where why how each every any some all both either neither one two three no not only also than then so such very
  more most less many much other another same own per via if else while once just
  he she his her him we us our you your i my me`.split(/\s+/),
)

export interface NameSuggestions {
  /** For entity names: `Member`, `Loan_item`. */
  entities: string[]
  /** For attribute names: `contacts`, `contact`, `birth_date`. */
  attributes: string[]
}

/** Singular of a simple English plural (books → book, categories → category); the word itself otherwise. */
export function singular(w: string): string {
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'
  if (/(ss|us|is)$/.test(w)) return w
  if (/(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w) && w.length > 3) return w.slice(0, -1)
  return w
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

export function nameSuggestions(text: string[]): NameSuggestions {
  const attrs = new Set<string>()
  const ents = new Set<string>()
  for (const paragraph of text) {
    // Sentences and punctuation break word pairs (“books, members” is not one name).
    for (const chunk of paragraph.toLowerCase().split(/[.,;:!?()"“”«»\n—–]+/)) {
      const words = chunk.match(/[a-zà-ÿ][a-zà-ÿ0-9'-]*/g) ?? []
      let prev: string | null = null
      for (const raw of words) {
        const w = raw.replace(/'s$/, '').replace(/['-]+$/, '')
        if (w.length < 3 || STOP.has(w)) {
          prev = null
          continue
        }
        const one = singular(w)
        attrs.add(w)
        attrs.add(one)
        ents.add(cap(one))
        if (prev) {
          attrs.add(`${prev}_${w}`)
          ents.add(cap(`${prev}_${one}`))
        }
        prev = w
      }
    }
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
  return { entities: sort(ents), attributes: sort(attrs) }
}
