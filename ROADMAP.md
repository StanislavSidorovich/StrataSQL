# StrataSQL — Roadmap

Stages follow SPEC §12. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. CDM editor | ✅ done (2026-10-02) · live: https://model.quaera.app | Full TV Shows reference model can be built and saved/reloaded |
| 2. PDM + SQL Server DDL | ✅ done (2026-10-02) | 3 reference CDMs generate the PDMs in `cases/`; DDL runs on SQL Server |
| 2.5 SQL sandbox | ✅ done (2026-10-02) | Generated schema runs in the browser; inserting conflicting rows shows the constraint that rejects them |
| 3. Linter + Help | ✅ done (2026-10-02) | L01–L10 with tests; ≥ 15 help cards; `?` on every property (L11 added with stage 4) |
| 4. Trainer | ✅ done (2026-10-02) | 3 cases × levels 0–3; comparator correct on references and seeded wrong models |
| 5. Guided start | ✅ acceptance met (2026-10-03, v0.5.0) — 5a–5e done (5e finished in v0.8.0); `.pdm` reverse carried over | A first-time user learns the screen in a tour, watches a case built step by step, and builds one alone with “next hint” |
| 6. AI review | ⏭ optional | Optional, behind a user-provided API key |

**Where we are (2026-10-04, v0.8.0):** the pre-LinkedIn polish sprint is in: readable diagrams at 1366 px, the toolbar on one row down to a 1024 px tablet, “Link as:” and Trainer as a second call to action, icons, a “Saved” indicator, no repeated *why* in the walkthrough. Next: the owner's checks before the post (Post Inspector, guide, professor's answer), then `.pdm` reverse import.

**Earlier (2026-10-04, v0.7.0):** export to PowerDesigner `.cdm` and **My task** (own text with self-tagging).

**Earlier (2026-10-04, v0.6.0 + UX review):** 8 cases + 5 exercises, PowerDesigner cross-check, live at model.quaera.app. The UX review fixed the first-minute rough edges (gentle hint for a new entity, name focus, wrapping phrases, zoom, minimap, phone note). Then the two top backlog items: the walkthrough now asks before some steps (predict → see), and level 1 hides the model until the text is tagged. Then the owner's requests: default names as grey hints, text size, canvas/panel colours, Save as. Backlog 1–4, name suggestions, text size and author links are done since; the open work is in **Next steps** below. LinkedIn post after the professor answers about the 3 course cases.

## Next steps (by priority, 2026-10-04)

1. ✅ **Export to PowerDesigner `.cdm`** (2026-10-04) — **File → Export for PowerDesigner**; still to do: the owner opens an exported file in PowerDesigner 16 and generates the PDM from it (only our own import has read these files so far)
2. ✅ **My task (own text)** (2026-10-04, v0.7.0)
3. ✅ **Readable diagrams at 1366 px** (backlog 5, v0.8.0)
4. ✅ **Tablet / 1280 px + toolbar on one row** (backlog 6, v0.8.0)
5. ✅ **Toolbar labels**: “Link as:”, Trainer as a second call to action (backlog 7, v0.8.0)
6. ✅ **Walkthrough**: no repeated *why* (backlog 8, v0.8.0)
7. **Before the LinkedIn post** (owner): LinkedIn Post Inspector on https://model.quaera.app (the tags and the 1200×630 image are checked and live ✅), the professor's answer about the 3 course cases, a short guide (2–3 min video; the in-app shortcut sheet is `?`)
8. **`.pdm` reverse import** (tables → entities; `pdm-reader.ts` is the first half)
9. ✅ **5e leftovers**: lucide icons, “Saved” indicator, shortcut sheet on `?` (v0.8.0)
10. **Stage 6 AI review** (optional, own API key)
11. Smaller, found on the way: ✅ parallel relationships (Football home / away) drew their labels on top of each other — fixed: each parallel line keeps its cardinality, role and name on its outer side; Timetables still fits at ~58 % at 1366 px (12 entities, its columns are already tight); the walkthrough does not refit when the window is resized
12. ✅ **Owner's Hotel level 3 test (2026-10-04)**: the check missed attributes the student had under other names — fixed in `compare.ts`: short forms (`no` / `nr` / `num` = number, `qty`, `desc`…), word forms (`booked` ~ `booking`, `cancelled` ~ `cancellation`), a date written as `_on` / `_at` (`booked_on` ~ `Date` of Booking), “number of …” (`guests` ~ `guest_number`). Hints for a missing attribute now quote the text's words for *that* attribute (not the entity's words or the entity's hints). **Duplicate entity**: button in the entity panel and Ctrl+D (attributes and identifiers, no links; name `X_2`, name field focused). Second round: relationship messages use the student's entity names (not the reference's “Booked Room”); a link drawn the wrong way round says “the many end is on the wrong side” with the student's cards in words (it used to say “you have one to many, the text implies one to many”); “minimums differ” asks only about the end that differs. Third round: the check now reports a missing **alternate identifier `<ai>`** (Hotel passport_no, Library isbn/email, Online Shop email/sku…): any student identifier over the same attributes counts, the primary one too; waits while the attribute itself is missing; not scored, like M; the hint quotes the text's rule (“no two guests share…”); “Do it for me” adds it. Not checked yet: a duplicate attribute (Price + Nightly_price)

**Earlier (2026-10-03, v0.5.0):** guided start is in: a welcome card and a tour, the four cases watched built step by step (Library starter first), built alone with a Next hint that walks the same order, and PowerDesigner `.cdm` import. Next: 5e UI polish, then optional AI review (stage 6).

**Earlier (2026-10-02, v0.4.0):** the learning loop is complete. Build a CDM, get the PDM + SQL Server DDL, test the keys in the sandbox, get live linter feedback with help cards, and practise on the three course cases in the trainer (worked example → text tagging → complete the model → from scratch, with a structural check and a hint ladder). Next is stage 5 (guided start, see below); AI review moved to stage 6 and stays optional.

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

## Stage 4 — Trainer ✅ (2026-10-02)

Done:
- [x] Linter **L11**: an attribute that looks like a foreign key (`PublisherID` typed by hand, or another entity's identifier copied, including into a PI) → "draw a relationship, the PDM creates the FK". Own identifiers, alternate keys (`license_no`) and inheritance families are not flagged. New help card `foreign-key-attribute` (23 cards). Prompted by a user model with `PublisherID` in Books
- [x] `src/core/compare.ts` — structural comparator (SPEC §9): entities matched by name + synonyms + attribute overlap (entity prefixes and PI names ignored), then a second pass by matched neighbours (finds a renamed intermediate entity without attributes); relationships compared in the reference orientation (kind of link, minimums, dependency); inheritances (children, exclusive, complete); own identifier present or not; attributes from the text missing. Output: matched / missing / different / extra, each with a message and the answer; score 0–100 (different = half, wrong identifier −½). An extra M:N where the reference has an intermediate entity says so
- [x] `src/data/cases.ts` — machine form of the 3 cases: specification paragraphs, 63 tagged phrases (tag, accepted alternatives, target element, why), key decisions, synonyms, hints per element. `src/data/trainer.ts` — start model per level (level 2: reference entities without links, comments and physical keys)
- [x] UI: **🎓 Trainer** in the toolbar → case picker with best scores → side pane. Level 0: highlighted phrases select their element on the canvas, with the reason. Level 1: tag each phrase (5 tags), immediate feedback, score. Levels 2–3: Check → score bar, grouped results, click → select in your model, hint ladder per item (where to look → case hint + the text phrases → the answer); linter counts shown too
- [x] The user's own model is kept aside while the trainer runs (autosave keeps it, the task model is stored separately) and comes back on Exit; a reload resumes the task. Best scores in localStorage
- [x] Tests: `tests/compare.test.ts` (16: the 3 references match themselves at 100; seeded wrong models — the Episode→Director cycle, Role as M:N, Scene not dependent, flipped cardinality, synonyms, renamed intermediate, wrong identifiers, inheritance flags, Timetables Class with own id, Ride Hailing 0,1 → 1,1, empty model), `tests/trainer-cases.test.ts` (12), L11 (4). 180 tests in total
- [x] Checked in the production build (Playwright): all four levels of TV Shows, hint ladder to the answer, progress saved, Exit restores the user's model, no console errors

Decisions:
- Text tagging uses **5 tags** (SPEC listed 4): *inheritance* is added, because "can be indoors or outdoors" is neither an entity nor a plain relationship. A phrase may accept a second tag (an M:N that becomes an intermediate entity is right as relationship or entity).
- Extra entities are reported but not scored: the course asks students to invent attributes and entities.

Known gaps carried forward:
- Matching is heuristic: a student entity with a very different name, no attributes in common and no matched neighbours stays unmatched (shown as missing + extra).
- Attributes are compared by name only (types and mandatory are not checked); missing attributes are not scored.
- Level 2/3 work is lost when switching level (a confirm asks first).

## Stage 5 — Guided start ✅ (2026-10-03)

Why: the owner's review — the tool works, but a newcomer does not know where to start. The Examples menu shows the finished answer at once, the trainer (which already has a worked example and a hint ladder) is hard to discover, and nothing explains the screen. Goal: *show → do with help → do alone*, reachable from the first screen.

Phases (each is shippable on its own):

- [x] **5a. Welcome + tour.** (done 2026-10-03) First visit: a short welcome card (what the tool is, three ways to start: tour, watch an example being built, build one yourself). Coach marks over the real UI, 6–8 steps: views, + Entity / drag to link, properties panel, Model check, Help, Trainer, Save/Open. Re-run from a **? menu** (Tour · Walkthroughs · Glossary · Keyboard shortcuts). Skippable, `Esc` exits, remembered in localStorage
- [x] **5b. Walkthrough (“Show me how it's built”).** (done 2026-10-03, sprint 2) A case is built on an empty canvas one step at a time: the text phrase is highlighted, the step is applied to the canvas (entity → its attributes → identifier → relationship with cardinalities → dependency / inheritance), with the reason. Next / Back / Exit; the user's model is set aside and restored (same as the trainer). Steps are **generated** from `cases.ts` (phrase → target → why) plus an order, so they cannot drift from the reference. A new **starter case** comes first (Library: Book, Author, Publisher, Loan — 1:N, an M:N turned into an intermediate entity, one identifier choice), then Ride Hailing → Timetables → TV Shows
- [x] **5c. Build it with me.** (done 2026-10-03, sprint 3) Examples menu splits into “Show the answer” and “Build it myself”. Build mode = trainer level 3 with a global **Next hint** button: the comparator picks the next missing item in walkthrough order and walks the hint ladder (what to add → which phrase → why → the answer, optionally “do it for me”)
- [x] **5d. PowerDesigner import** — `.cdm` / `.cdb` done 2026-10-03; `.pdm` reverse still open. `.cdm` (conceptual) → model; `.pdm` (physical) → reverse into a CDM (tables → entities, FKs → relationships, join tables → intermediate entities), later. `.cdb` / `.pdb` are PowerDesigner's automatic **backup copies** of `.cdm` / `.pdm` (same content), so they are accepted too. Only the XML file format (PD default); a binary file gets a message “save as XML in PowerDesigner”. Needs real class files to test with
- [ ] **5e. UI polish.** ~~File menu~~ ✅ (+ Examples and Help menus) · File menu (New, Open, Save, Import, Export PNG/SVG) instead of `<select>` lists; icons with text labels (lucide, MIT); toolbar grouped by task; “Saved” indicator for autosave; keyboard-shortcut sheet; empty state links to tour / walkthrough / build; check at 1280 px and on a tablet

Sprint 1 (2026-10-03) — done:
- [x] `src/core/import/xml.ts` — a small pure-TS XML reader (Vitest runs in node, which has no DOMParser)
- [x] `src/core/import/powerdesigner.ts` — PD 16 XML `.cdm` → model: data items → attributes (types `VA50`, `DC10,2`, `LVA250`…, mandatory), identifiers (primary + alternate), domains, relationships, dependency, inheritances (exclusive / complete), and the diagram layout (default diagram, 1/100 mm → px, y flipped). PD facts found in the course files: Entity1 is stored as `Object2`; `Entity1ToEntity2RoleCardinality` is drawn at Entity2's end; only non-default flags are stored. Binary files and `.pdm` get a plain message. Roles go into the relationship comment (PD roles are verb phrases, ours are FK prefixes)
- [x] Tests `tests/import-powerdesigner.test.ts` (6) on the owner's class files `TV Show.cdm` and `University.cdm` (`tests/fixtures/`, local paths removed): structure, cardinalities, dependency, inheritance flags, integrity, PDM generation. 186 tests in total
- [x] UI: **File** menu (New, Open… — `.strata.json` or `.cdm`/`.cdb`, Save, Export PNG/SVG), **Examples** menu (+ "Build one yourself (Trainer)"), **? Help** menu (Glossary · Tour of the screen · Keyboard shortcuts); import summary toast with any warnings
- [x] First visit: welcome card with three starts (tour · learn on a course case · look at a finished model) or an empty model. Tour: 8 coach marks over the real UI (views, File, draw, canvas, properties, Model check, Trainer, Help); steps whose element is not on screen are skipped; ←/→/Enter/Esc. Keyboard sheet
- [x] Checked in the dev build (built-in browser): welcome → tour 1–7 on an empty model, importing `TV Show.cdm` keeps the PowerDesigner layout, menus, no console errors

Built with: Claude Opus 5.5 (Claude Code), effort low.

Sprint 2 (2026-10-03) — 5b walkthrough, done:
- [x] **Library**, a new own starter case ✱ (`src/data/examples/library.ts`, `cases/library.md`, 27 tagged phrases in `cases.ts`): Publisher, Book, Author, Member, Loan. Each step brings one idea: entity → attributes → primary vs alternate identifier (`book_id` + `isbn` AI; `card_no` given by the text + `email` AI) → one-to-many → plain M:N (join table WRITES) → M:N with data that repeats → intermediate entity Loan with own id → optional `return_date`
- [x] **Ladder of cases, easiest first** ✱: Library ★ → Ride Hailing ★★ (was ★★★: dependent entities, optional FK, history, no inheritance) → TV Shows ★★ (inheritance, intermediate with/without own id, cycle) → Timetables ★★★. Trainer picker and Examples menu follow this order
- [x] `src/data/walkthrough.ts` — `walkthroughSteps(case)`: every step is a **subset of the reference model** (same ids), so the last step *is* the reference and the steps cannot drift. Plan per case in `cases.ts` (`walk`: entity order, `fine` = separate entity / attributes / identifier steps for the starter, notes per step). Relationships appear as soon as both ends exist, inheritances when parent and children exist; then “rules become keys” (Timetables AKs), “rules outside the diagram” (phrases with no target) and a summary. Each step lists the phrases it explains (with their *why*), generated readings (cardinalities, dependency, M:N, 1:1, roles, inheritance flags), invented attributes, each concept explained once where it first appears, and **the tables it creates or changes** (`BOOK: book_id <pk>, isbn <ak>, …`) from the PDM of that step
- [x] UI: walkthrough pane (step x of N, progress, phrases → why, text, tables, “? Learn more” help card, Back/Next, ←/→ keys, the text with past / current phrases marked). New elements are highlighted (teal) and the first one is selected, so the properties panel shows it; the canvas fits each step; linting is muted for half-built models; works in the Physical view too (watch the tables grow). Last step: “Build it yourself” (trainer level 3) or “Next case ▶”. The user's model is set aside and restored on Exit, a reload resumes the step
- [x] Entry points: welcome card (“Watch a model being built” → Library), Examples menu (▶ Watch it built), empty state, Help menu, trainer picker (▶ Watch it built per case), level 0 pane
- [x] Tests `tests/walkthrough.test.ts` (24): for all 4 cases the last step equals the reference, every step is consistent and only grows, every phrase is explained exactly once, relationships come after their ends; Library steps, tables and PDM (6 tables). 214 tests in total
- [x] Checked in the dev build (Playwright 1366×820): welcome → Library to the end → Physical (6 tables) → Exit restores the user's model; TV Shows inheritance step; reload resumes; no console errors

Built with: Claude Opus 5.5 (Claude Code), effort low.

Sprint 3 (2026-10-03) — 5c “Build it with me”, done:
- [x] `src/data/coach.ts` — `coach(case, model, level)`: compares with the reference and picks the next missing or different item **in walkthrough order** (entity → its attributes → identifier → its links; Library's fine steps too); when everything matches, the Timetables “rules become keys” (physical keys over migrated columns) come last. Hint ladder per item: **What** (the comparator's message; a missing entity is not named, only its already-drawn neighbours) → **Where** (the phrases of the text, marked in the specification, plus the case hints) → **Why** (the phrases' reasons) → **Answer**. `applyAnswer` = **Do it for me**: copies that one element of the reference (entity with attributes, domains and identifiers; missing attributes; the right identifier; relationship in the reference orientation with cardinalities, dependency, roles; inheritance children and flags; physical keys), undoable with Ctrl+Z. `compare.ts` exports `missingAttributes` / `sameAttribute`
- [x] UI: a **💡 Build it with me** box in trainer levels 2 and 3 (Next hint → Another hint → Show the answer → Do it for me, “✓ That one is in”, % done), selects the element in your model. Level 3 renamed **Build it yourself** (was “From scratch”)
- [x] **Examples** menu in three groups: *Watch it built* · *Build it yourself (with hints)* = level 3 of that case · *Show the answer* = the finished model
- [x] Tails / inconsistencies fixed: New / Open / a finished example during a trainer task used to load **into the task** (the answer counted as the student's work) or under a running walkthrough — now the trainer closes first; switching level, case or walkthrough asks before discarding work, also after a reload (no undo history then); Help menu “Watch a model being built…” has the ellipsis of a chooser
- [x] Tests `tests/coach.test.ts` (21): for all 4 cases “do it for me” on every hint builds the model from empty (level 3) and from given entities (level 2) to **100 %**, same tables and AKs as the reference, no lint errors, never the same hint twice; the first hint is the walkthrough's first entity and does not name it; Library order (attributes → identifier → relationship); a reversed non-dependent relationship is fixed; extra entities are left alone. 235 tests in total
- [x] Checked in the dev build (Playwright 1366×820): Examples → Build it yourself: Library → hints with marked phrases → do it for me to the end → Check = 100 %, saved; Show the answer closes the trainer after a confirm; no console errors

Built with: Claude Opus 5.5 (Claude Code), effort low.

Sprint 4 (2026-10-03) — 5e polish, part 1 (owner's review before showing classmates):
- [x] Side columns (trainer on the left, properties on the right) **hide** with a ‹ › tab on their inner edge and **resize** by dragging that edge (260 px – 45 % of the window; double-click resets); the width is remembered. Opening another case, level or the picker shows a hidden trainer again (`src/ui/SideDock.tsx`)
- [x] Walkthrough: **Back / Next above the explanation**, so the buttons stay in place from step to step; the text fills the rest of the column instead of a fixed 220 px box
- [x] **File** and **Examples** moved to the left of the toolbar, right after the logo (as in most programs)
- [x] Licenses as in Quaera: code **Apache-2.0** (`LICENSE`), learning content **CC BY-NC-SA 4.0** (`LICENSE-CONTENT`); the course cases and class files stay with their authors
- [x] Domain **model.quaera.app** (part of Quaera), live 2026-10-03: Cloudflare CNAME `model` → `stanislavsidorovich.github.io` (DNS only), GitHub Pages custom domain + enforced HTTPS; the old github.io link redirects (301). Help menu links to Quaera; the build already uses relative paths, so nothing else changed. Checked: page loads, service worker active with the precache
- [x] **Help → About StrataSQL**: the unofficial-student-project disclaimer stays reachable after the welcome card (it was only there and in the README), plus where the course cases come from, author, source, licenses and a trademark line (PowerDesigner — SAP SE, SQL Server — Microsoft; also in the README)
- [x] Checked in the dev build (Playwright 1366×820): walkthrough steps, hide / show both columns, drag-resize, no console errors. 314 tests

Carried over (5e and later): File menu icons (lucide), toolbar grouped by task, “Saved” indicator, check at 1280 px and on a tablet; `.pdm` reverse import; hints used are not counted in the score.

Acceptance: a first-time user can, without reading docs, finish the tour, watch the starter case built to the end, and build it alone to 100 % using hints. Walkthrough steps of all 4 cases replay to exactly the reference model (unit test). Import of the course `.cdm` files gives the same model as the hand-built reference.

## UX review (2026-10-04)

Why: the owner asked for a full pass over the live app (first visit, walkthrough, all four views, trainer, phone / tablet / dark) before showing it to classmates and in a LinkedIn post. Tag `v0.6.0` marks the state before it.

Fixed in this pass:
- [x] A just-drawn entity is **unfinished, not wrong** ✱: L02 becomes one `info` hint (“empty so far — next: attributes and PI”), L01 starts once the entity has attributes or links; no red border, no “no primary key” note in its panel (SPEC §7 updated, test added)
- [x] New entity (double-click or + Entity): the **Name field takes the focus** with the text selected — type the name at once
- [x] Build-it-with-me: when a new entity still has the default name, the first hint says “rename it” instead of “add an entity”
- [x] Phrases in the case text **wrap like words** (a `<button>` is always inline-block, so long phrases jumped to their own lines); span with `role="button"`, Enter / Space work
- [x] Canvas fit **never zooms past 100 %** (one entity used to fill the screen); **minimap only from 10 nodes** (it covered a corner of small models)
- [x] Trainer picker: the empty canvas says “Pick a case on the left”, not “model it here”
- [x] Welcome: course-neutral wording; on a **phone** a note that modelling needs a computer
- [x] Example comments no longer show repository paths (`cases/library.md`)

Done after the review (2026-10-04):
- [x] **Active walkthrough** (backlog 1): before some steps it is “Your turn” — the canvas still shows the previous step, the student picks an answer (buttons or keys 1–5) or “Just show me”, then the step appears with ✓ / ✗ and one sentence why. Questions come from the model in `walkthrough.ts` (`WalkStep.question`), three kinds ✱: **which table gets the foreign key** before every relationship between two entities (tables in name order, so the answer is not always the second; 1:1 accepts both sides; M:N = join table), **which attribute tells one X apart** when there is a real choice (the text names the identifier, or there is an alternate one — both count), and **what a phrase becomes** once at the first entity, then only for phrases with two accepted readings (asking “is *books* an entity?” every time is noise). Library: 8 questions in 20 steps, the first at step 1. Answers survive a reload; the done step shows “Your predictions: X of Y right”; a checkbox “Ask me before some steps” turns it off (remembered). Tests: every question answerable, the FK answer is the PDM's FK table.
- [x] **Level 1 hides the answer** (backlog 2): a veil over the canvas (all views) until every phrase is tagged, with **Peek at the model** / **Hide the model**; while hidden, tagging does not select the element (the Properties panel would list its links and give other answers away)
- [x] Checked in the dev build (Playwright 1366×820): Library question at step 1, wrong answer → ✗ with the reason, FK question with both entities highlighted, answers kept after a reload, Hotel level 1 veiled → Peek → Hide; 332 tests

Built with: Claude Opus 5.5 (Claude Code), effort low.

Owner's requests (2026-10-04, later):
- [x] **Default names are a grey hint**: a new attribute's name (`attribute`, `attribute_2`) and a new entity's (`Entity_2`) show as a placeholder — click and type from the start, nothing to delete; clearing the field gives the default back. “+ Attribute” puts the cursor in the new name field
- [x] **Text size** (toolbar **Aa**): Normal / Large 115 % / Larger 130 % / Largest 150 %. It zooms the toolbar, side columns, Model check, help drawer, dialogs, SQL and Sandbox; diagrams keep their own zoom; side columns keep their width on screen; the help drawer starts below the toolbar even when it wraps
- [x] **Colours** (same Aa panel): canvas and panels (top bar + both side columns, one colour ✱ — separate colours per column add choice without use), 6 presets each + any colour from the picker; kept per theme (light/dark), input fields stay white; Reset
- [x] **File → Save as…** (Ctrl+Shift+S): choose folder and name (Chrome/Edge, File System Access API); afterwards Save / Ctrl+S writes to that file until another model is loaded (not during a trainer task). Firefox/Safari: a download, with a note how to make the browser ask for the folder
- [x] Fixed on the way: the Sandbox's right column had no width (an empty model let it take the whole screen); it is now a resizable side column like the others
- [x] Checked in the dev build (Playwright 1366×820): hint + focus + clear, 130 % text with colours, dark theme, Sandbox; 332 tests

Fairer Check (2026-10-04, from the owner's own Library build at level 3 — 89 %, 3 false “missing”):
- [x] An **intermediate entity for a plain many-to-many** (Book_Author between Book and Author, two many-to-one links) counts as that many-to-many ✱ — same join table in the PDM; it is no longer listed as extra, its minimums are still compared, “do it for me” fixes the cards on its two links and keeps the entity; the hint’s answer names the two links and the card at the entity’s end
- [x] Attributes match **short forms**: `pub_year` ~ `Publication_year`, `card_no` ~ `Card_number`, `name` ~ `Pname` (entity initial); an attribute chosen as the **primary identifier** still counts (ISBN as PI is the ISBN). A different word (`Name` for `title`) is still reported; 335 tests
- [x] **Mandatory (M) compared** (owner's request): an attribute mandatory in the reference but not ticked → “must always have a value — tick M (NOT NULL)”; ticked where the case explains why it is optional (a comment like “NULL while the book is out”) → “can stay empty” ✱. Elsewhere the reference did not decide, so the student's M is accepted (course cases leave many attributes unmarked). Not scored, like attributes; a coach step after the entity's attributes; “do it for me” sets the flags; 336 tests

Sandbox prediction, picker progress, name suggestions (2026-10-04):
- [x] **Sandbox: predict first** (backlog 3): every scenario step except the setup asks “Will the database accept this?” — ✓ Accepted / ✗ Rejected (keys 1 / 2) or “Just run it”; afterwards “✓ Right / ✗ Not quite — you said …, it was …” above the reason, and at the end “Your predictions: X of Y right”. “Guess before each step” turns it off (remembered); Run all skips the guesses
- [x] Sandbox layout: **Try this** is now first in the right column (scenario cards with the step count), Last statement under it; after a step the grid **switches to the table it wrote to** (or whose constraint rejected it), so the row or the red columns are in view; an empty table says how to fill it
- [x] **Picker progress** (backlog 4): each case shows *n / 4* with a bar — the path is ▶ Watch it built, level 1, 2, 3 (level 0 is optional reading); a level counts as done from **80 %** ✱ (the best % stays on its button); the walkthrough gets ✓ when watched to the last step; a finished case has a green frame and “✓ done”. On top: **Continue: Hotel — level 1, text tagging →** (the first step not done, easiest case first)
- [x] **Finish line**: a Check (levels 2–3) or a fully tagged text (level 1) at 80 % or more shows the same **Next: … →** button
- [x] **Name suggestions from the task text** (owner's request): in levels 2–3 and open exercises the entity and attribute name fields complete words of the text (“co…” → *contacts*), with singulars (*books* → *book*) and word pairs (*birth_date*). **Every word** of the text is offered, not only the answers, so nothing is given away ✱. Checkbox “Suggest names from the text while I type” under the task (on by default, remembered). `src/data/suggest.ts`, tests
- [x] Empty difficulty stars are lighter (★ vs ★★★ was hard to tell)
- [x] Owner's requests, same day: **text size 110 %** between Normal and Large (the stored setting is now the factor; old index-based settings are migrated); the **diagram text grows with it** (entities, tables, line labels — by font size, so React Flow re-measures the nodes and lines stay attached), with a checkbox “Diagram text too”; **Made by Stanislav Sidorovich · GitHub · LinkedIn** at the bottom of the model panel and on the welcome card, LinkedIn also in About (`src/ui/AuthorLinks.tsx`); in the model panel the line sits at the **bottom of the column**, not under the last section
- [x] Checked in the dev build (Playwright 1366×820): Football scenario with right / wrong guesses and the score line, grid jumps to MATCH with the rejected columns, picker with seeded progress (Library done, Hotel 1/4, Continue button), Library level 3 suggestions (`Mem…` → Member); 345 tests

Built with: Claude Opus 5.5 (Claude Code), effort low.

PowerDesigner export (2026-10-04):
- [x] `src/core/export/powerdesigner.ts` — model → PD 16 XML `.cdm`, the reverse of the importer: entities, data items, identifiers (primary + alternate), domains, relationships (cardinalities, dependency, the 1:1 FK side as `DominantRole`), inheritances (exclusive / complete / generation / inherit all), diagram symbols at our positions (1/100 mm, y up, lines from border to border). Option blocks and display preferences are left out, so PD uses its defaults
- [x] Data items are **shared** as in PD (Title in two entities = one data item) ✱; PD needs one data item per code, so the same code with a different type gets `2` appended, the way PD does (`PARTICIPANT_ID2` in the course file) — with a warning that names the entity
- [x] Our **roles** are FK prefixes, PD roles are verb phrases, so they go into the relationship comment with a warning ✱; alternate keys over table columns (Timetables, Football) and the discriminator are not part of a PD CDM → warning
- [x] Tests: every case and both class files survive export → our import with the same SQL Server DDL (when there are no warnings), unique object ids, all refs resolve, layout kept; 359 tests. Checked in the dev build: File → Export for PowerDesigner gives `Library.cdm`
- Licence: the file format is written from scratch for interoperability, no SAP code or files are shipped; the trademark note is in README and About

My task (2026-10-04, v0.7.0):
- [x] Trainer picker → **My task**: paste a text or load `.txt` / `.md` (title from the file name; Markdown headings and bullets lose their marks); saved in the browser; **Edit text** in the pane, tagged phrases follow their words (a deleted word loses its tag)
- [x] Works like an open exercise (Model check counts, name suggestions from the text, self-review checklist written for any text ✱) — plus **self-tagging**: select words → Entity / Attribute / Identifier / Relationship / Inheritance / Rule (keys 1–6), click a tag to change or remove it
- [x] **Your tags and your model**: tagged phrases not in the model yet (names compared by words, singular, filler words dropped: *books* ~ Book, *card number* ~ Card_number; an identifier phrase must be in an identifier; a relationship phrase only gets a soft note, since links are often named differently or become an intermediate entity ✱), entities and attributes no tagged phrase names (click → selects it), rules listed to check by hand. Nothing is shown before the first tag
- [x] Fixed on the way: in a long left column the text box of open exercises shrank to nothing (flex); it keeps its height now
- [x] `src/data/mytask.ts` + tests; checked in the dev build (Playwright 1366×820): dialog, tagging by selection, Bike entity clears its line, reload, edit text; 364 tests

Pre-LinkedIn polish (2026-10-04, v0.8.0) — backlog 5–8 and the 5e leftovers:
- [x] **Readable diagrams at 1366 px** (backlog 5): during a walkthrough the Properties column starts hidden (open it with ›; it comes back when the walkthrough ends), so the canvas grows from ~590 to ~980 px; wide example layouts are tighter (Hospital, Football, Ride Hailing x × 0.8, TV Shows × 0.85, Timetables y × 0.8). Final step zoom at 1366 px: Library / Hotel / Online Shop 50 % → 88 %, Ride Hailing 73 %, Hospital and Football 75 %, TV Shows 66 %, Timetables 58 %
- [x] **Tablet / 1280 px** (backlog 6): the toolbar stays on one row at 1366, 1280 and 1024 px (breakpoints: model name hidden below 1440 — it is in the Model panel —, Help shows only its icon below 1280, views read CDM / PDM / SQL / Sandbox below 1200, brand and the word “Saved” go below 1100, icons only below 900); on a 768 px portrait tablet it wraps neatly into two rows. Below 1200 px the Properties column starts hidden and opens when something is selected
- [x] **Toolbar labels** (backlog 7): **Link as:** before Relationship | Inheritance (a radio group labelled by it); **Trainer** is an accent-outlined button right after the views, filled while the trainer is on
- [x] **Walkthrough repeats** (backlog 8): a generated paragraph that only repeats a phrase's *why* is left out (`repeats()`: ≥ 60 % of its content words already in the phrase boxes ✱), except readings with the model's data (cardinalities, attribute lists, key columns); a phrase whose *why* the authored note says again shows as “phrase → tag” only (`WalkStep.quiet`). Library: 6 repeated paragraphs gone, e.g. “Primary identifier <pi>: `card_no`.” after “The text names the identifier: `card_no` → primary identifier”
- [x] **5e leftovers**: lucide icons (ISC) in the toolbar and the menus; **✓ Saved** next to the model name after every autosave (tooltip: saved in this browser at hh:mm, File → Save keeps a file); `?` opens the shortcut sheet (listed in it and in the Help menu)
- [x] Open Graph: tags and `og-image.png` (1200×630) checked on the live site; the LinkedIn Post Inspector itself needs the owner's login
- [x] Follow-up: labels of parallel relationships (Football home / away) no longer overlap — cardinality, role and name go to the line's outer side, anchored away from it (`EndLabel outer`)
- [x] Tests: `repeats()` and “no step repeats a phrase's why” for all 8 cases; 374 tests. Checked in the dev build (Playwright 1366×820, 1280, 1024, 768): all 8 final walkthrough steps (no overlaps), Exit reopens Properties, `?`, select-to-reveal at 1024, no console errors

Built with: Claude Opus 5.5 (Claude Code), effort low.

Owner's ideas for later (2026-10-04):
- ✅ done in v0.7.0 — **Own task text** (“My task”): paste a text or load a `.txt` / `.md`; it shows in the left column like an open exercise (Model check counts, self-review checklist, name suggestions from it), saved in the browser. No reference, so no score — but a useful check without one: **the student tags phrases themselves** (select text → entity / attribute / relationship / identifier), and the pane lists tagged phrases with nothing in the model yet, and model elements no phrase mentions. Later, with stage 6 (AI review), the text + model can go to a model for comments. About one sprint
- ✅ Toolbar still wraps into two rows at 1366 px when the model name is long — fixed in v0.8.0 (the name moves to the Model panel below 1440 px)

Backlog from the review (by value; 5–8 done in v0.8.0):
5. **Readable diagrams at 1366 px**: tighter example layouts (columns 380 px apart → ~260), or collapse the properties column by default during a walkthrough
6. **Tablet / 1280 px**: the toolbar wraps into two rows at 1024 px; icons-only toolbar or overflow menu; side columns collapsed by default below 1200 px
7. Toolbar: “Relationship | Inheritance” looks like tabs but is the link mode — label it “Link as:”; Trainer is a second primary button next to + Entity
8. Walkthrough step box repeats the phrase’s *why* in the paragraph below it
9. Short guide (2–3 min video + one-page cheat sheet), Open Graph preview check in LinkedIn Post Inspector

## More cases + open exercises ✅ (2026-10-03)

Why: one case per difficulty is too few to practise; the owner asked for several per level, some with a check and some without. Textbook exercises were not copied (copyright, and their published answers rarely follow IE / PowerDesigner conventions): the texts are own, on classic domains ✱.
- [x] **4 new full cases** (reference CDM, tagged phrases, hints, synonyms, walkthrough plan, `cases/*.md`), built in `src/data/examples/` and `src/data/cases-more.ts`:
  - **Hotel ★** — lookup entity Room Type (the price belongs to the type), passport AI, intermediate entity *without* own id (Booked Room), optional `cancelled_on`
  - **Online Shop ★★** — Order Line dependent with `line_no`, reflexive category tree with roles (`parent_category_id`), one-to-one Payment (FK UNIQUE), price at order time (history) vs order total (derived), ORDER as a reserved word → Customer Order
  - **Hospital ★★** — inheritance with own data *and* own links (Appointment → Doctor, Admission → Nurse), plain M:N Doctor — Specialty, Bed dependent on Ward (2-column FK), two history entities
  - **Football League ★★★** — home / away as two relationships with roles, Contract history with own id, Goal dependent on Match, derived score, pairing rule as UNIQUE over migrated columns, and an **accepted L04 cycle** explained in the text ✱ (a linter warning is a question, not a verdict)
- [x] Ladder (trainer picker, Examples menu, walkthrough “Next case”): Library ★ → Hotel ★ → Ride Hailing ★★ → Online Shop ★★ → TV Shows ★★ → Hospital ★★ → Timetables ★★★ → Football ★★★. Examples menu is built from the case list (scrolls when long); the empty canvas shows two starts instead of eight buttons
- [x] **5 open exercises** (`src/data/exercises.ts`, `cases/exercises.md`): Car Rental ★, Gym ★, Cinema ★★, Conference ★★, Airline ★★★ — a text, no reference, **no score, no hints**; the pane shows live Model check counts and a self-review checklist (ticks saved with the session). In the trainer picker under “Open exercises”
- [x] Sandbox **“Try this”** scenarios for Library (had none) and the 4 new cases: ISBN AK and a repeated loan; a room listed twice in one booking; category tree FK, PK of order lines, second payment rejected by the 1:1 UNIQUE, total as a query; a doctor as the responsible nurse, a missing bed; the pairing AK and the CHECK that a key cannot express
- [x] Checks: every case passes the existing per-case suites automatically (phrases found, targets exist, walkthrough ends at the reference and explains every phrase once, **do it for me reaches 100 %**, schema runs in PGlite); new `tests/cases-more.test.ts` (expected PDM of each new case, lint clean — Football only the accepted L04 —, no generation warnings) and `tests/exercises.test.ts`. DDL of the 4 new cases run on SQL Server 2022 (scratch database, also re-run with DROP; AK_MATCH_PAIRING rejects a repeated pairing; database dropped). 314 tests
- [x] Checked in the dev build (Playwright 1366×820): picker with 8 cases + 5 exercises, an exercise survives a reload with its ticks, Football walkthrough to the end, no console errors

Built with: Claude Opus 5.5 (Claude Code), effort low.

## Cross-check with PowerDesigner ✅ (2026-10-03)

Why: the rules were written from the SPEC and the course slides; the owner's own class files let us check them against PowerDesigner itself.
- [x] `src/core/import/pdm-reader.ts` — reads a PD `.pdm` (tables, columns, PK, AKs, references with joins); first half of the `.pdm` reverse import
- [x] `tests/crosscheck-powerdesigner.test.ts`: the owner's `TV Show.cdm` and `University.cdm` (13 + 9 tables) go through our import + CDM → PDM and are compared with the `.pdm` PowerDesigner 16 generated from them: same tables, columns, order, NULL / NOT NULL, PKs, FKs, AKs. Two differences are explained by the CDMs being edited after their PDMs (one added attribute, one renamed entity)
- [x] Found and fixed: (1) PD's default **Inherit all attributes** copies parent columns into child tables with generation = both → new option `Inheritance.inheritAll` (checkbox, import reads PD's flags incl. generate parent / children); (2) column order now as in PD: key columns, then FK columns, then attributes
- Not checked yet: `.pdm` files where PD flags are non-default (the XML tag names `GenerateParent`, `GenerateChildren`, `InheritAll` are assumed, PD stores only non-default flags), 1:1 and reflexive links (none in these files)

Built with: Claude Opus 5.5 (Claude Code), effort low.

## Stage 4+ (later)

- Optional text mode: write the CDM as text, diagram updates live (idea from dbdiagram.io / DBML) — useful for fast input and trainer tasks
- Trainer: per-level saved work, Russian/Portuguese texts; promote good open exercises to full cases (Airline is the candidate)


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
8. (2026-10-03) Own starter case **Library** comes first; cases are ordered by difficulty Library → Ride Hailing → TV Shows → Timetables (Ride Hailing lowered to ★★). In Library the primary identifier of Book is an added `book_id`, the ISBN an alternate identifier — to show the PI/AI choice; Loan has its own id because the pair repeats.

9. (2026-10-03) Inheritance generation = both keeps **only the key** in child tables ✱. PowerDesigner's default “Inherit all attributes” also copies the parent's columns into each child (found by the cross-check with the owner's `TV Show.pdm`); it is a checkbox (`Inheritance.inheritAll`), on for imported PD models, off in the reference cases (no duplicated data).
- ✱ Check (2026-10-04): M is compared one-way plus explained exceptions — “must” when the reference is mandatory, “may be empty” only for attributes whose case comment says why they are NULL.
- ✱ Check (2026-10-04): a plain many-to-many drawn as an intermediate entity (no data, two many-to-one links) is accepted as equal — the course allows both; the case text still teaches the plain relationship when the pair has no data.
- ✱ Walkthrough questions (2026-10-04): ask where the FK goes before every relationship, the identifier only when there is a choice, and “what does this phrase become” once plus for two-reading phrases; 1:1 accepts either side, an alternate identifier counts as a right answer to “which attribute tells one X apart”. Level 1 hides the model (with a Peek) — recall first, then compare.
- ✱ Learning path (2026-10-04): a case is Watch it built + levels 1–3; a level is done from 80 % (perfect scores are not required to move on), level 0 is optional. Sandbox guesses are asked for every step except the setup.
- ✱ Name suggestions (2026-10-04): all words of the text (plus singulars and word pairs), never only the answer words; on by default.
- ✱ Walkthrough repeats (2026-10-04): the phrase box wins — a generated paragraph that says the same (≥ 60 % of its content words) is dropped, but cardinality readings, attribute lists and key columns always stay; the authored note wins over a phrase's *why*. The Properties column is hidden during a walkthrough (the diagram needs the room more).

Still open:
- SPEC §13: PD-style `0,n` labels shown by default (toggle later); associations not supported; UI in English first.
- Notations (asked 2026-10-04): IE stays the only one (the course uses it). Worth adding later only as a **display toggle**, never a second editor: Chen (most textbooks, e.g. Elmasri & Navathe, draw it — diamonds, relationship attributes) and UML class notation (`0..*`, used in software courses). Barker, IDEF1X, Merise add little for students. Value: reading textbook diagrams and other courses; cost ~1 sprint for Chen (layout of diamonds), less for UML multiplicities.
