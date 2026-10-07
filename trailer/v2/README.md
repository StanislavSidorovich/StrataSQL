# StrataSQL trailer (LinkedIn, 1080×1350, ~41 s)

Videos, captures and rendered frames are not in git; these scripts rebuild them.
Run from this folder with the dev server on http://localhost:5173 (`npm run dev` in the repo root).
First time: `npm install` here (Playwright + ffmpeg-static; Chromium via `npx playwright install chromium` if missing).

Each clip = capture script (drives the real app at deviceScaleFactor 3, saves crops) → plan (frames + cursor +
captions as JSON) → `node render.mjs <plan>.json <out>.mp4`. `render.mjs` draws each state in `stage4.html`
(mode chips ① Watch / ② Practise, caption, cards, camera cards with a moving `view` rect, HTML cards, cursor, click ripple, progress), crossfades frames that have
`fade`, and writes exact 30 fps (no doubled or dropped frames).

| Clip | Capture | Plan → render |
|---|---|---|
| 01-hookA.mp4 — the finished Hotel CDM (close-up → app window) → PDM → SQL | hook2.mjs → hk/ | `node hookplan.mjs A` → hookA.json |
| 02-watch.mp4 — ① Watch: steps 2→3 explained, ⏩ 4–10 | watch.mjs → wa/ | watchplan.mjs → watch.json |
| 03-practise.mp4 — ② Practise: level 3, Guest (L01 → PI → ✓), ⏩ Booking, link, pull back, ⏩ the rest, Check | practise.mjs → pr/ + practise.json (uses hotel-ref.json) | — |
| 05-endcard.mp4 | endcard.mjs (endcard.html → endcard.png) | `ffmpeg -loop 1 -i endcard.png -t 4.5 …` |

Assemble: `node assemble.mjs . StrataSQL-trailer.mp4 01-hookA.mp4 02-watch.mp4 03-practise.mp4 05-endcard.mp4` (0.3 s crossfades).

Variant B (not chosen): `node hookplan.mjs` → hook2.json → 01-hook.mp4, plus own5.mjs (own.strata.json) → own.json → 04-own.mp4 before the end card.

Checks: `node jumps.mjs <video>` lists frame-to-frame jumps (a crossfade shows as an even run, a hard cut as one spike);
`node sheet.mjs out.png a.png b.png …` makes a contact sheet.

practise.mjs pins the canvas with CSS (`.react-flow__viewport` transform !important) and pans React Flow's real viewport under it before each click, so Guest and Booking land at their reference positions.

`hotel-ref.json` is the Hotel reference CDM (from the walkthrough's last step); practise.mjs injects its other entities
for the ⏩ beat. If the case changes, refresh it from localStorage `stratasql.trainer.model` at walkthrough step 10.
