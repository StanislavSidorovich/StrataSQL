# StrataSQL — Specification

> A modern, browser-based data modeling tool: **Conceptual Data Model (CDM) → Physical Data Model (PDM) → SQL DDL**, with a built-in trainer and contextual help.
> Positioned as a lightweight, learnable alternative to SAP PowerDesigner for students and small teams.

Status: draft v0.1 (2026-10-02). Owner: Stanislav Sidorovich.

---

## 1. Why

- PowerDesigner is the course tool (NOVA IMS, DBMS 2026/27), but it has a dated UI, is only reachable through the university VPN (licenses), and gives zero guidance on *how* to model.
- Students get stuck on the same few concepts: **inheritance, dependent (weak) entities, intermediate (associative) entities, n-ary / multiple relationships**, and on translating requirement text into a model.
- StrataSQL lets you (1) model for real, (2) see instantly what each CDM decision becomes in the PDM and SQL, (3) learn through graded cases with hints.

**Non-goal:** replacing PowerDesigner for course submission. Deliverables (`.cdm`, `.pdm`, `.sql`) are still produced in PD. StrataSQL is where you think, practice and verify, then re-draw in PD.

## 2. Users

| User | Needs |
|---|---|
| Student learning modeling | Guided cases, hints, explanations of every concept with a mini example |
| Student group (shadow project) | A shared, readable model to discuss; export SQL; share by link/file |
| Anyone designing a small DB | Fast CDM → PDM → SQL without installing anything |

## 3. Product modes

1. **Editor** — free modeling: CDM canvas, generated PDM canvas, SQL preview/export.
2. **Help** — every concept has a card (definition, mini-diagram from a real case, PDM/SQL result, typical mistake). Opened from a `?` next to any property, from linter warnings, and from a searchable glossary.
3. **Trainer** — cases from `cases/` with levels (see §9).

## 4. Scope

### MVP (stages 1–3)
- CDM editor: entities, attributes, identifiers (primary + alternate), relationships with cardinalities, dependent relationships, inheritance, many-to-many.
- CDM → PDM generation (rules in §6), PDM view with light editing (rename, types, indexes/AKs).
- SQL Server DDL export (`.sql`).
- Model linter (§7) + help cards (§8).
- Save/load model as JSON file (`*.strata.json`) and to localStorage; undo/redo.

### Later
- Trainer levels 0–4 (stage 4), AI review of free-form tasks (stage 5).
- PostgreSQL dialect; run DDL + sample queries in-browser (sql.js / PGlite).
- Import/export PowerDesigner XML (`.cdm`/`.pdm` are XML) — only if cheap.
- Real-time collaboration.

### Explicitly out of scope
- Reverse engineering from live databases, stored procedures, triggers, process models, OOM/BPM, report generation, repository/versioning server.

## 5. Conceptual metamodel (what a CDM contains)

Notation: **Information Engineering (crow's foot)**, matching the PowerDesigner default used in class. Cardinality is written PD-style as `min,max` per side (`0,1` `1,1` `0,n` `1,n`).

```
Model
 ├─ Domain        name, dataType, length, precision        (reusable attribute types, e.g. Email, Phone)
 ├─ Entity        name, code, comment, position
 │   ├─ Attribute name, code, dataType|domain, mandatory, comment
 │   └─ Identifier name, isPrimary, attributes[]           (one primary, 0..n alternate)
 ├─ Relationship  entityA, entityB,
 │                cardinalityA (min,max), cardinalityB (min,max),
 │                roleA, roleB, dependentSide? (A|B|none), name
 └─ Inheritance   parent, children[], mutuallyExclusive, complete,
                  generation: "parent" | "children" | "both"
```

Rules of the metamodel:
- An entity with a **dependent** relationship is identified *through* its parent: its primary identifier = parent's identifier + its own identifier attributes (possibly none).
- An entity may depend on **several** parents (that is how an intermediate entity is built — see TV Shows `Role`).
- Many-to-many relationships are allowed in the CDM; they generate a join table. If the relationship needs attributes, the linter suggests converting it into an intermediate entity (course convention — PD "associations" are not used).
- Child entities in an inheritance inherit the parent's identifier; they may have zero own attributes (inheritance can be justified by *different relationships* alone).

## 6. CDM → PDM generation rules

| CDM construct | PDM result |
|---|---|
| Entity | Table; attributes → columns; primary identifier → PK; alternate identifier → AK (UNIQUE) |
| Relationship 1:N (`x,1` — `x,n`) | FK column(s) on the N side referencing the 1 side's PK; NOT NULL if min on the 1 side is 1 |
| Relationship 1:1 | FK on the side chosen by the user (default: the side with min 0 → nullable FK, or the dependent side) + UNIQUE on the FK |
| Relationship M:N | Join table; PK = both FKs |
| Dependent relationship | FK migrates **into the child's PK** (composite key) |
| Intermediate entity depending on A and B, no own identifier | PK = (PK_A, PK_B) → at most one row per pair |
| Intermediate entity depending on A and B, with own identifier attr | PK = (PK_A, PK_B, own_id) → several rows per pair allowed |
| Inheritance, generation = parent | One table, all child columns nullable, optional discriminator column |
| Inheritance, generation = children | One table per child, parent columns copied into each |
| Inheritance, generation = both (course default) | Parent table + child tables; child PK = FK to parent PK |
| Migrated columns used by an AK | Allowed: AKs may include FK columns that only exist in the PDM (Timetables lesson) |

Naming: table = entity code, FK column = referenced PK column name; on collision, prefix with role name. FK constraint name `FK_<CHILD>_<ROLE>_<PARENT>` (PD-like).

## 7. Linter (model checks)

Each warning links to a help card and highlights elements on the canvas.

| ID | Check | Severity |
|---|---|---|
| L01 | Entity without primary identifier | error |
| L02 | Entity without attributes and without relationships | warning |
| L03 | M:N relationship that is described with attributes in comments/name → suggest intermediate entity | info |
| L04 | **Cycle of relationships** (e.g. Episode→Show, Episode→Director, Director↔Show) → possible conflicting data | warning |
| L05 | Same attribute name in parent and child of an inheritance | warning |
| L06 | Inheritance child with no own attributes and no own relationships → inheritance not justified | info |
| L07 | Dependent entity whose identifier is empty and has only one parent (cannot distinguish rows) | error |
| L08 | Two relationships between the same pair of entities without role names | warning |
| L09 | Attribute that looks derived (`avg_`, `total_`, `count_`) → store history, compute in query | info |
| L10 | Duplicate entity / attribute names | error |

## 8. Help cards

One card per concept, stored as data (`help/*.md` or JSON). Fields:
`id, title, oneLiner, whenToUse (text signals), miniModel (tiny CDM JSON rendered as diagram), pdmResult, sqlSnippet, typicalMistake, seeAlso[], caseRefs[]`.

Initial set: entity, attribute, identifier, alternate identifier, domain, relationship, cardinality, dependent entity, intermediate entity (with/without own id), M:N, multiple relationships, n-ary relationship, inheritance (exclusive/complete/generation modes), circular relationship, derived data, lookup table vs CHECK constraint, history/temporal entity, business rule (not representable in the model).

Mini-models come from `cases/` so the student meets the same examples in class, help and trainer.

## 9. Trainer (stage 4)

Pedagogy: worked example → completion problems → faded scaffolding → independent problem.

| Level | Task | Feedback |
|---|---|---|
| 0 — Worked example | Read the case with the reference model; text spans are linked to model elements | — |
| 1 — Text tagging | Click words in the spec, tag as entity / attribute / relationship / rule-not-in-model | Immediate, per tag |
| 2 — Complete the model | Entities given; add relationships, cardinalities, dependencies, inheritance | Hint ladder: "something is missing here" → "look at the word *X*" → show the answer |
| 3 — From scratch | Build the whole CDM from the text | Structural comparison with reference + linter |
| 4 — Open business task | Free text task, no reference | AI review (stage 5) |

**Comparison with reference (level 3)** is structural, not name-based: entities matched by attribute overlap + synonyms list in the case file; then compare relationships (cardinality, dependency), inheritance, identifiers. Output: matched / missing / extra / different, each with a hint text from the case file.

## 10. Case file format

Cases live in `cases/<id>.md` (human-readable source) and later `cases/<id>.json` (machine form generated from the md). Sections:

1. Meta — id, title, source, difficulty, concepts trained
2. Specification text (verbatim)
3. Text → model mapping (signal phrase → decision)
4. Reference CDM (entities, attributes, identifiers, relationships, inheritances)
5. Expected PDM (tables, keys)
6. Key decisions & lessons (with alternatives and why)
7. Rules that cannot be represented in the model (business rules, part II)
8. Hints (per level) and synonyms

## 11. Tech stack

- **React + TypeScript + Vite**
- **@xyflow/react (React Flow)** — canvas, nodes, edges, custom crow's-foot edge markers
- **Zustand** (+ immer) — model store, undo/redo
- **Core engine as pure TS** in `src/core/` (no React): metamodel types, CDM→PDM, DDL generators, linter, comparator. Unit-tested with **Vitest**.
- Tailwind CSS; light/dark theme.
- Deploy: GitHub Pages (static). No backend for MVP.

Proposed layout:
```
src/
  core/        metamodel.ts, cdm2pdm.ts, ddl/sqlserver.ts, lint.ts, compare.ts
  ui/          canvas/, panels/, help/, trainer/
  data/        help cards, cases (json)
cases/         *.md source cases
tests/         core unit tests (one per CDM→PDM rule + per case)
```

## 12. Milestones & acceptance criteria

| Stage | Done when |
|---|---|
| 1. CDM editor | Can build the full TV Shows reference model (inheritance, dependent Scene, Role, TechnicianFunction) and save/reload it |
| 2. PDM + SQL Server DDL | TV Shows, Timetables, Ride Hailing reference CDMs generate the expected PDMs in `cases/` (unit tests); DDL runs without errors on SQL Server |
| 3. Linter + Help | L01–L10 implemented with tests; ≥ 15 help cards with mini-diagrams; `?` available on every property |
| 4. Trainer | 3 cases × levels 0–3 playable; comparator gives correct matched/missing/extra on the 3 reference models and on seeded wrong models |
| 5. AI review | Optional, behind user-provided API key |

## 13. Open questions

- Show PD-style `0,n` text labels on edges in addition to crow's feet? (default: both, toggle)
- Allow PD "associations" (Merise style) at all, or only intermediate entities? (default: only entities — matches the course)
- Language of UI and help: English first, Russian/Portuguese later?
