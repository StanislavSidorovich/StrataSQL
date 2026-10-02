# StrataSQL

Browser-based data modeling: **Conceptual Data Model → Physical Data Model → SQL Server DDL**, with help cards and a trainer. A lightweight, learnable companion to SAP PowerDesigner for the NOVA IMS DBMS course (IE notation, intermediate entities, SQL Server).

- Spec: [SPEC.md](SPEC.md) · Progress: [ROADMAP.md](ROADMAP.md) · Reference cases: [cases/](cases/)
- **Open it: https://stanislavsidorovich.github.io/StrataSQL/** — runs in the browser, no install, no VPN.
- Status: stage 1 (CDM editor) done.

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
- Models autosave in the browser; **Save** / **Open** use `*.strata.json` files. **Examples…** loads the TV Shows reference model.

## Layout

```
src/core/   pure TypeScript engine (no React): metamodel, edit ops, serialization
src/ui/     React app: canvas (React Flow), properties panels, store (Zustand + undo/redo)
src/data/   example models built from cases/
tests/      Vitest tests for every core rule + case regression tests
cases/      reference cases (markdown)
```
