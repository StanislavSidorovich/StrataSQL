# StrataSQL

Browser-based CDM → PDM → SQL modeling tool with help cards and a trainer. Full spec: `SPEC.md`. Reference cases: `cases/*.md`.

- Work stage by stage (SPEC §12); a stage is done only when its acceptance criteria pass.
- `src/core/` is pure TypeScript, no React imports. Every CDM→PDM rule (SPEC §6) and linter check (SPEC §7) gets a Vitest test.
- The three cases in `cases/` are the regression suite: their reference CDMs must generate the PDMs listed there.
- Modeling conventions follow the NOVA IMS DBMS course (PowerDesigner, IE notation, intermediate entities instead of associations, SQL Server DDL).
- Points marked (?) in cases are unverified against class notes — ask the user before treating them as ground truth.
