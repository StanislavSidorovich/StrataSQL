// Walkthrough (stage 5b): a case's reference model built step by step on an empty canvas.
// Every step shows a *subset* of the reference model, so the last step is the reference itself and
// the steps cannot drift from it. The words come from cases.ts (phrase → why, notes) plus readings
// generated from the model, and each step lists the tables it creates or changes.

import { foreignKeyHolder, generatePdm, relationshipKind } from '../core/cdm2pdm'
import { formatCardinality, formatDataType, type Cardinality, type Entity, type Id, type Model } from '../core/metamodel'
import { columnFlags, type Pdm, type PdmTable } from '../core/pdm'
import type { TagSpan, TrainerCase } from './cases'

export type WalkStepKind = 'intro' | 'entity' | 'attributes' | 'identifier' | 'relationship' | 'inheritance' | 'keys' | 'rules' | 'done'

export interface WalkFocus {
  kind: 'entity' | 'relationship' | 'inheritance'
  id: Id
}

export interface WalkStep {
  kind: WalkStepKind
  /** `entity:Book`, `attributes:Book`, `identifier:Book`, `relationship:writes`… — the keys of `WalkPlan.notes`. */
  key: string
  title: string
  /** Paragraphs with **bold**, *italic* and `code` markup. */
  text: string[]
  /** Indices into `case.spans`: the words of the text this step turns into the model. */
  spans: number[]
  /** Tables the step creates or changes, PowerDesigner style: `BOOK: book_id <pk>, isbn <ak>, …`. */
  tables: string[]
  /** Elements added by this step (highlighted on the canvas; the first one is selected). */
  focus: WalkFocus[]
  /** Help card for the concept of the step. */
  help?: string
  model: Model
}

interface Shown {
  entities: Set<Id>
  attrs: Set<Id>
  idents: Set<Id>
  rels: Set<Id>
  inhs: Set<Id>
  keys: boolean
}

/** The reference model reduced to what has been shown so far (same ids, same order). */
function snapshot(ref: Model, s: Shown): Model {
  return {
    ...ref,
    entities: ref.entities
      .filter((e) => s.entities.has(e.id))
      .map(({ physicalKeys, ...e }) => ({
        ...e,
        attributes: e.attributes.filter((a) => s.attrs.has(a.id)),
        identifiers: e.identifiers.filter((i) => s.idents.has(i.id)),
        ...(physicalKeys && s.keys ? { physicalKeys } : {}),
      })),
    relationships: ref.relationships.filter((r) => s.rels.has(r.id)),
    inheritances: ref.inheritances.filter((i) => s.inhs.has(i.id)),
  }
}

function cardPhrase(c: Cardinality): string {
  if (c.min === 1 && c.max === 1) return 'exactly one'
  if (c.min === 0 && c.max === 1) return 'at most one'
  if (c.min === 0) return 'zero or more'
  return 'one or more'
}

/** `BOOK: book_id <pk>, isbn <ak>, title, pub_year`. */
export function tableLine(t: PdmTable): string {
  const flags = columnFlags(t)
  if (!t.columns.length) return `${t.name}: (no columns yet — they arrive with its links)`
  return `${t.name}: ${t.columns.map((c) => (flags.get(c.name)?.length ? `${c.name} <${flags.get(c.name)!.join(',')}>` : c.name)).join(', ')}`
}

const tableOfEntity = (pdm: Pdm, id: Id) => pdm.tables.find((t) => t.source.kind === 'entity' && t.source.id === id)

/** Which step explains a phrase of the text. */
function spanKey(s: TagSpan, ref: Model, fine: boolean): string {
  if (!s.target) return 'rules'
  const kind = s.target.slice(0, s.target.indexOf(':'))
  const rest = s.target.slice(s.target.indexOf(':') + 1)
  if (kind === 'relationship' || kind === 'inheritance') return s.target
  const entity = kind === 'attribute' ? rest.split('.')[0] : rest
  if (s.tag === 'rule' && ref.entities.find((e) => e.name === entity)?.physicalKeys?.length) return 'keys'
  if (!fine) return `entity:${entity}`
  if (s.step === 'identifier') return `identifier:${entity}`
  return kind === 'attribute' ? `attributes:${entity}` : `entity:${entity}`
}

export function walkthroughSteps(c: TrainerCase, ref: Model = c.build()): WalkStep[] {
  const plan = c.walk
  const fine = !!plan.fine
  const byId = new Map(ref.entities.map((e) => [e.id, e]))
  const name = (id: Id) => byId.get(id)!.name
  const order: Entity[] = plan.order.map((n) => {
    const e = ref.entities.find((x) => x.name === n)
    if (!e) throw new Error(`${c.id}: walkthrough entity “${n}” is not in the reference model`)
    return e
  })
  for (const e of ref.entities) if (!order.includes(e)) order.push(e)

  const spansOf = new Map<string, number[]>()
  c.spans.forEach((s, i) => {
    const k = spanKey(s, ref, fine)
    spansOf.set(k, [...(spansOf.get(k) ?? []), i])
  })
  const mentioned = new Set(c.spans.filter((s) => s.target?.startsWith('attribute:')).map((s) => s.target!.slice('attribute:'.length)))
  const isMentioned = (e: Entity, attrId: Id) => mentioned.has(`${e.name}.${e.attributes.find((a) => a.id === attrId)!.name}`)
  const note = (key: string) => plan.notes?.[key]
  const specText = c.spec.join(' ').toLowerCase()

  /** Concepts already explained in an earlier step: each is explained once, where it first appears. */
  const explained = new Set<string>()
  const once = (concept: string, text: string) => {
    if (explained.has(concept)) return []
    explained.add(concept)
    return [text]
  }

  const shown: Shown = { entities: new Set(), attrs: new Set(), idents: new Set(), rels: new Set(), inhs: new Set(), keys: false }
  const steps: WalkStep[] = []
  const push = (
    step: Omit<WalkStep, 'model' | 'spans' | 'tables' | 'text'> & { text: (string | undefined | false)[]; tables?: (pdm: Pdm) => PdmTable[] },
  ) => {
    const model = snapshot(ref, shown)
    const pdm = generatePdm(model)
    const text = step.text.filter((t): t is string => !!t)
    const n = note(step.key)
    if (n) text.push(n)
    steps.push({ ...step, text, spans: spansOf.get(step.key) ?? [], tables: (step.tables?.(pdm) ?? []).map(tableLine), model })
  }

  const dependentOn = (e: Entity) =>
    ref.relationships.filter((r) => r.dependentSide && (r.dependentSide === 'A' ? r.entityA : r.entityB) === e.id).map((r) => name(r.dependentSide === 'A' ? r.entityB : r.entityA))
  const parentOf = (e: Entity) => ref.inheritances.find((i) => i.childIds.includes(e.id))

  const attrList = (e: Entity, ids: Id[]) =>
    ids
      .map((id) => e.attributes.find((a) => a.id === id)!)
      .map((a) => `\`${a.name}\` ${formatDataType(a)}${a.mandatory ? ' <M>' : ''}`)
      .join(', ')

  const identifierText = (e: Entity): string[] => {
    const out: string[] = []
    const pi = e.identifiers.find((i) => i.isPrimary)
    const deps = dependentOn(e)
    const parent = parentOf(e)
    const piNames = pi ? pi.attributeIds.map((id) => `\`${e.attributes.find((a) => a.id === id)!.name}\``).join(' + ') : ''
    if (parent && !pi) out.push(`No identifier of its own: as a kind of **${name(parent.parentId)}** it shares the parent’s identifier.`)
    else if (deps.length && pi)
      out.push(`${piNames} is only *part* of the identifier: ${e.name} is also identified through ${deps.map((d) => `**${d}**`).join(' and ')} (a dependent relationship, coming up).`)
    else if (deps.length) out.push(`No identifier of its own: ${e.name} is identified entirely through ${deps.map((d) => `**${d}**`).join(' and ')} (a dependent relationship, coming up).`)
    else if (pi) {
      const invented = pi.attributeIds.every((id) => !isMentioned(e, id))
      const number = pi.attributeIds.length === 1 && e.attributes.find((a) => a.id === pi.attributeIds[0])!.dataType === 'Integer'
      out.push(`Primary identifier <pi>: ${piNames}${invented ? ` — the text gives none, so ${number ? 'a short number' : 'a code'} is added.` : '.'}`)
    }
    if (pi) out.push(...once('pi', 'The **primary identifier** tells one instance from all others; it becomes the PRIMARY KEY of the table.'))
    for (const ai of e.identifiers.filter((i) => !i.isPrimary)) {
      out.push(`Alternate identifier <ai>: ${ai.attributeIds.map((id) => `\`${e.attributes.find((a) => a.id === id)!.name}\``).join(' + ')} — also unique, so the table gets a UNIQUE key.`)
    }
    return out
  }

  const conceptsForAttributes = () => [
    ...once('types', 'The code after a name is its type: `VA100` = text up to 100 characters, `A13` = exactly 13, `I` = integer, `SI` = short integer, `D` = date, `DT` = date & time.'),
    ...once('mandatory', '**<M>** = mandatory: every instance has a value, the column becomes NOT NULL. Without it the value may be missing (NULL).'),
  ]

  const invented = (e: Entity, ids: Id[]) => {
    const list = ids.filter((id) => !isMentioned(e, id)).map((id) => `\`${e.attributes.find((a) => a.id === id)!.name}\``)
    return list.length ? `Not in the text, added to complete the design: ${list.join(', ')}.` : undefined
  }

  const introduceEntity = (e: Entity) => {
    const focus: WalkFocus[] = [{ kind: 'entity', id: e.id }]
    const pi = e.identifiers.find((i) => i.isPrimary)
    const piAttrs = new Set(pi?.attributeIds ?? [])
    const unnamed = !spansOf.get(`entity:${e.name}`)?.length && !note(`entity:${e.name}`) && !specText.includes(e.name.toLowerCase())
    const about = unnamed ? `**${e.name}** is not named in the text.${e.comment ? ` ${e.comment}` : ''}` : !note(`entity:${e.name}`) && e.comment ? e.comment : undefined
    const entityConcept = once('entity', 'An **entity** is a thing the database remembers, drawn as a box. Each entity becomes a table.')
    shown.entities.add(e.id)
    if (fine) {
      push({ kind: 'entity', key: `entity:${e.name}`, title: `Entity ${e.name}`, text: [...entityConcept, about], focus, help: 'entity' })
      const facts = e.attributes.filter((a) => !piAttrs.has(a.id)).map((a) => a.id)
      if (facts.length) {
        facts.forEach((id) => shown.attrs.add(id))
        push({
          kind: 'attributes',
          key: `attributes:${e.name}`,
          title: `${e.name}: attributes`,
          text: [`Each fact about one ${e.name.toLowerCase()} is an **attribute**: ${attrList(e, facts)}.`, invented(e, facts), ...conceptsForAttributes()],
          focus,
          help: 'attribute',
        })
      }
      if (piAttrs.size || e.identifiers.length) {
        e.attributes.forEach((a) => shown.attrs.add(a.id))
        e.identifiers.forEach((i) => shown.idents.add(i.id))
        push({
          kind: 'identifier',
          key: `identifier:${e.name}`,
          title: `${e.name}: identifier`,
          text: identifierText(e),
          focus,
          help: e.identifiers.some((i) => !i.isPrimary) ? 'alternate-identifier' : 'identifier',
          tables: (pdm) => [tableOfEntity(pdm, e.id)].filter((t): t is PdmTable => !!t),
        })
      }
    } else {
      e.attributes.forEach((a) => shown.attrs.add(a.id))
      e.identifiers.forEach((i) => shown.idents.add(i.id))
      const ids = e.attributes.map((a) => a.id)
      push({
        kind: 'entity',
        key: `entity:${e.name}`,
        title: e.name,
        text: [
          ...entityConcept,
          about,
          ids.length ? `Attributes: ${attrList(e, ids)}.` : 'No attributes of its own: everything it needs comes from its links.',
          ids.length ? invented(e, ids) : undefined,
          ...identifierText(e),
          ...(ids.length ? conceptsForAttributes() : []),
        ],
        focus,
        help: dependentOn(e).length ? 'dependent-entity' : parentOf(e) ? 'inheritance' : 'entity',
        tables: (pdm) => [tableOfEntity(pdm, e.id)].filter((t): t is PdmTable => !!t),
      })
    }
  }

  const introduceLinks = () => {
    for (const r of ref.relationships) {
      if (shown.rels.has(r.id) || !shown.entities.has(r.entityA) || !shown.entities.has(r.entityB)) continue
      shown.rels.add(r.id)
      const a = name(r.entityA)
      const b = name(r.entityB)
      const kind = relationshipKind(r)
      const text: string[] = [
        `Relationship \`${r.name}\`: each **${b}** has ${cardPhrase(r.cardinalityA)} ${a} (\`${formatCardinality(r.cardinalityA)}\` at ${a}); each **${a}** has ${cardPhrase(r.cardinalityB)} ${b} (\`${formatCardinality(r.cardinalityB)}\` at ${b}).`,
      ]
      text.push(...once('cardinality', 'Read a cardinality at the far end: `min,max` = how many of *that* entity one instance on this side has. `0` = optional, `1` = mandatory, `n` = many.'))
      let help = 'cardinality'
      const holder = foreignKeyHolder(r)
      if (r.dependentSide) {
        const child = r.dependentSide === 'A' ? a : b
        const parent = r.dependentSide === 'A' ? b : a
        text.push(`**Dependent**: ${child} is identified through ${parent} — ${parent}’s key becomes part of ${child}’s primary key (the triangle on the line).`)
        if (kind === 'one-to-one') text.push(`At most one ${child} per ${parent}: its primary key is just ${parent}’s key.`)
        help = 'dependent-entity'
      } else if (kind === 'many-to-many') {
        text.push(...once('m:n', '**Many-to-many** with no data of its own: it stays a line in the conceptual model; the physical model adds a join table whose primary key is both foreign keys.'))
        help = 'many-to-many'
      } else if (kind === 'one-to-one') {
        text.push(`**One-to-one**: the foreign key goes into ${holder === 'A' ? a : b} and is UNIQUE.`)
        help = 'one-to-one'
      } else {
        const many = holder === 'A' ? a : b
        const one = holder === 'A' ? b : a
        text.push(...once('1:n', `**One-to-many**: the foreign key goes to the “many” side — ${many} stores which ${one} it belongs to.`))
        const holderCard = holder === 'A' ? r.cardinalityB : r.cardinalityA
        if (holderCard.min === 0) text.push(`Optional (\`0,1\`): a ${many} may have no ${one}, so its foreign key may be NULL.`)
      }
      if (r.roleA || r.roleB) text.push(`Roles: ${[r.roleA && `${a} as “${r.roleA}”`, r.roleB && `${b} as “${r.roleB}”`].filter(Boolean).join(', ')} — they prefix the foreign key columns.`)
      if (r.comment) text.push(r.comment)
      push({
        kind: 'relationship',
        key: `relationship:${r.name}`,
        title: `${a} — ${b}`,
        text,
        focus: [{ kind: 'relationship', id: r.id }],
        help,
        tables: (pdm) =>
          pdm.tables.filter(
            (t) => (t.source.kind === 'relationship' && t.source.id === r.id) || t.foreignKeys.some((fk) => fk.source.kind === 'relationship' && fk.source.id === r.id),
          ),
      })
    }
    for (const i of ref.inheritances) {
      if (shown.inhs.has(i.id) || !shown.entities.has(i.parentId) || !i.childIds.every((id) => shown.entities.has(id))) continue
      shown.inhs.add(i.id)
      const parent = name(i.parentId)
      const children = i.childIds.map(name)
      const generation =
        i.generation === 'both'
          ? `Generation **both**: one table for ${parent} and one per kind; each child’s primary key is also a foreign key to ${parent}.`
          : i.generation === 'parent'
            ? `Generation **parent**: one table ${parent.toUpperCase()} with the children’s columns (nullable) and a discriminator.`
            : `Generation **children**: only the children’s tables, each with ${parent}’s columns copied in.`
      push({
        kind: 'inheritance',
        key: `inheritance:${i.name}`,
        title: `Kinds of ${parent}`,
        text: [
          `${children.map((x) => `**${x}**`).join(', ')} are kinds of **${parent}**: they share its attributes and identifier, and each adds its own data or links.`,
          i.mutuallyExclusive ? `Exclusive (×): a ${parent} is at most one of these kinds.` : `Not exclusive: one ${parent} can be several kinds at once.`,
          i.complete ? `Complete: every ${parent} is one of these kinds.` : `Incomplete (dashed): a ${parent} may be none of them.`,
          generation,
          i.comment,
        ],
        focus: [{ kind: 'inheritance', id: i.id }],
        help: 'inheritance',
        tables: (pdm) => pdm.tables.filter((t) => t.foreignKeys.some((fk) => fk.source.kind === 'inheritance' && fk.source.id === i.id) || (t.source.kind === 'entity' && t.source.id === i.parentId)),
      })
    }
  }

  push({
    kind: 'intro',
    key: 'intro',
    title: `${c.title}: read the text`,
    text: [
      'We build the model from the text, the way you would on paper: first the **things** it talks about (entities), then their **facts** (attributes), how each one is **told apart** (identifier), and how they are **linked** (relationships).',
      'Each step marks its words in the text, adds the new element to the canvas (highlighted) and shows the tables it produces. The panel on the right shows the selected element.',
    ],
    focus: [],
  })

  for (const e of order) {
    introduceEntity(e)
    introduceLinks()
  }

  const keyed = ref.entities.filter((e) => e.physicalKeys?.length)
  if (keyed.length) {
    shown.keys = true
    push({
      kind: 'keys',
      key: 'keys',
      title: 'Rules become keys',
      text: keyed.flatMap((e) => e.physicalKeys!.map((k) => `\`${k.name}\` on ${e.name.toUpperCase()}: UNIQUE (${k.columns.join(', ')})`)),
      focus: keyed.map((e) => ({ kind: 'entity' as const, id: e.id })),
      help: 'business-rule',
      tables: (pdm) => keyed.map((e) => tableOfEntity(pdm, e.id)).filter((t): t is PdmTable => !!t),
    })
  }

  if (spansOf.get('rules')?.length)
    push({
      kind: 'rules',
      key: 'rules',
      title: 'Rules outside the diagram',
      text: ['Some sentences are not entities, attributes or links: the database or the application has to enforce them (a query, a CHECK, a trigger, the app’s logic).'],
      focus: [],
      help: 'business-rule',
    })

  const final = snapshot(ref, shown)
  const tables = generatePdm(final).tables.length
  push({
    kind: 'done',
    key: 'done',
    title: 'The finished model',
    text: [
      `${final.entities.length} entities, ${final.relationships.length} relationships${final.inheritances.length ? `, ${final.inheritances.length} inheritances` : ''} → **${tables} tables**.`,
      ...c.lessons,
      'Open the **Physical** view to see all tables, the **SQL** view for the script, or the **Sandbox** to try the keys with data.',
    ],
    focus: [],
  })

  steps[0].text.unshift(`**${c.title}** in ${steps.length - 1} steps.`)
  return steps
}
