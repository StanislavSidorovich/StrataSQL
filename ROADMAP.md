# StrataSQL — Roadmap

Stages follow SPEC §12. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. CDM editor | ✅ done (2026-10-02) · live: https://stanislavsidorovich.github.io/StrataSQL/ | Full TV Shows reference model can be built and saved/reloaded |
| 2. PDM + SQL Server DDL | ✅ done (2026-10-02) | 3 reference CDMs generate the PDMs in `cases/`; DDL runs on SQL Server |
| 2.5 SQL sandbox | ✅ done (2026-10-02) | Generated schema runs in the browser; inserting conflicting rows shows the constraint that rejects them |
| 3. Linter + Help | ✅ done (2026-10-02) | L01–L10 with tests; ≥ 15 help cards; `?` on every property |
| 4. Trainer | ⏭ next | 3 cases × levels 0–3; comparator correct on references and seeded wrong models |
| 5. AI review | — | Optional, behind a user-provided API key |

**Where we are (2026-10-02):** installable and offline-capable (PWA); usable today for building a CDM, getting the PDM + SQL Server DDL, testing keys in the sandbox, and getting feedback on your own model: the linter checks it live and every warning and property links to a help card. Next is stage 4 (trainer), about 1–2 sprints, which completes the learning loop. Stage 5 is optional.

**Distribution:** GitHub Pages stays the only channel. It works on Windows, macOS and Linux in any modern browser, with no install and no VPN. A local .bat/.exe would need a separate build per OS (and unsigned apps are blocked by macOS Gatekeeper). Since 2026-10-02 the page is also an installable **PWA**: it works offline after the first visit (Sandbox included) and can be installed from Chrome/Edge or added to the Dock from Safari.

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

## Stage 2 — PDM + SQL Server DDL ✅

Done:
- [x] `src/core/pdm.ts` — PDM types: tables, columns (conceptual type, nullable, origin, migrated flag), PK, AKs, FKs, CHECKs, generation notes; every element points back to the CDM element that produced it
- [x] `src/core/cdm2pdm.ts` — `generatePdm(model)`, one test group per rule of SPEC §6 (`tests/cdm2pdm.test.ts`, 24 tests):
  - [x] entity → table, PI → PK, AI → AK
  - [x] 1:N → FK on the N side, NOT NULL when min = 1
  - [x] 1:1 → FK on the chosen side + UNIQUE (new `Relationship.foreignKeySide`; default = the side that must have a partner)
  - [x] M:N → join table, PK = both FKs (reflexive → role prefixes)
  - [x] dependent → FK migrates into the child PK (several parents → composite PK; transitive)
  - [x] inheritance generation = parent (nullable child columns, discriminator + CHECK) / children (parent columns copied) / both (child PK = FK to parent)
  - [x] FK naming `FK_<CHILD>_<ROLE>_<PARENT>`; same neighbour twice / reflexive → role prefix; same origin via different neighbours → one shared column (with a note); name clash → renamed migrated column
  - [x] AKs over migrated columns (new `Entity.physicalKeys`, edited in the Physical view)
- [x] `src/core/ddl/sqlserver.ts` — CREATE TABLE with PK / UNIQUE / CHECK, FKs as ALTER TABLE, optional DROP section, PD type mapping, reserved words bracketed
- [x] Reference CDMs `src/data/examples/timetables.ts`, `ride-hailing.ts` (in the Examples menu)
- [x] Regression tests `tests/cases-pdm.test.ts`: the 3 cases generate the PDMs of `cases/*.md` §5
- [x] UI: view switch Conceptual / Physical / SQL; PDM canvas (tables at the entity positions, migrated columns highlighted, `<pk,fk1>` flags); table panel (origin of every column, keys, notes, "keys over columns" editor); "In the physical model" section in entity and relationship panels; 1:1 FK side choice; SQL view with copy / download `.sql`
- [x] DDL checked on SQL Server 2022 (local Developer edition, scratch database dropped afterwards): all 3 scripts run, also re-run with DROP; the TV Shows FK rejects an episode directed by a non-director of the show, `AK_ROOM_TIME` rejects a room double-booking
- [x] Export the diagram (CDM or PDM) as PNG / SVG (`html-to-image`, MIT)
- [x] ~~Cross-check in DrawDB / dbdiagram~~ — superseded by the own PDM view and the real SQL Server check
- Tests: 77 unit tests

Known gaps carried forward:
- PDM table positions follow the CDM layout; moving tables in the Physical view is not saved.
- With two references to different tables that carry the same origin column (e.g. an entity depending on Actor and Director, both children of Person) the column is shared, as SPEC §6 says; roles don't split it. Candidate for a linter hint.
- UNIQUE over nullable columns (inheritance generation = parent) allows only one NULL in SQL Server — noted in the PDM, no filtered index generated.
- ~~Decimal precision still has no input in the attribute grid~~ — fixed 2026-10-02: Decimal/Money take `10,2` in the attribute grid and in domains.

## Stage 2.5 — SQL sandbox ✅

Why: the fastest way to *understand* a key is to watch it reject bad data — e.g. a second role for the same actor in the same scene, or an episode directed by someone who is not a director of that show.

Done:
- [x] Engine: **PGlite** (PostgreSQL in WebAssembly, Apache-2.0), loaded only when the Sandbox tab opens (~4 MB gzip, starts in ~3 s). Chosen over sql.js because Postgres errors name the constraint (`pk_role`, `fk_…`) and it enforces types and `varchar(n)`; SQLite does neither.
- [x] `src/core/ddl/postgres.ts` — second DDL dialect (unquoted identifiers, so `episode` and `EPISODE` both work in the console)
- [x] `src/core/sandbox.ts` — engine-agnostic: reset schema, run, INSERT/DELETE/SELECT builders, `explainError` → PK / AK / FK (insert and delete) / CHECK / NOT NULL / type, with plain-language reason and the CDM element that produced the constraint
- [x] UI: view **Sandbox** — table tabs with row counts, grid with an insert row (empty = NULL, `*` = NOT NULL) and delete per row, rejected columns highlighted; SQL console (Ctrl+Enter); "Last statement" with the reason and a link to the CDM element; DB recreated automatically when the schema changes
- [x] `src/data/scenarios.ts` — "Try this" scenarios: TV Shows (director of the show; one role per actor per scene), Timetables (AK_ROOM_TIME / AK_PROFESSOR_TIME / AK_COURSE_SHIFT_TIME, assignment FK), Ride Hailing (licence AK, optional shift, one rating per trip, missing score CHECK, average rating query). A step that behaves differently from the reference is flagged ("your model differs")
- [x] Tests `tests/sandbox.test.ts` (21): dialect, statements, every violation kind, and every scenario step against the generated schema (acceptance). 98 tests total
- [x] Checked in the production build (Playwright): scenario run, duplicate PK from the grid, console SELECT, link back to the CDM

Known gaps carried forward:
- Sandbox data lives only in the page (not saved); changing the model empties it.
- Postgres, not SQL Server: UNIQUE allows many NULLs (SQL Server: one); T-SQL syntax (`TOP`, `GETDATE()`) does not run in the console.
- Ride Hailing has no CHECK for `score` — the scenario shows it on purpose; a CHECK editor for attributes (domains with value ranges) is a candidate for stage 3.

## Stage 3 — Linter + Help ✅

Done:
- [x] `src/core/lint.ts` — `lintModel(model)` → issues with rule, severity, message, the elements to highlight, and a help card. One test group per rule in `tests/lint.test.ts` (23 tests):
  - [x] L01 no primary identifier (dependent entities and inheritance children are exempt)
  - [x] L02 entity without attributes, relationships or inheritance
  - [x] L03 many-to-many whose name, comment or roles mention pair data (date, grade, role…) → intermediate entity
  - [x] L04 cycles: shortest cycle per non-tree edge, with each edge oriented FK holder → referenced. A "diamond" (one source) is accepted when the PDM shares a key column between both FKs (TV Shows reference: `show_id`); otherwise there are two paths that can disagree. Two or more sources = the classic conflict (Episode → Director). A directed loop = circular references
  - [x] L05 attribute repeated in a parent or ancestor; L06 child with no own attributes or relationships
  - [x] L07 dependent entity, one parent, no own id, **many** side (a 1:1 dependent like DriverRating is fine)
  - [x] L08 repeated or reflexive relationship without roles; L09 derived (avg_, total_, count_, number_of_, age); L10 duplicate entity names, codes and attribute names
  - [x] The 3 reference models have **zero** issues (acceptance); the TV Shows cycle version is flagged by L04
- [x] `src/data/help.ts` — 22 help cards (21 with a mini-model): entity, attribute, identifier, alternate identifier, domain, relationship, cardinality, 1:1, dependent, intermediate (with and without own id), M:N, multiple and reflexive relationships, n-ary, inheritance and its generation, cycle, derived data, lookup vs CHECK, history, business rules, names and codes. A card's PDM and SQL are **generated** from its mini-model, so they cannot go stale. Tests in `tests/help.test.ts` check that every mini-model is consistent, lint-clean and produces SQL, and that every link points to an existing card
- [x] UI: "Model check" dock under the CDM canvas (live counts, list, click → select + highlight every element of the issue). Entities get a red or amber border and a dot whose tooltip lists the issues, and relationship lines get the same colours. Each element's issues also show at the top of its panel
- [x] Help drawer: searchable glossary; a card shows its text, the mini-diagram (static SVG with the same IE symbols), the generated tables and DDL, text signals, the typical mistake, case references and "see also". "Open as model" loads the example (Ctrl+Z restores yours). `?` on every panel property and on every issue; "? Help" in the toolbar
- [x] Checked in the browser (Playwright): TV Shows clean → Episode→Director gives L04 with 4 entities highlighted → the `?` opens the cycle card; glossary search; "Open as model"; removing the PI from Scene gives L07 live. No console errors. 146 tests in total

Known gaps carried forward:
- L03 is a keyword heuristic (English words only).
- L04 reports one shortest cycle per independent loop, not every possible cycle.
- Help cards are English only; the mini-diagram text is small in a narrow drawer.

## Stage 3+ (later)

- Optional text mode: write the CDM as text, diagram updates live (idea from dbdiagram.io / DBML) — useful for fast input and trainer tasks

- Trainer levels 0–3, structural comparator (stage 4)

## PWA + tails ✅ (2026-10-02)

- [x] Installable PWA without new dependencies: `public/manifest.webmanifest`, icons generated by `scripts/make-icons.mjs`, service worker `src/pwa/sw.js`. A small Vite plugin (`vite.config.ts`) writes the list of every built file into it, so the first visit precaches the app **and PGlite** (~17 MB, ~4 MB gzip) — the Sandbox works offline too
- [x] Strategy: page = network first, cached shell offline; hashed assets = cache first (`ignoreVary`, since module scripts send `Origin`). No automatic `skipWaiting`: a new version shows **Update** in the toolbar, the click activates it and reloads (the model is kept). Dev mode registers no worker
- [x] Autosave flushes on `pagehide`, so closing or updating within the 300 ms debounce keeps the last edit
- [x] Decimal/Money size input `10,2` (`parseSize` in core, tested) for attributes and domains
- [x] Checked in the production build (Playwright): precache of 16 files, offline reload restores the model, PGlite starts offline with the TV Shows schema, Update button → new version active

## Positioning vs free alternatives (reviewed 2026-10-02)

DrawDB, dbdiagram.io, DBeaver CE, draw.io and ChartDB are all **table-level (PDM)** tools: none has a conceptual layer (entities vs tables, dependent entities with key migration, intermediate entities, inheritance generation modes), a modeling linter, explanations or a trainer. StrataSQL's niche is **learning CDM → PDM** in PowerDesigner conventions — not a general ER editor; don't compete on generic table editing. Borrowed ideas: PNG/SVG export, live issues panel, text mode, in-browser SQL sandbox. Check licenses before reusing any code (some are copyleft).

## Decisions (settled 2026-10-02)

The owner's guidance: the course's "discussed in class" points are not critical — choose what is clearest for students; own examples are welcome. Decisions are marked ✱ in `cases/*.md`.

1. TV Shows: Episode links to **ShowDirector** (1,1 — 0,n), not to Director → no cycle; in the PDM `show_id` is one shared column. The cycle version becomes a seeded wrong model for the trainer / linter L04.
2. TV Shows: Person inheritance is **non-exclusive**, complete, generation = both.
3. TV Shows: TechnicianFunction keeps its **own `function_no`**; the `Function` lookup version is an alternative for help cards.
4. Table codes follow the **PowerDesigner default** (name upper-cased, spaces → `_`). Reference models name entities so codes match the cases (`Car Shift` → `CAR_SHIFT`).
5. Column collisions in the PDM: same origin column via different neighbours → shared column; two links to the same neighbour → role prefix (SPEC §6).
6. Timetables: **Class is identified by its context** (dependent on TeachingAssignment, Room, Shift, Period + own `weekday`), one ClassSlot row per 30-min slot. Only PK columns migrate, so this is what brings `room_id`, `professor_id`, `weekday`… into CLASSSLOT, where the three rules become AKs. Alternative (`class_id` + FK to a wider UNIQUE key) is mentioned in the case.
7. 1:1 FK default side: the side that must have a partner (its FK is NOT NULL); the user can override it.

Still open:
- SPEC §13: PD-style `0,n` labels shown by default (toggle later); associations not supported; UI in English first.
