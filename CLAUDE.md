# StrataSQL

Browser-based CDM → PDM → SQL modeling tool with help cards and a trainer. Full spec: `SPEC.md`. Reference cases: `cases/*.md`.

- Work stage by stage (SPEC §12); a stage is done only when its acceptance criteria pass. Progress and decisions: `ROADMAP.md`. Live: https://model.quaera.app (GitHub Pages custom domain, DNS on Cloudflare; deployed by GitHub Actions on push to main). Part of Quaera (quaera.app). Code Apache-2.0, learning content CC BY-NC-SA 4.0.
- `src/core/` is pure TypeScript, no React imports. Every CDM→PDM rule (SPEC §6) and linter check (SPEC §7) gets a Vitest test.
- The cases in `cases/` (2 course-inspired cases (TV Shows, Timetables) + 6 own cases: Library, Hotel, Scooter Sharing, Online Shop, Hospital, Football) are the regression suite: their reference CDMs must generate the PDMs listed there. `cases/exercises.md` lists open exercises (no reference). `tests/crosscheck-powerdesigner.test.ts` compares our PDM with PowerDesigner's on the owner's class files.
- Modeling conventions follow the NOVA IMS DBMS course (PowerDesigner, IE notation, intermediate entities instead of associations, SQL Server DDL).
- Points marked (?) in cases may be settled by Claude, choosing what is clearest for students; mark the choice ✱ in the case and list it under "Decisions" in ROADMAP.md.
- Quaera hops with StrataLab (lab.quaera.app): `#ddl=` out (Open in StrataLab, #33) and `#sql=…&name=…` in (Tables from StrataLab, #34), both packed by `src/core/shareLink.ts`, which must stay in step with StrataLab's `src/core/ddlLink.ts` / `modelLink.ts`. `tests/fixtures/stratalab/*.sql` are what StrataLab sends for its five datasets.
