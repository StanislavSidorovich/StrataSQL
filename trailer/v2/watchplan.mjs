// ① Watch: steps 2→3 in detail (text, explanation, model), then steps 4–10 fast-forwarded in place.
import fs from 'fs'
const { nextFrac } = JSON.parse(fs.readFileSync('wa/meta.json', 'utf8'))
const CAP = 'Every step <em>explained</em>'
const dt = 1 / 30, F = []
const foot = (n, txt) => `<div class="prog"><i style="width:${n * 10}%"></i></div><b>${txt ?? `Step ${n} of 10`}</b>`
const A = (s, o = {}) => ({ mode: 1, cap: CAP, foot: foot(s), cur: o.cur, click: o.click, blocks: [
  { id: 'tx', label: 'The text', img: `wa/text${s}.png`, maxH: 200, cardH: 215 },
  { id: 'pn', label: 'The step, explained', img: `wa/panel${s}.png`, maxH: 300, cardH: 315 },
  { id: 'md', label: 'The model', img: `wa/two${s}.png`, maxH: 230, cardH: 240 }] })
const B = (s, txt) => ({ mode: 1, cap: CAP, foot: foot(s, txt), blocks: [
  { id: 'mf', label: s < 10 ? '⏩ Fast-forward · steps 4–10' : 'The finished model', img: `wa/m${s}.png`, maxH: 760 }] })
const NX = { id: 'pn', ...nextFrac }, start = { id: 'md', fx: 0.75, fy: 0.8 }
F.push({ state: A(2), dur: 1.0 })
F.push({ state: A(2, { cur: { a: start } }), dur: 0.5 })
for (let i = 1; i <= 16; i++) F.push({ state: A(2, { cur: { a: start, b: NX, t: i / 16 } }), dur: dt })
for (let i = 0; i <= 5; i++) F.push({ state: A(2, { cur: { a: NX }, click: i / 6 }), dur: dt })
F.push({ state: A(3, { cur: { a: NX } }), fade: 0.25, dur: 0.5 })
F.push({ state: A(3), dur: 2.6 })
F.push({ state: B(3, '⏩ Steps 4–10'), fade: 0.4, dur: 0.4 })
for (let s = 4; s <= 10; s++) F.push({ state: B(s, s < 10 ? `⏩ Step ${s} of 10` : '✓ Step 10 of 10 · 5 tables'), fade: 0.2, dur: s < 10 ? 0.33 : 1.4 })
fs.writeFileSync('watch.json', JSON.stringify(F))
