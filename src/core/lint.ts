// Model linter — SPEC §7. Pure function of the CDM: every issue names the rule, the elements to
// highlight and the help card that explains the concept.

import { foreignKeyHolder, generatePdm, relationshipKind } from './cdm2pdm'
import { entityOf, primaryIdentifier, type Entity, type Id, type Model, type Relationship } from './metamodel'
import { ancestorsOf } from './ops'
import type { Pdm } from './pdm'

export type Severity = 'error' | 'warning' | 'info'

export type RuleId = 'L01' | 'L02' | 'L03' | 'L04' | 'L05' | 'L06' | 'L07' | 'L08' | 'L09' | 'L10'

export type LintTarget =
  | { kind: 'entity'; id: Id }
  | { kind: 'relationship'; id: Id }
  | { kind: 'inheritance'; id: Id }
  | { kind: 'attribute'; entityId: Id; attributeId: Id }

export interface LintIssue {
  rule: RuleId
  severity: Severity
  message: string
  /** Elements to highlight; the first one is selected when the issue is clicked. */
  targets: LintTarget[]
  /** Help card id. */
  help: string
}

export const RULES: Record<RuleId, { title: string; severity: Severity; help: string }> = {
  L01: { title: 'Entity without primary identifier', severity: 'error', help: 'identifier' },
  L02: { title: 'Isolated entity', severity: 'warning', help: 'entity' },
  L03: { title: 'Many-to-many relationship with data', severity: 'info', help: 'intermediate-entity' },
  L04: { title: 'Cycle of relationships', severity: 'warning', help: 'circular-relationship' },
  L05: { title: 'Attribute repeated in parent and child', severity: 'warning', help: 'inheritance' },
  L06: { title: 'Inheritance child not justified', severity: 'info', help: 'inheritance' },
  L07: { title: 'Dependent entity cannot tell its rows apart', severity: 'error', help: 'dependent-entity' },
  L08: { title: 'Repeated relationship without roles', severity: 'warning', help: 'multiple-relationships' },
  L09: { title: 'Derived attribute', severity: 'info', help: 'derived-data' },
  L10: { title: 'Duplicate name', severity: 'error', help: 'names-and-codes' },
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/** Runs every check. `pdm` may be passed when the caller already generated it. */
export function lintModel(m: Model, pdm: Pdm = generatePdm(m)): LintIssue[] {
  const ctx = new Context(m)
  const issues = [
    ...l01(ctx),
    ...l02(ctx),
    ...l03(ctx),
    ...l04(ctx, pdm),
    ...l05(ctx),
    ...l06(ctx),
    ...l07(ctx),
    ...l08(ctx),
    ...l09(ctx),
    ...l10(ctx),
  ]
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule))
}

/** Does the issue point at this element (directly, or at one of its attributes)? */
export function issueTouches(issue: LintIssue, kind: 'entity' | 'relationship' | 'inheritance', id: Id): boolean {
  return issue.targets.some((t) => (t.kind === 'attribute' ? kind === 'entity' && t.entityId === id : t.kind === kind && t.id === id))
}

function issue(rule: RuleId, message: string, targets: LintTarget[], help = RULES[rule].help): LintIssue {
  return { rule, severity: RULES[rule].severity, message, targets, help }
}

class Context {
  readonly byId = new Map<Id, Entity>()
  constructor(readonly m: Model) {
    for (const e of m.entities) this.byId.set(e.id, e)
  }
  name(id: Id): string {
    return this.byId.get(id)?.name ?? '?'
  }
  relationshipsOf(id: Id): Relationship[] {
    return this.m.relationships.filter((r) => r.entityA === id || r.entityB === id)
  }
  /** Relationships in which `id` is the dependent (identified-through) side. */
  parentsOf(id: Id): Relationship[] {
    return this.m.relationships.filter((r) => r.dependentSide && entityOf(r, r.dependentSide) === id)
  }
  inInheritance(id: Id): boolean {
    return this.m.inheritances.some((i) => i.parentId === id || i.childIds.includes(id))
  }
  isChild(id: Id): boolean {
    return this.m.inheritances.some((i) => i.childIds.includes(id))
  }
}

const words = (text: string | undefined) => (text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

// ---------------------------------------------------------------- L01 primary identifier

function l01(ctx: Context): LintIssue[] {
  return ctx.m.entities
    .filter((e) => !(primaryIdentifier(e)?.attributeIds.length) && ctx.parentsOf(e.id).length === 0 && !ctx.isChild(e.id))
    .map((e) =>
      issue(
        'L01',
        `${e.name} has no primary identifier, so its table gets no primary key and two rows could be identical. ` +
          'Tick PI on an attribute (e.g. an id), or make the entity dependent on the entity that identifies it.',
        [{ kind: 'entity', id: e.id }],
      ),
    )
}

// ---------------------------------------------------------------- L02 isolated entity

function l02(ctx: Context): LintIssue[] {
  return ctx.m.entities
    .filter((e) => e.attributes.length === 0 && ctx.relationshipsOf(e.id).length === 0 && !ctx.inInheritance(e.id))
    .map((e) =>
      issue('L02', `${e.name} has no attributes and no relationships — it stores nothing. Add attributes, link it, or delete it.`, [
        { kind: 'entity', id: e.id },
      ]),
    )
}

// ---------------------------------------------------------------- L03 M:N with data

/** Words that describe data about a pair rather than a plain link. */
const PAIR_DATA_WORDS = new Set([
  'date', 'time', 'when', 'since', 'until', 'start', 'end', 'year', 'quantity', 'qty', 'amount', 'price', 'cost',
  'role', 'function', 'hours', 'grade', 'score', 'rating', 'status', 'salary', 'percentage', 'note', 'attribute', 'attributes',
])

function l03(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  for (const r of ctx.m.relationships) {
    if (relationshipKind(r) !== 'many-to-many') continue
    const hits = [...new Set([...words(r.name), ...words(r.comment), ...words(r.roleA), ...words(r.roleB)].filter((w) => PAIR_DATA_WORDS.has(w)))]
    if (hits.length === 0) continue
    out.push(
      issue(
        'L03',
        `${r.name || 'This relationship'} (${ctx.name(r.entityA)} — ${ctx.name(r.entityB)}) is many-to-many, but its ` +
          `name or comment mentions ${hits.map((w) => `“${w}”`).join(', ')}: data about the pair. A relationship cannot hold ` +
          `attributes — replace it with an intermediate entity that depends on both ${ctx.name(r.entityA)} and ${ctx.name(r.entityB)}.`,
        [{ kind: 'relationship', id: r.id }],
      ),
    )
  }
  return out
}

// ---------------------------------------------------------------- L04 cycles

interface CycleEdge {
  rel: Relationship
  from: Id
  to: Id
}

/**
 * Simple cycles of the relationship graph (inheritance ignored, parallel relationships between the
 * same pair counted once): for every edge outside a spanning forest, the shortest cycle through it.
 */
export function relationshipCycles(m: Model): CycleEdge[][] {
  const pairs = new Map<string, Relationship>()
  for (const r of m.relationships) {
    if (r.entityA === r.entityB) continue
    const k = r.entityA < r.entityB ? `${r.entityA}|${r.entityB}` : `${r.entityB}|${r.entityA}`
    if (!pairs.has(k)) pairs.set(k, r)
  }
  const edges = [...pairs.values()]
  const adj = new Map<Id, { to: Id; rel: Relationship }[]>()
  for (const r of edges) {
    adj.set(r.entityA, [...(adj.get(r.entityA) ?? []), { to: r.entityB, rel: r }])
    adj.set(r.entityB, [...(adj.get(r.entityB) ?? []), { to: r.entityA, rel: r }])
  }

  // Spanning forest.
  const treeEdges = new Set<Relationship>()
  const seen = new Set<Id>()
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    seen.add(start)
    const queue = [start]
    while (queue.length) {
      const n = queue.shift()!
      for (const { to, rel } of adj.get(n) ?? []) {
        if (seen.has(to)) continue
        seen.add(to)
        treeEdges.add(rel)
        queue.push(to)
      }
    }
  }

  const cycles: CycleEdge[][] = []
  const keys = new Set<string>()
  for (const closing of edges) {
    if (treeEdges.has(closing)) continue
    // Shortest path from B back to A without the closing edge.
    const prev = new Map<Id, { from: Id; rel: Relationship }>()
    const queue = [closing.entityB]
    const visited = new Set([closing.entityB])
    while (queue.length && !visited.has(closing.entityA)) {
      const n = queue.shift()!
      for (const { to, rel } of adj.get(n) ?? []) {
        if (rel === closing || visited.has(to)) continue
        visited.add(to)
        prev.set(to, { from: n, rel })
        queue.push(to)
      }
    }
    if (!visited.has(closing.entityA)) continue
    const cycle: CycleEdge[] = [{ rel: closing, from: closing.entityA, to: closing.entityB }]
    const back: CycleEdge[] = []
    for (let n = closing.entityA; n !== closing.entityB; ) {
      const p = prev.get(n)!
      back.push({ rel: p.rel, from: p.from, to: n })
      n = p.from
    }
    cycle.push(...back.reverse())
    const key = cycle.map((c) => c.rel.id).sort().join(',')
    if (keys.has(key)) continue
    keys.add(key)
    cycles.push(cycle)
  }
  return cycles
}

function l04(ctx: Context, pdm: Pdm): LintIssue[] {
  const out: LintIssue[] = []
  for (const cycle of relationshipCycles(ctx.m)) {
    const nodes = cycle.map((c) => c.from)
    const n = nodes.length
    // Edge i joins nodes[i] and nodes[i+1]. Orientation: the FK holder references the other end.
    const holder = cycle.map((c) => {
      const side = foreignKeyHolder(c.rel)
      return side ? entityOf(c.rel, side) : null // null: many-to-many, a join table references both
    })
    const pointsAway = (i: number, node: Id) => holder[i] === node
    const sources: number[] = [] // node indexes whose two cycle edges both start at the node
    const sinks: number[] = []
    let joinTables = 0
    for (let i = 0; i < n; i++) {
      const before = (i - 1 + n) % n
      const node = nodes[i]
      if (pointsAway(before, node) && pointsAway(i, node)) sources.push(i)
      if (!pointsAway(before, node) && !pointsAway(i, node)) sinks.push(i)
    }
    for (const h of holder) if (h === null) joinTables++

    const names = nodes.map((id) => ctx.name(id))
    const loop = [...names, names[0]].join(' – ')
    const targets: LintTarget[] = [...cycle.map((c): LintTarget => ({ kind: 'relationship', id: c.rel.id })), ...nodes.map((id): LintTarget => ({ kind: 'entity', id }))]

    if (sources.length + joinTables === 0) {
      out.push(
        issue(
          'L04',
          `Circular references ${[...names, names[0]].join(' → ')}: every table points at the next one. Rows can only be ` +
            'inserted if one of these links is optional, and the loop can describe facts that contradict each other. ' +
            'Check that every link is needed.',
          targets,
        ),
      )
      continue
    }
    if (sources.length === 1 && joinTables === 0) {
      // A "diamond": one entity reaches another one along two paths. Safe when the PDM shares the key column.
      const s = sources[0]
      const before = (s - 1 + n) % n
      if (closedBySharedColumn(pdm, cycle[before].rel.id, cycle[s].rel.id)) continue
      const sink = nodes[sinks[0]]
      const pathOne: string[] = []
      for (let i = s; nodes[i] !== sink; i = (i + 1) % n) pathOne.push(names[i])
      const pathTwo: string[] = []
      for (let i = s; nodes[i] !== sink; i = (i - 1 + n) % n) pathTwo.push(names[i])
      const sinkName = ctx.name(sink)
      out.push(
        issue(
          'L04',
          `Cycle ${loop}: ${names[s]} reaches ${sinkName} along two paths (${[...pathOne, sinkName].join(' → ')} and ` +
            `${[...pathTwo, sinkName].join(' → ')}), and nothing forces them to reach the same ${sinkName}. ` +
            `Conflicting data is possible. Make the entities on one path dependent so ${sinkName}'s key migrates and is shared, or drop the redundant link.`,
          targets,
        ),
      )
      continue
    }
    out.push(
      issue(
        'L04',
        `Cycle ${loop}: the same facts are linked along two paths that nothing keeps in agreement — conflicting data is ` +
          'possible (TV Shows: an episode directed by someone who is not a director of its show). Usually one link should ' +
          'point to the intermediate entity instead, so a shared key closes the cycle.',
        targets,
      ),
    )
  }
  return out
}

/** Do the FKs generated for these two relationships, in one table, share a column? */
function closedBySharedColumn(pdm: Pdm, relOne: Id, relTwo: Id): boolean {
  for (const t of pdm.tables) {
    const one = t.foreignKeys.filter((f) => f.source.kind === 'relationship' && f.source.id === relOne)
    const two = t.foreignKeys.filter((f) => f.source.kind === 'relationship' && f.source.id === relTwo)
    if (one.some((a) => two.some((b) => a.columns.some((c) => b.columns.includes(c))))) return true
  }
  return false
}

// ---------------------------------------------------------------- L05 / L06 inheritance

function l05(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  for (const e of ctx.m.entities) {
    const ancestors = ancestorsOf(ctx.m, e.id).map((id) => ctx.byId.get(id)).filter((x): x is Entity => !!x)
    for (const a of e.attributes) {
      const owner = ancestors.find((p) => p.attributes.some((pa) => pa.name.trim().toLowerCase() === a.name.trim().toLowerCase()))
      if (!owner)
        continue
      out.push(
        issue(
          'L05',
          `${e.name}.${a.name} repeats ${owner.name}.${a.name}. A child already inherits every attribute of its parent — ` +
            `keep ${a.name} only in ${owner.name}, or rename it if it means something else.`,
          [{ kind: 'attribute', entityId: e.id, attributeId: a.id }, { kind: 'entity', id: owner.id }],
        ),
      )
    }
  }
  return out
}

function l06(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  for (const inh of ctx.m.inheritances)
    for (const c of inh.childIds) {
      const child = ctx.byId.get(c)
      if (!child || child.attributes.length > 0 || ctx.relationshipsOf(c).length > 0) continue
      if (ctx.m.inheritances.some((i) => i.parentId === c)) continue
      out.push(
        issue(
          'L06',
          `${child.name} inherits from ${ctx.name(inh.parentId)} but has no own attributes and no own relationships, so ` +
            `nothing tells it apart from ${ctx.name(inh.parentId)}. Inheritance is justified by different attributes or ` +
            `different relationships; otherwise a type attribute in ${ctx.name(inh.parentId)} is enough.`,
          [{ kind: 'entity', id: c }, { kind: 'inheritance', id: inh.id }],
        ),
      )
    }
  return out
}

// ---------------------------------------------------------------- L07 dependent entity without own id

function l07(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  for (const e of ctx.m.entities) {
    const parents = ctx.parentsOf(e.id)
    if (parents.length !== 1 || primaryIdentifier(e)?.attributeIds.length) continue
    const r = parents[0]
    const own = r.dependentSide === 'A' ? r.cardinalityA : r.cardinalityB
    if (own.max !== 'n') continue // 1:1 dependent (a trip's rating): the parent's key is enough
    const parent = ctx.name(entityOf(r, r.dependentSide === 'A' ? 'B' : 'A'))
    out.push(
      issue(
        'L07',
        `${e.name} depends only on ${parent} and has no identifier of its own, so its key is just ${parent}'s key: ` +
          `one ${parent} could have only one ${e.name}, yet the relationship says many. Add an own identifier attribute ` +
          `(e.g. an order number), or make the relationship one-to-one.`,
        [{ kind: 'entity', id: e.id }, { kind: 'relationship', id: r.id }],
      ),
    )
  }
  return out
}

// ---------------------------------------------------------------- L08 roles

function l08(ctx: Context): LintIssue[] {
  const groups = new Map<string, Relationship[]>()
  for (const r of ctx.m.relationships) {
    const k = r.entityA < r.entityB ? `${r.entityA}|${r.entityB}` : `${r.entityB}|${r.entityA}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: LintIssue[] = []
  for (const group of groups.values()) {
    const reflexive = group[0].entityA === group[0].entityB
    if (group.length < 2 && !reflexive) continue
    for (const r of group) {
      if (r.roleA?.trim() || r.roleB?.trim()) continue
      const what = reflexive
        ? `${ctx.name(r.entityA)} is linked to itself`
        : `${ctx.name(r.entityA)} and ${ctx.name(r.entityB)} are linked ${group.length} times`
      out.push(
        issue(
          'L08',
          `${what}, and ${r.name || 'this relationship'} has no role names. Roles say what each link means ` +
            `(“origin” / “destination”, “manager”) and name the FK columns (origin_stop_id, destination_stop_id).`,
          [{ kind: 'relationship', id: r.id }],
        ),
      )
    }
  }
  return out
}

// ---------------------------------------------------------------- L09 derived attributes

const DERIVED_FIRST = new Set(['avg', 'average', 'total', 'sum', 'count', 'num', 'nb', 'number', 'cnt'])

function l09(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  for (const e of ctx.m.entities)
    for (const a of e.attributes) {
      const w = words(a.name.replace(/([a-z])([A-Z])/g, '$1_$2'))
      const aggregate = DERIVED_FIRST.has(w[0]) && w.length > 1 && !(w[0] === 'number' && w[1] !== 'of')
      const age = w.length === 1 && w[0] === 'age'
      if (!aggregate && !age) continue
      out.push(
        issue(
          'L09',
          age
            ? `${e.name}.${a.name} changes every year on its own. Store the birth date and compute the age in a query.`
            : `${e.name}.${a.name} looks derived — it can be computed from other data (COUNT, SUM, AVG in a query). ` +
                'Storing it means keeping it in sync by hand; store the history it is computed from instead.',
          [{ kind: 'attribute', entityId: e.id, attributeId: a.id }],
        ),
      )
    }
  return out
}

// ---------------------------------------------------------------- L10 duplicate names

function l10(ctx: Context): LintIssue[] {
  const out: LintIssue[] = []
  const norm = (s: string) => s.trim().toLowerCase()
  const dupes = <T>(items: T[], key: (x: T) => string) => {
    const by = new Map<string, T[]>()
    for (const x of items) {
      const k = key(x)
      if (k) by.set(k, [...(by.get(k) ?? []), x])
    }
    return [...by.values()].filter((g) => g.length > 1)
  }

  for (const g of dupes(ctx.m.entities, (e) => norm(e.name)))
    out.push(issue('L10', `${g.length} entities are named “${g[0].name}”. Every entity needs its own name.`, g.map((e) => ({ kind: 'entity', id: e.id }))))
  for (const g of dupes(ctx.m.entities, (e) => norm(e.code)))
    if (new Set(g.map((e) => norm(e.name))).size > 1)
      out.push(
        issue(
          'L10',
          `${g.map((e) => e.name).join(' and ')} have the same code ${g[0].code}, so they would generate two tables with one name.`,
          g.map((e) => ({ kind: 'entity', id: e.id })),
        ),
      )
  for (const e of ctx.m.entities)
    for (const g of dupes(e.attributes, (a) => norm(a.name)))
      out.push(
        issue(
          'L10',
          `${e.name} has ${g.length} attributes named “${g[0].name}”: they would become two columns with one name.`,
          g.map((a) => ({ kind: 'attribute', entityId: e.id, attributeId: a.id })),
          'attribute',
        ),
      )
  return out
}
