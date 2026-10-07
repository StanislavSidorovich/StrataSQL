// ① Watch: steps 2→3 in detail (text, explanation, model); then the text and explanation fold away, the camera
// pulls back from Room Type — Room to the whole canvas, and steps 4–10 run with one line of the app's own
// explanation under the model (step 7, the many-to-many → Booked Room, held longer).
import fs from 'fs'
const { nextFrac, full, two } = JSON.parse(fs.readFileSync('wa/meta.json', 'utf8'))
const CAP = 'Every step <em>explained</em>'
const dt = 1 / 30, F = []
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const VP = { x: (two.x - full.x) / full.width, y: (two.y - full.y) / full.height, w: two.width / full.width, h: two.height / full.height }
const VF = { x: 0, y: 0, w: 1, h: 1 }
const lerp = (a, b, t) => a + (b - a) * t
const lerpV = (u, v, t) => ({ x: lerp(u.x, v.x, t), y: lerp(u.y, v.y, t), w: lerp(u.w, v.w, t), h: lerp(u.h, v.h, t) })
const foot = (n, txt) => `<div class="prog"><i style="width:${n * 10}%"></i></div><b>${txt ?? `Step ${n} of 10`}</b>`
const LBL = 35, TXH = 215, PNH = 315, MD0 = 230, MD1 = 560, LNH = 150
const md = (s, v, maxH) => ({ id: 'md', label: 'The model', img: `wa/m${s}.png`, view: v, camW: 1000, maxH })
const A = (s, o = {}) => ({ mode: 1, cap: CAP, foot: foot(s), cur: o.cur, click: o.click, blocks: [
  { id: 'tx', label: 'The text', img: `wa/text${s}.png`, maxH: 200, cardH: TXH, op: o.op },
  { id: 'pn', label: 'The step, explained', img: `wa/panel${s}.png`, maxH: 300, cardH: PNH, op: o.op },
  md(s, VP, MD0),
  { id: 'ln', html: '', bare: true, cardH: 0, op: 0 }] })
// k: 0 = as in A (cards still there, invisible), 1 = folded away, model big, the line card shown
const line = (q, to) => `<div class="ffl">${q}<span class="to">${to}</span></div>`
const B = (s, k, html, foot_) => ({ mode: 1, cap: CAP, foot: foot_, blocks: [
  { id: 'tx', label: '', lblH: LBL * (1 - k), html: '', bare: true, cardH: TXH * (1 - k), op: 0 },
  { id: 'pn', label: '', lblH: LBL * (1 - k), html: '', bare: true, cardH: PNH * (1 - k), op: 0 },
  md(s, lerpV(VP, VF, k), lerp(MD0, MD1, k)),
  { id: 'ln', html, bare: true, cardH: LNH * k, op: k }] })
const NX = { id: 'pn', ...nextFrac }, start = { id: 'md', fx: 0.75, fy: 0.8 }

F.push({ state: A(2), dur: 1.0 })
F.push({ state: A(2, { cur: { a: start } }), dur: 0.5 })
for (let i = 1; i <= 16; i++) F.push({ state: A(2, { cur: { a: start, b: NX, t: i / 16 } }), dur: dt })
for (let i = 0; i <= 5; i++) F.push({ state: A(2, { cur: { a: NX }, click: i / 6 }), dur: dt })
F.push({ state: A(3, { cur: { a: NX } }), fade: 0.25, dur: 0.5 })
F.push({ state: A(3), dur: 2.4 })
// fold away: fade the two cards, then collapse them while the camera pulls back
for (let i = 1; i <= 9; i++) F.push({ state: A(3, { op: 1 - i / 9 }), dur: dt })
const L = [
  [4, line('<b>“guests”</b> → Entity', 'Guest, identified by guest_no &lt;pi&gt;'), 0.8],
  [5, line('<b>“bookings”</b> → Entity', 'Booking, with its dates'), 0.8],
  [6, line('<b>“Each booking is made by one guest”</b>', 'Guest 1,1 — 0,n Booking · the FK goes into BOOKING'), 0.9],
  [7, line('<b>“One booking can include several rooms”</b>, a room appears in many bookings', 'many-to-many → intermediate entity Booked Room'), 1.7],
  [8, line('Booked Room is identified through Booking', 'Booking 1,1 — 1,n Booked Room · ▲ dependent'), 0.8],
  [9, line('…and through Room', 'Room 1,1 — 0,n Booked Room · PK = (booking_id, room_no)'), 0.8],
  [10, line('<b>The finished model</b>', '5 entities, 4 relationships → 5 tables'), 1.5],
]
for (let i = 1; i <= 20; i++) F.push({ state: B(3, ease(i / 20), L[0][1], foot(3, '⏩ Steps 4–10')), dur: dt })
for (const [s, html, d] of L) F.push({ state: B(s, 1, html, foot(s, s < 10 ? `⏩ Step ${s} of 10` : '✓ Step 10 of 10 · 5 tables')), fade: 0.2, dur: d })
fs.writeFileSync('watch.json', JSON.stringify(F))
