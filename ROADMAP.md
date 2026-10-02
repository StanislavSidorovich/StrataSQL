# StrataSQL — Roadmap

Stages follow SPEC §12. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. CDM editor | ✅ done (2026-10-02) | Full TV Shows reference model can be built and saved/reloaded |
| 2. PDM + SQL Server DDL | ⏭ next | 3 reference CDMs generate the PDMs in `cases/`; DDL runs on SQL Server |
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

## Stage 3+ (later)

- Linter L01–L10 (SPEC §7) with canvas highlighting; help cards (SPEC §8) with mini-diagrams from cases
- Trainer levels 0–3, structural comparator
- Deploy to GitHub Pages (workflow + enabling Pages in the repo settings)

## Open questions to settle with class notes

Marked **(?)** in the cases — not treated as ground truth until confirmed:
1. TV Shows: does Episode link to `Director` directly (cycle, as in the current example) or to `ShowDirector`?
2. TV Shows: is the Person inheritance non-exclusive (a person may act and direct)?
3. TV Shows: TechnicianFunction — own `function_no` or a `Function` lookup entity in the PK?
4. Timetables: does Class reference `TeachingAssignment` (course + professor) or Course directly? Is `ClassSlot` per 30-min slot the expected solution?
5. Entity code convention: `CAR_SHIFT` (ride-hailing) vs `PROGRAMCOURSE` (timetables) — current default is PD's (name upper-cased, spaces → `_`), so `CarShift` → `CARSHIFT`.
6. SPEC §13: PD-style `0,n` labels are on by default (no toggle yet); associations not supported (intermediate entities only); UI language English first.
