# StrataSQL

Browser-based data modeling: **Conceptual Data Model → Physical Data Model → SQL Server DDL**, with help cards and a trainer. A lightweight, learnable companion to SAP PowerDesigner for the NOVA IMS DBMS course (IE notation, intermediate entities, SQL Server).

- Spec: [SPEC.md](SPEC.md) · Progress: [ROADMAP.md](ROADMAP.md) · Reference cases: [cases/](cases/)
- **Open it: https://model.quaera.app** — runs in the browser, no install, no VPN. Works offline after the first visit; Chrome/Edge (also on macOS) offer **Install app** in the address bar, Safari on macOS has *File → Add to Dock*.
- Status: stages 1–5 done (CDM editor, PDM + SQL Server DDL, SQL sandbox, linter + help cards, trainer, guided start: tour, step-by-step walkthroughs, build with hints, PowerDesigner `.cdm` import and export); 8 cases and 5 open exercises.
- **Unofficial student project**, not affiliated with or endorsed by NOVA IMS. Where it differs from the course, the course and the professor are right; the decisions marked ✱ in `cases/` are the author's own.
- Part of **[Quaera](https://quaera.app)**: StrataSQL is where you design the database, Quaera is where you query and analyse one.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # core unit tests (Vitest)
npm run build    # typecheck + static build in dist/
```

## Use

- Double-click the canvas to add an entity; edit it in the right panel.
- Drag from the ● handle of an entity onto another entity to link them. The toolbar picks *Relationship* or *Inheritance* (drag child → parent).
- Views: **Conceptual** (CDM), **Physical** (generated tables), **SQL** (SQL Server DDL), **Sandbox** (the schema running in the browser — insert rows and see which constraint rejects them).
- The **Model check** dock under the canvas lists modeling issues live; `?` next to any property or issue opens a help card.
- Models autosave in the browser; **Save** / **Open** use `*.strata.json` files. The **Examples** menu has every case three ways: watch it built, build it yourself with hints, or open the finished model.
- The left (trainer) and right (properties) columns can be hidden with the ‹ › tab and resized by dragging their edge; double-click the edge to reset.
- When a new version is deployed, an **Update** button appears in the toolbar; the model is kept.

## Layout

```
src/core/   pure TypeScript engine (no React): metamodel, edit ops, CDM→PDM, DDL, linter, sandbox
src/ui/     React app: canvas (React Flow), properties panels, store (Zustand + undo/redo)
src/data/   example models built from cases/, help cards, sandbox scenarios
src/pwa/    service worker + registration (the build adds the precache list)
scripts/    make-icons.mjs — regenerates the app icons in public/
tests/      Vitest tests for every core rule + case regression tests
cases/      reference cases (markdown)
```

## License

Code: [Apache-2.0](LICENSE) · Learning content (cases, explanations, hints, help cards, exercises): [CC BY-NC-SA 4.0](LICENSE-CONTENT) — the same split as in [Quaera](https://github.com/StanislavSidorovich/Quaera).

The three course cases (Ride Hailing, Timetables, TV Shows) and the PowerDesigner files in `tests/fixtures/` are adapted from NOVA IMS DBMS class material; their rights stay with their authors, and they are here for study only.

PowerDesigner is a trademark of SAP SE and SQL Server of Microsoft; StrataSQL is not affiliated with either.
