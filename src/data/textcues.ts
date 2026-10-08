// Text cues for “My task”: an offline reader of an English task text that finds candidate entities,
// attributes, identifiers, inheritances, relationships, rules and cardinality words — by phrase
// patterns and a small word list, no AI and no dictionary download. It never builds the model and never
// tags the text: the student tags first, then `compareTagging` turns the differences into questions.

import type { Mark, MarkTag } from './mytask'
import { nameWords, sameName } from './mytask'
import { STOP } from './suggest'

/** A cardinality word of a relationship cue and what it suggests. */
export interface CardCue {
  word: string
  means: string
}

export interface Cue {
  p: number
  start: number
  end: number
  text: string
  tag: MarkTag
  /** Why the text suggests it, in words a student can check. */
  why: string
  cards?: CardCue[]
}

interface Tok {
  w: string
  lw: string
  s: number
  e: number
  word: boolean
}

const DET = new Set('a an the its their his her each every one this that these those some any our'.split(' '))
/** Words that start a list item but are not part of its name. */
const SKIP = new Set('only also even just always both'.split(' '))
/** Words that are never part of a noun phrase (verbs and adjectives the patterns meet). */
const NOT_NOUN = new Set(
  `keep keeps kept record records recorded store stores stored know known want wants wanted need needs come comes came
  unique printed never given optional required mandatory necessary possible different same several many
  identified called named computed counted shared listed numbered twice depending according through over during after before until within under
  against across among toward towards per`.split(/\s+/),
)
/** Verbs of description, not of a link between two things. */
const NOT_LINK = new Set('identified characterized characterised described called named numbered computed counted kept stored recorded known'.split(' '))
const SINGULAR_DET = new Set('a an each every one this that'.split(' '))
const isPlural = (w: string) => /s$/.test(w) && !/(ss|us|is)$/.test(w)
const HAS = new Set('has have gives contains holds'.split(' '))
const KEEP = new Set('keep keeps record records store stores know have has'.split(' '))
const SYSTEM_VERB = new Set('wants needs keeps sells rents records manages runs'.split(' '))
const BE = new Set('is are be was were been'.split(' '))
const MODAL = new Set('can may must will might could should cannot'.split(' '))
const PREP = new Set('by to for with in from on of into between at'.split(' '))
const MANY = ['one or more', 'several', 'many', 'different', 'multiple']
const ONE = ['exactly one', 'only one', 'just one', 'one', 'a single']
const AT_MOST = ['at most one', 'at most once', 'only once', 'once', 'zero or one']
const TIMES = ['several times', 'many times']

const lower = (s: string) => s.toLowerCase().replace(/’/g, "'")

function tokenize(t: string): Tok[] {
  return [...t.matchAll(/[A-Za-z0-9][A-Za-z0-9'’-]*|[^\sA-Za-z0-9]/g)].map((m) => {
    const w = m[0]
    return { w, lw: lower(w), s: m.index!, e: m.index! + w.length, word: /^[A-Za-z0-9]/.test(w) }
  })
}

const isPossessive = (t: Tok | undefined) => !!t && t.word && /'s$/.test(t.lw)
const isNounWord = (t: Tok | undefined) =>
  !!t && t.word && !STOP.has(t.lw) && !NOT_NOUN.has(t.lw) && !DET.has(t.lw) && !isPossessive(t) && !(t.lw.length > 5 && /ed$/.test(t.lw)) && !/^\d+$/.test(t.lw)

/** Does a phrase (several words) start at token i? Returns the index after it. */
function phraseAt(toks: Tok[], i: number, phrases: string[]): { end: number; word: string } | null {
  for (const ph of phrases) {
    const ws = ph.split(' ')
    if (ws.every((w, k) => toks[i + k]?.lw === w)) return { end: i + ws.length, word: ph }
  }
  return null
}

interface NP {
  /** First and last token (inclusive) of the name, without determiners. */
  a: number
  b: number
  next: number
}

/** A noun phrase at token i: determiners, then 1–3 name words, optionally “of (the) …” (“type of landscape”). */
function np(toks: Tok[], i: number): NP | null {
  let k = i
  while (toks[k] && (DET.has(toks[k].lw) || SKIP.has(toks[k].lw) || isPossessive(toks[k]))) k++
  const singularDet = k > i && SINGULAR_DET.has(toks[k - 1].lw)
  // “registered customers”, “numbered lines”: a participle in front is not part of the name.
  while (toks[k] && toks[k].word && /ed$/.test(toks[k].lw) && toks[k].lw.length > 5 && isNounWord(toks[k + 1])) k++
  if (!isNounWord(toks[k])) return null
  const a = k
  // After “each line”, “refers” is the verb: a singular noun is not followed by a plural word.
  // After a plural (“customers share”), the next word is the verb too.
  while (k - a < 3 && isNounWord(toks[k]) && !(k > a && ((singularDet && isPlural(toks[k].lw) && !isPlural(toks[k - 1].lw)) || isPlural(toks[k - 1].lw)))) k++
  let b = k - 1
  if (toks[k]?.lw === 'of') {
    let m = k + 1
    if (toks[m] && ['the', 'each', 'a', 'an'].includes(toks[m].lw)) m++
    if (isNounWord(toks[m])) {
      let n = m
      while (n - m < 2 && isNounWord(toks[n])) n++
      b = n - 1
      k = n
    }
  }
  return { a, b, next: k }
}

/** A list of noun phrases: “a title, a summary, and a duration”. A relative clause (“who borrow them”) or a short “, unique in …,” aside is skipped. */
function npList(toks: Tok[], i: number): NP[] {
  const out: NP[] = []
  let first = np(toks, i)
  if (!first) return out
  out.push(first)
  let k = first.next
  for (;;) {
    // “a code (SKU), a name …”: an aside in brackets.
    if (toks[k]?.w === '(') {
      let m = k
      while (toks[m] && toks[m].w !== ')' && m - k < 10) m++
      if (toks[m]?.w === ')') k = m + 1
    }
    // “the people who borrow them and the loans”: skip the relative clause up to “and” + determiner or a comma.
    if (toks[k] && ['who', 'which', 'that'].includes(toks[k].lw)) {
      let m = k
      while (toks[m] && toks[m].w !== ',' && !(toks[m].lw === 'and' && toks[m + 1] && DET.has(toks[m + 1].lw)) && !/[.;:]/.test(toks[m].w)) m++
      if (!toks[m] || /[.;:]/.test(toks[m].w)) break
      k = m
    }
    let m = k
    if (toks[m]?.w === ',') m++
    if (toks[m]?.lw === 'and' || toks[m]?.lw === 'or') m++
    if (m === k) break
    let next = np(toks, m)
    if (!next && toks[k]?.w === ',' && toks[m] && ['unique', 'printed', 'never', 'optional'].includes(toks[m].lw)) {
      // “a name, unique in the league, the city …”
      let n = m
      while (toks[n] && toks[n].w !== ',' && !/[.;:]/.test(toks[n].w) && n - m < 12) n++
      if (toks[n]?.w === ',') {
        let q = n + 1
        if (toks[q]?.lw === 'and') q++
        next = np(toks, q)
      }
    }
    if (!next) break
    // “…, and the pauses of a rental are numbered”: a new clause starts, not a list item.
    if (BE.has(toks[next.next]?.lw ?? '') || MODAL.has(toks[next.next]?.lw ?? '')) break
    out.push(next)
    k = next.next
  }
  return out
}

/** Index ranges of the clauses of a paragraph: split at . ; : and “ — ”. */
function clauses(toks: Tok[]): [number, number][] {
  const out: [number, number][] = []
  let a = 0
  toks.forEach((t, i) => {
    if (/^[.;:!?—]$/.test(t.w) && !(t.w === '.' && /\d/.test(toks[i + 1]?.w ?? ''))) {
      if (i > a) out.push([a, i])
      a = i + 1
    }
  })
  if (a < toks.length) out.push([a, toks.length])
  return out
}

const head = (toks: Tok[], n: NP) => nameWords(toks.slice(n.a, n.b + 1).map((t) => t.w).join(' ')).join('_')

/** All cues of a text (paragraphs as `paragraphs()` makes them). Cues never overlap. */
export function findCues(ps: string[]): Cue[] {
  const raw: Cue[] = []
  const entityHeads = new Set<string>()
  const systems = new Set<string>()
  const all = ps.map((t) => tokenize(t))

  const add = (p: number, toks: Tok[], a: number, b: number, tag: MarkTag, why: string, cards?: CardCue[]) => {
    if (a < 0 || b < a || !toks[b]) return
    const t = ps[p]
    raw.push({ p, start: toks[a].s, end: toks[b].e, text: t.slice(toks[a].s, toks[b].e), tag, why, ...(cards && cards.length ? { cards } : {}) })
  }
  const addNP = (p: number, toks: Tok[], n: NP, tag: MarkTag, why: string) => {
    if (tag === 'entity') {
      const h = head(toks, n)
      if (systems.has(h)) return
      entityHeads.add(h)
    }
    add(p, toks, n.a, n.b, tag, why)
  }

  // Pass 1: entities, attributes, identifiers, inheritances, rules.
  all.forEach((toks, p) => {
    for (const [ca, cb] of clauses(toks)) {
      const at = (i: number) => (i < cb ? toks[i] : undefined)
      // The system the text is about: “A small library wants …”, “A football league keeps its …”.
      if (p === 0) {
        for (let i = ca; i < cb; i++) {
          if (!SYSTEM_VERB.has(toks[i].lw)) continue
          const subj = np(toks, ca)
          if (!subj || subj.next !== i) break
          systems.add(head(toks, subj))
          let k = i + 1
          if (toks[k]?.lw === 'to') k += 2
          if (toks[k]?.lw === 'a' && toks[k + 1]?.lw === 'database' && toks[k + 2]?.lw === 'of') k += 3
          for (const n of npList(toks, k)) addNP(p, toks, n, 'entity', 'the text says it keeps data about them')
          if (toks[i].lw === 'sells' || toks[i].lw === 'rents') {
            const n = npList(toks, k).at(-1)
            if (n && toks[n.next]?.lw === 'to') for (const m of npList(toks, n.next + 1)) addNP(p, toks, m, 'entity', 'the text says it keeps data about them')
          }
          break
        }
      }
      for (let i = ca; i < cb; i++) {
        const lw = toks[i].lw
        const clauseStart = i === ca || (toks[i - 1]?.w === ',' && ['and', 'but'].includes(lw) === false && i - 1 >= ca)
        // “For each X we keep …”, “For indoor scenes, it is necessary to know …”, “For those we keep …”.
        if (lw === 'for' && (i === ca || toks[i - 1]?.w === ',')) {
          const owner = np(toks, i + 1)
          let k = owner ? owner.next : i + 2
          let found = -1
          for (let m = k; m < Math.min(cb, k + 9); m++) if (KEEP.has(toks[m].lw) && toks[m].lw !== 'has' && toks[m].lw !== 'have') { found = m; break }
          if (found >= 0) {
            if (owner) addNP(p, toks, owner, 'entity', `the text keeps facts about it (“for each … we keep”)`)
            for (const n of npList(toks, found + 1)) addNP(p, toks, n, 'attribute', 'one fact the text keeps')
            continue
          }
        }
        // “We (also) keep each member’s name and email”, “The hospital has wards …”.
        if (KEEP.has(lw) && i > ca) {
          const subj = toks[i - 1].lw === 'also' ? toks[i - 2] : toks[i - 1]
          if (subj && ['we', 'it', 'they'].includes(subj.lw)) {
            let k = i + 1
            if (toks[k] && ['each', 'every'].includes(toks[k].lw) && isPossessive(toks[k + 1])) {
              const t = toks[k + 1]
              raw.push({ p, start: t.s, end: t.e - 2, text: ps[p].slice(t.s, t.e - 2), tag: 'entity', why: 'the text keeps facts about it' })
              k += 2
            }
            for (const n of npList(toks, k)) addNP(p, toks, n, 'attribute', 'one fact the text keeps')
            continue
          }
          const s = np(toks, ca)
          if (s && s.next === i && systems.has(head(toks, s)) && lw !== 'know') {
            for (const n of npList(toks, i + 1)) addNP(p, toks, n, 'entity', 'the text says it keeps data about them')
            continue
          }
        }
        // “Each X has a …, a … and a …” / “A TV show has a title …” (not “has several …”: a relationship).
        if (HAS.has(lw) && i > ca) {
          const s = np(toks, ca)
          const sNext = s && toks[s.next]?.lw === 'also' ? s.next + 1 : s?.next
          if (s && sNext === i && !systems.has(head(toks, s)) && !phraseAt(toks, i + 1, [...MANY, ...ONE, ...AT_MOST])) {
            const items = npList(toks, i + 1)
            if (items.length) {
              addNP(p, toks, s, 'entity', 'the text lists its facts (“… has a …”)')
              const owner = toks.slice(s.a, s.b + 1).map((t) => t.w).join(' ')
              for (const n of items) {
                // “Each order has numbered lines”: many of them per owner — an entity of its own.
                if (isPlural(toks[n.b].lw) && n.a === n.b) addNP(p, toks, n, 'entity', `many of them per ${owner}: an entity of its own, not an attribute`)
                else addNP(p, toks, n, 'attribute', `a fact of ${owner}`)
              }
              continue
            }
          }
        }
        // “characterized by a name, a phone number, and an email”; “each with a name and a floor”.
        if ((lw === 'characterized' || lw === 'characterised' || lw === 'described') && toks[i + 1]?.lw === 'by') {
          for (const n of npList(toks, i + 2)) addNP(p, toks, n, 'attribute', 'listed after “characterized by”')
          continue
        }
        if (lw === 'with' && toks[i + 1] && ['a', 'an'].includes(toks[i + 1].lw)) {
          for (const n of npList(toks, i + 1)) addNP(p, toks, n, 'attribute', '“with a …”: a fact of it')
          continue
        }
        // “X are identified by (their) Y (and Z)”.
        if (lw === 'identified' && toks[i + 1]?.lw === 'by') {
          let s = np(toks, ca)
          if (s && (BE.has(toks[s.next]?.lw ?? '') || toks[s.next]?.lw === 'always')) addNP(p, toks, s, 'entity', 'the text says how to identify it')
          for (const n of npList(toks, i + 2)) addNP(p, toks, n, 'identifier', '“identified by”: the primary identifier — or, if it is another entity, a dependent relationship')
          continue
        }
        // “No two books share an ISBN”.
        if (lw === 'no' && toks[i + 1]?.lw === 'two') {
          const owner = np(toks, i + 2)
          const k = owner ? owner.next : i + 2
          if (toks[k] && /^shares?$/.test(toks[k].lw)) {
            const y = np(toks, k + 1)
            add(p, toks, i, k, 'rule', 'a uniqueness rule')
            if (y) addNP(p, toks, y, 'identifier', `“no two … share”: unique — an alternate identifier`)
            continue
          }
        }
        // “a name, unique in the league”, “a serial number, printed on the frame and never shared by two scooters”.
        if (lw === 'unique' || (lw === 'shared' && toks[i - 1]?.lw === 'never')) {
          let m = i - 1
          while (m >= ca && toks[m].w !== ',') m--
          let k = m - 1
          let last: NP | null = null
          for (let q = ca; q <= k; q++) {
            const n = np(toks, q)
            if (n && n.b <= k && n.b === k) last = n
          }
          if (last) addNP(p, toks, last, 'identifier', '“unique”: an alternate identifier')
        }
        // Inheritance: “can be indoors or outdoors”, “either a doctor or a nurse”, “The staff are doctors and nurses”.
        if ((MODAL.has(lw) && toks[i + 1]?.lw === 'be') || lw === 'either') {
          const k = lw === 'either' ? i + 1 : i + 2
          const x = np(toks, k)
          const xEnd = x ? x.next : toks[k] && toks[k].word && !STOP.has(toks[k].lw) ? k + 1 : -1
          if (xEnd > 0 && toks[xEnd]?.lw === 'or') {
            const y = np(toks, xEnd + 1)
            const yEnd = y ? y.b : toks[xEnd + 1]?.word ? xEnd + 1 : -1
            if (yEnd > 0 && !(toks[k].lw === 'a' && toks[k + 1] && /ed$/.test(toks[k + 1].lw))) {
              add(p, toks, i, yEnd, 'inheritance', '“either … or …”: kinds of one thing, each with its own data or links?')
              continue
            }
          }
        }
        if (BE.has(lw) && i > ca && toks[ca].lw === 'the') {
          const s = np(toks, ca)
          let sEnd = s?.next ?? -1
          // “The participants in a scene are …”
          if (s && PREP.has(toks[sEnd]?.lw ?? '')) {
            const pp = np(toks, sEnd + 1)
            if (pp) sEnd = pp.next
          }
          if (s && sEnd === i) {
            const items = npList(toks, i + 1)
            if (items.length >= 2 && items.every((n) => /s$/.test(toks[n.b].lw))) {
              add(p, toks, items[0].a, items.at(-1)!.b, 'inheritance', `kinds of ${toks.slice(s.a, s.b + 1).map((t) => t.w).join(' ')}: an inheritance?`)
              addNP(p, toks, s, 'entity', 'the parent of the kinds the text lists')
              for (const n of items) entityHeads.add(head(toks, n))
              continue
            }
          }
        }
        // Rules: “never”, “cannot”, “must”, “is not stored”, “stays empty”.
        const ruleWord =
          ['never', 'cannot', "can't", 'must'].includes(lw) ||
          (lw === 'can' && toks[i + 1]?.lw === 'not') ||
          (lw === 'not' && toks[i + 1]?.lw === 'stored') ||
          ((lw === 'stays' || lw === 'is' || lw === 'remains') && toks[i + 1]?.lw === 'empty') ||
          lw === 'unique' ||
          (lw === 'again' && toks.slice(ca, i).some((t) => t.lw === 'same'))
        if (ruleWord) {
          let a = i
          while (a > ca && !/^[,(]$/.test(toks[a - 1].w)) a--
          if (toks[a] && ['and', 'but', 'so'].includes(toks[a].lw)) a++
          let b = i
          while (b + 1 < cb && !/^[,)]$/.test(toks[b + 1].w)) b++
          const why =
            lw === 'not' ? 'derived data: computed, not stored as an attribute' : /empty/.test(toks[i + 1]?.lw ?? '') ? 'may stay empty: this attribute is not mandatory (no M)' : lw === 'unique' ? 'unique: an alternate identifier' : lw === 'again' ? 'the same pair can happen again: an intermediate entity then needs its own id' : 'a rule: a key, M, or a CHECK may enforce it — or the Sandbox shows it'
          add(p, toks, a, b, 'rule', why)
          i = b
        }
        void clauseStart
        void at
      }
    }
    // “the history of these reports is kept”, “are numbered in order”.
    toks.forEach((t, i) => {
      if (t.lw === 'history' && toks[i + 1]?.lw === 'of') {
        const n = np(toks, i + 2)
        if (n) add(p, toks, i, n.b, 'entity', 'a history keeps many rows over time: an entity of its own')
      }
      if (t.lw === 'numbered' && BE.has(toks[i - 1]?.lw ?? '') && toks[i + 1] && PREP.has(toks[i + 1].lw) || (t.lw === 'numbered' && toks[i + 1]?.lw === 'in')) {
        let b = i + 1
        while (toks[b + 1] && toks[b + 1].word && b - i < 4) b++
        add(p, toks, i, b, 'identifier', 'numbered within its owner: a number that is part of the identifier — a dependent entity?')
      }
    })
    // “Each X …” at a clause start: X is something the text keeps.
    for (const [ca] of clauses(toks)) {
      if (['each', 'every'].includes(toks[ca]?.lw ?? '')) {
        const n = np(toks, ca)
        if (n) addNP(p, toks, n, 'entity', '“each …”: something the text counts and keeps')
      }
    }
  })

  // Pass 2: relationships — “(each) X (can) (be) VERB (by) many/one Y”, and “… at most once”.
  all.forEach((toks, p) => {
    for (const [ca, cb] of clauses(toks)) {
      for (let i = ca; i < cb; i++) {
        // “…, and is of one room type”: the clause's subject again.
        const elided = toks[i].lw === 'and' && toks[i - 1]?.w === ',' && (BE.has(toks[i + 1]?.lw ?? '') || MODAL.has(toks[i + 1]?.lw ?? ''))
        const subjDet = elided || i === ca || ['each', 'every', 'a', 'an', 'one', 'the', 'many', 'several'].includes(toks[i].lw)
        if (!subjDet) continue
        const from = toks[i].lw === 'the' && toks[i + 1]?.lw === 'same' ? i + 2 : ['many', 'several'].includes(toks[i].lw) ? i + 1 : i
        const s = elided ? np(toks, ca) : np(toks, from)
        if (!s) continue
        let k = elided ? i + 1 : s.next
        const vStart = k
        let modal: string | null = null
        if (MODAL.has(toks[k]?.lw ?? '')) modal = toks[k++].lw
        while (toks[k] && SKIP.has(toks[k].lw)) k++
        let be = false
        if (BE.has(toks[k]?.lw ?? '')) (be = true), k++
        let verb = -1
        if ((toks[k] && /^[a-z]/i.test(toks[k].w) && !PREP.has(toks[k].lw) && !STOP.has(toks[k].lw)) || ['has', 'have'].includes(toks[k]?.lw ?? '')) verb = k++
        if (verb < 0 && !be) continue
        // “the same rider may even take the same scooter again”: a repeat rule, not a new link.
        if (toks.slice(vStart, cb).some((t) => t.lw === 'again')) continue
        // “cannot be listed twice”: a negative sentence is a rule, not a link.
        if (modal === 'cannot' || toks[vStart + 1]?.lw === 'not' || toks[vStart]?.lw === 'never') continue
        if (toks[k]?.lw === 'of' && toks[verb]?.lw === 'made') k++
        const v = verb >= 0 ? toks[verb].lw : ''
        if (verb >= 0 && ((KEEP.has(v) && v !== 'has' && v !== 'have') || NOT_LINK.has(v))) continue
        // “rate it once”, “pause it several times”
        const kOnce = verb >= 0 && ['it', 'them'].includes(toks[k]?.lw ?? '') ? k + 1 : k
        const once = phraseAt(toks, kOnce, [...AT_MOST.filter((x) => x.includes('once')), ...TIMES])
        const prep = !once && PREP.has(toks[k]?.lw ?? '')
        if (prep) k++
        if (verb < 0 && !prep) continue
        if (once && verb >= 0) {
          add(p, toks, vStart, once.end - 1, 'relationship', `a link with a count (“${once.word}”)`, [cardOf(once.word, '')])
          i = once.end - 1
          continue
        }
        const q = phraseAt(toks, k, [...MANY, ...AT_MOST, ...ONE, 'the same', 'a', 'an'])
        const o = np(toks, q ? q.end : k)
        if (!o || o.a > (q ? q.end : k) + 1) continue
        const strong = q && !['a', 'an', 'the same'].includes(q.word)
        const sh = head(toks, s)
        const oh = head(toks, o)
        if (systems.has(sh)) continue
        const known = (h: string) => [...entityHeads].some((e) => (HAS.has(v) ? e === h : sameName(e, h)))
        // Without a count word: both ends known, or a real verb at the start of a clause with one end known (“A rental may use a promo code”).
        const bothKnown = known(sh) && known(oh)
        const oneKnown = (known(sh) || known(oh)) && i <= ca + 1 && verb >= 0 && !HAS.has(v)
        if (!strong && !bothKnown && !oneKnown) continue
        if (HAS.has(v) && !strong && !known(oh)) continue
        if (sh === oh && !/sub|parent/.test(toks.slice(o.a, o.b + 1).map((t) => t.lw).join(' '))) continue
        const cards: CardCue[] = []
        const objName = toks.slice(o.a, o.b + 1).map((t) => t.w).join(' ')
        if (q && q.word !== 'a' && q.word !== 'an' && q.word !== 'the same') cards.push(cardOf(q.word, objName))
        if (modal === 'may' || modal === 'can') cards.push({ word: modal, means: '“' + modal + '”: possible, not required — a minimum of 0?' })
        entityHeads.add(sh)
        entityHeads.add(oh)
        add(p, toks, vStart, (q ? q.end : k) - 1 >= vStart ? (q ? q.end - 1 : k - 1) : vStart, 'relationship', `a verb links ${toks.slice(s.a, s.b + 1).map((t) => t.w).join(' ')} and ${objName}`, cards)
        raw.push(...[s, o].map((n) => ({ p, start: toks[n.a].s, end: toks[n.b].e, text: ps[p].slice(toks[n.a].s, toks[n.b].e), tag: 'entity' as MarkTag, why: 'one end of a link the text describes' })))
        i = o.b
      }
    }
  })

  return resolve(raw, ps)
}

function cardOf(word: string, obj: string): CardCue {
  const on = obj ? ` on the ${obj} side` : ''
  if (MANY.includes(word) || TIMES.includes(word)) return { word, means: `“${word}”: many — the n${on}` }
  if (word === 'one or more') return { word, means: `“one or more”: at least one, many allowed — 1,n${on}` }
  if (AT_MOST.includes(word)) return { word, means: `“${word}”: at most one, maybe none — 0,1${on}` }
  return { word, means: `“${word}”: at most one — the 1${on}` }
}

const PRIORITY: MarkTag[] = ['identifier', 'inheritance', 'attribute', 'entity', 'relationship', 'rule']

/** Entities once per name (first mention); attributes once per name and paragraph (identifier wins);
 *  then overlaps: the higher priority keeps its range, a lower one keeps its longest free part (≥ 2 words) or goes. */
function resolve(raw: Cue[], ps: string[]): Cue[] {
  const entityNames = new Set(raw.filter((c) => c.tag === 'entity').map((c) => nameWords(c.text).join('_')))
  // “we record the match, the minute and the player”: a “fact” named like an entity is a link to it.
  const byPos = [...raw]
    .map((c) => (c.tag === 'attribute' && entityNames.has(nameWords(c.text).join('_')) ? { ...c, tag: 'relationship' as MarkTag, why: 'it names an entity of the text: a link to it, not an attribute' } : c))
    .sort((a, b) => a.p - b.p || a.start - b.start)
  const seen = new Set<string>()
  const ids = new Set(byPos.filter((c) => c.tag === 'identifier').map((c) => `${c.p}:${nameWords(c.text).join('_')}`))
  const deduped: Cue[] = []
  for (const c of byPos) {
    const name = nameWords(c.text).join('_')
    if (!name && ['entity', 'attribute', 'identifier'].includes(c.tag)) continue
    let tag = c.tag
    let why = c.why
    if (tag === 'attribute' && ids.has(`${c.p}:${name}`)) {
      const id = byPos.find((x) => x.tag === 'identifier' && x.p === c.p && nameWords(x.text).join('_') === name)!
      tag = 'identifier'
      why = id.why
    }
    const key = tag === 'entity' ? `e:${name}` : tag === 'attribute' || tag === 'identifier' ? `a:${c.p}:${name}` : `${tag}:${c.p}:${c.start}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ ...c, tag, why })
  }
  const out: Cue[] = []
  for (const tag of PRIORITY) {
    for (const c of deduped.filter((x) => x.tag === tag)) {
      const taken = out.filter((x) => x.p === c.p && x.start < c.end && x.end > c.start)
      if (taken.length === 0) {
        out.push(c)
        continue
      }
      if (tag !== 'relationship' && tag !== 'rule' && tag !== 'inheritance') continue
      // Longest free part of the range.
      const cuts = [c.start, ...taken.flatMap((x) => [x.start, x.end]), c.end].map((n) => Math.min(Math.max(n, c.start), c.end)).sort((a, b) => a - b)
      let best: [number, number] | null = null
      for (let k = 0; k + 1 < cuts.length; k++) {
        const [a, b] = [cuts[k], cuts[k + 1]]
        if (taken.some((x) => x.start <= a && x.end >= b)) continue
        if (!best || b - a > best[1] - best[0]) best = [a, b]
      }
      if (!best) continue
      const t = ps[c.p]
      let [a, b] = best
      while (a < b && /[\s,.;:()]/.test(t[a])) a++
      while (b > a && /[\s,.;:()]/.test(t[b - 1])) b--
      const text = t.slice(a, b)
      if (text.split(/\s+/).filter(Boolean).length < 2) continue
      out.push({ ...c, start: a, end: b, text })
    }
  }
  return out.sort((a, b) => a.p - b.p || a.start - b.start)
}

// ---------------------------------------------------------------- comparing with the student's tags

export interface TagQuestion {
  kind: 'untagged' | 'other-tag' | 'cardinality'
  cue: Cue
  mark?: Mark
  text: string
}

const TAG_WORD: Record<MarkTag, string> = { entity: 'an entity', attribute: 'an attribute', identifier: 'an identifier', relationship: 'a relationship', inheritance: 'an inheritance', rule: 'a rule' }

/** Tags that answer a cue as well as its own (an M:N may become an intermediate entity; an identifier is an attribute too). */
const COMPATIBLE: Record<MarkTag, MarkTag[]> = {
  entity: ['entity', 'relationship', 'inheritance'],
  attribute: ['attribute', 'identifier', 'rule'],
  identifier: ['identifier'],
  relationship: ['relationship', 'entity', 'rule'],
  inheritance: ['inheritance', 'entity'],
  rule: ['rule', 'attribute', 'identifier', 'relationship', 'entity', 'inheritance'],
}

const overlaps = (m: Mark, c: Cue) => m.p === c.p && m.start < c.end && m.end > c.start

/** The differences between the student's tags and the text cues, as questions. Without tags there are none. */
export function compareTagging(marks: Mark[], cues: Cue[]): TagQuestion[] {
  if (marks.length === 0) return []
  const out: TagQuestion[] = []
  for (const c of cues) {
    const here = marks.filter((m) => overlaps(m, c))
    const named = (tags: MarkTag[], sameParagraph: boolean) => marks.some((m) => tags.includes(m.tag) && (!sameParagraph || m.p === c.p) && sameName(m.text, c.text))
    if (here.length === 0) {
      if (c.tag === 'entity' && named(['entity'], false)) continue
      if ((c.tag === 'attribute' || c.tag === 'identifier') && named(c.tag === 'identifier' ? ['identifier'] : ['attribute', 'identifier'], true)) continue
      out.push({ kind: 'untagged', cue: c, text: `${c.why}. ${capital(TAG_WORD[c.tag])}?` })
      continue
    }
    if (here.some((m) => COMPATIBLE[c.tag].includes(m.tag))) {
      const m = here.find((x) => x.tag === 'relationship')
      if (c.tag === 'relationship' && m && c.cards?.length) out.push({ kind: 'cardinality', cue: c, mark: m, text: c.cards.map((k) => k.means).join(' · ') + ' — is it so in your model?' })
      continue
    }
    const m = here[0]
    out.push({ kind: 'other-tag', cue: c, mark: m, text: `You tagged it ${m.tag}; ${c.why}. ${capital(TAG_WORD[c.tag])} or ${TAG_WORD[m.tag]}?` })
  }
  return out
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
