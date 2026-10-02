# StrataSQL — Roadmap

Stages follow SPEC §12. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. CDM editor | ✅ done (2026-10-02) · live: https://stanislavsidorovich.github.io/StrataSQL/ | Full TV Shows reference model can be built and saved/reloaded |
| 2. PDM + SQL Server DDL | ⏭ next | 3 reference CDMs generate the PDMs in `cases/`; DDL runs on SQL Server |
| 2.5 SQL sandbox | — | Generated schema runs in the browser; inserting conflicting rows shows the constraint that rejects them |
| 3. Linter + Help | — | L01–L10 with tests; ≥ 15 help cards; `?` on every property |
| 4. Trainer | — | 3 cases × levels 0–3; comparator correct on references and seeded wrong models |
| 5. AI review | — | Optional, behind a user-provided API key |

## Stage 1 — CDM editor ✅

Done:
- [x] Vite + React + TypeScript, Tailwind v4, React Flow (`@xyflow/react`), Zustand + immer, Vitest
- [x] `src/core/metamodel.ts` — CDM types (SPEC §5): domains, entities, attributes, identifiers (primary + alternate), relationships with PD-style `min,max` cardinalities, roles, dependency, inheritance (exclusive / complete / generation mode)
- [x] `src/core/ops.ts` — all edit operations, keeping the model consistent (cascading deletes, PI ⇒ mandatory, dependent ⇒ parent end `1,1`, no inheritance cycles / double parents)
- [x] `src/core/serialize.ts` — canonical `*.strata.json` (save → load → save is byte-identical), validation with field paths, integrity check
- [x] Canvas: entity boxes PD-style (`<pi>`, `<ai>`, `<M>`, type codes `VA100`, `I`…), IE crow's-foot ends with `0,n` labels, dependency triangle, roles, parallel and reflexive relationships, inheritance half-circle (× = exclusive, dashed = incomplete)
- [x] Create: double-click canvas → entity; drag from ● handle onto another entity → relationship or inheritance (toolbar toggle)
- [x] Properties panel for model/domains, entity (attributes, identifiers, links), relationship (ends, cardinalities, plain-language reading, dependency, swap), inheritance
- [x] Undo/redo (typing coalesced into one step), Delete, Esc, Ctrl+S; autosave to localStorage; Open/Save file; TV Shows example; light/dark theme
- [x] Deploy: GitHub Actions runs tests + build and publishes to GitHub Pages on every push to `main`
- [x] Tests: 33 unit tests incl. `tests/tv-shows.test.ts` (acceptance); UI scenario checked in a browser (build from scratch, undo/redo, reload, file round-trip, bad file)

Known gaps carried forward:
- Decimal precision (`DC10,2`) has no input yet — only length.
- No multi-select delete; no copy/paste; no auto-layout.
- Inheritance symbol shape follows PD loosely (exact PD look to be checked against class screenshots).

## Stage 2 — PDM + SQL Server DDL ⏭

- [ ] `src/core/pdm.ts` — PDM types: tables, columns (SQL type, nullable), PK, AKs, FKs (with `FK_<CHILD>_<ROLE>_<PARENT>` names)
- [ ] `src/core/cdm2pdm.ts` — one function per rule of SPEC §6, each with a Vitest test:
  - [ ] entity → table, PI → PK, AI → AK
  - [ ] 1:N → FK on the N side, NOT NULL when min = 1
  - [ ] 1:1 → FK on the chosen side + UNIQUE
  - [ ] M:N → join table, PK = both FKs
  - [ ] dependent → FK migrates into the child PK (several parents → composite PK)
  - [ ] inheritance generation = parent / children / both
  - [ ] FK naming, role prefix on column collisions
  - [ ] AKs over migrated columns (Timetables)
- [ ] `src/core/ddl/sqlserver.ts` — CREATE TABLE / PK / UNIQUE / FK, conceptual → SQL Server types
- [ ] Reference CDMs for Timetables and Ride Hailing as examples (`src/data/examples/`)
- [ ] Regression tests: 3 cases generate the PDM tables/keys listed in `cases/*.md` §5
- [ ] UI: PDM view (read-only canvas or table list) + SQL preview with copy/download `.sql`
- [ ] Check the generated DDL on a real SQL Server (or Azure SQL Edge in Docker)
- [ ] Export the diagram as PNG / SVG (for reports and group discussion)
- [ ] Cross-check: paste generated DDL into DrawDB / dbdiagram (both import SQL) and compare tables until our PDM view exists

## Stage 2.5 — SQL sandbox (practice: see constraints work)

Why: the fastest way to *understand* a key is to watch it reject bad data — e.g. a second role for the same actor in the same scene, or an episode directed by someone who is not a director of that show.
- [ ] In-browser engine: sql.js (SQLite) or PGlite (Postgres); second DDL dialect for it (PK / FK / UNIQUE / CHECK behave the same as SQL Server for this purpose)
- [ ] Run the generated schema; small grid to insert rows per table; show which constraint failed and link it back to the CDM element that produced it
- [ ] Per-case scripted "try this" scenarios (valid insert, then the conflicting one) for TV Shows, Timetables, Ride Hailing
- [ ] Free SQL console for SELECT queries (e.g. rating average from history in Ride Hailing)

## Stage 3+ (later)

- Live "model issues" panel (linter results update while editing; UX reference: DrawDB issues panel)
- Optional text mode: write the CDM as text, diagram updates live (idea from dbdiagram.io / DBML) — useful for fast input and trainer tasks

- Linter L01–L10 (SPEC §7) with canvas highlighting; help cards (SPEC §8) with mini-diagrams from cases
- Trainer levels 0–3, structural comparator

## Positioning vs free alternatives (reviewed 2026-10-02)

DrawDB, dbdiagram.io, DBeaver CE, draw.io and ChartDB are all **table-level (PDM)** tools: none has a conceptual layer (entities vs tables, dependent entities with key migration, intermediate entities, inheritance generation modes), a modeling linter, explanations or a trainer. StrataSQL's niche is **learning CDM → PDM** in PowerDesigner conventions — not a general ER editor; don't compete on generic table editing. Borrowed ideas: PNG/SVG export, live issues panel, text mode, in-browser SQL sandbox. Check licenses before reusing any code (some are copyleft).

## Decisions (settled 2026-10-02)

The owner's guidance: the course's "discussed in class" points are not critical — choose what is clearest for students; own examples are welcome. Decisions are marked ✱ in `cases/*.md`.

1. TV Shows: Episode links to **ShowDirector** (1,1 — 0,n), not to Director → no cycle; in the PDM `show_id` is one shared column. The cycle version becomes a seeded wrong model for the trainer / linter L04.
2. TV Shows: Person inheritance is **non-exclusive**, complete, generation = both.
3. TV Shows: TechnicianFunction keeps its **own `function_no`**; the `Function` lookup version is an alternative for help cards.
4. Table codes follow the **PowerDesigner default** (name upper-cased, spaces → `_`). Reference models name entities so codes match the cases (`Car Shift` → `CAR_SHIFT`).
5. Column collisions in the PDM: same origin column via different neighbours → shared column; two links to the same neighbour → role prefix (SPEC §6).

Still open (decide in stage 2, same principle — clearest for students):
- Timetables: Class → TeachingAssignment (course + professor) and ClassSlot per 30-min slot are kept as in the case unless a simpler variant teaches the AK lesson better.
- SPEC §13: PD-style `0,n` labels shown by default (toggle later); associations not supported; UI in English first.
