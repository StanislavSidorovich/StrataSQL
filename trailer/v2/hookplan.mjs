// Hook. A (chosen): opens on the finished Hotel model — the face of the app — then Physical and SQL.
// B (old): the task text first. `node hookplan.mjs A` → hookA.json, `node hookplan.mjs` → hook2.json.
import fs from 'fs'
const { tabs } = JSON.parse(fs.readFileSync('hk/meta.json', 'utf8'))
const A = process.argv[2] === 'A'
const dt = 1 / 30, F = []
const NAMES = A ? ['Conceptual', 'Physical', 'SQL'] : ['Text', 'Conceptual', 'Physical', 'SQL']
const foot = on => `<div id="steps">${NAMES.map((n, i) => `<span class="${i === on ? 'on' : ''}">${n}</span>`).join('<i style="font-style:normal">→</i>')}</div><div>model.quaera.app</div>`
const CAP1 = A ? 'Learn database design —<br><em>by doing</em>' : 'From requirements to SQL —<br><em>in your browser</em>'
const CAP2 = A ? 'From diagram to real SQL —<br><em>any model, even yours</em>' : CAP1
const o = A ? 0 : 1 // index shift of the step chips
const win = (cap, img, on, cur, click) => ({ cap, foot: foot(on), cur, click, blocks: [A ? { id: 'w', img, view: { x: 0, y: 0, w: 1, h: 1 }, camW: 1000, maxH: 700 } : { id: 'w', img, cardH: 700, pad0: true, maxH: 700 }] })
const P = { id: 'w', ...tabs.pdm }, S = { id: 'w', ...tabs.sql }, start = { id: 'w', fx: 0.8, fy: 0.75 }
// A opens on a close-up of the diagram, then pulls back to the whole app window
const VD = { x: 0.055, y: 0.2, w: 0.905, h: 0.68 }, VW = { x: 0, y: 0, w: 1, h: 1 }
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const camera = v => ({ cap: CAP1, foot: foot(0), blocks: [{ id: 'w', img: 'hk/cdm.png', view: v, camW: 1000, maxH: 700 }] })
if (A) {
  F.push({ state: camera(VD), dur: 1.3 })
  for (let i = 1; i <= 15; i++) { const t = ease(i / 15); F.push({ state: camera({ x: VD.x * (1 - t), y: VD.y * (1 - t), w: VD.w + (1 - VD.w) * t, h: VD.h + (1 - VD.h) * t }), dur: dt }) }
}
else {
  F.push({ state: { cap: CAP1, foot: foot(0), blocks: [{ id: 't', img: 'hk/text.png', cover: true, cardH: 700 }] }, dur: 1.2 })
}
F.push({ state: win(CAP1, 'hk/cdm.png', o, { a: start }), fade: A ? 0 : 0.3, dur: A ? 0.2 : 0.3 })
for (let i = 1; i <= 14; i++) F.push({ state: win(CAP1, 'hk/cdm.png', o, { a: start, b: P, t: i / 14 }), dur: dt })
for (let i = 0; i < 5; i++) F.push({ state: win(CAP1, 'hk/cdm.png', o, { a: P }, i / 5), dur: dt })
F.push({ state: win(CAP2, 'hk/pdm.png', 1 + o, { a: P }), fade: A ? 0.3 : 0.12, dur: 0.6 })
for (let i = 1; i <= 8; i++) F.push({ state: win(CAP2, 'hk/pdm.png', 1 + o, { a: P, b: S, t: i / 8 }), dur: dt })
for (let i = 0; i < 5; i++) F.push({ state: win(CAP2, 'hk/pdm.png', 1 + o, { a: S }, i / 5), dur: dt })
for (let i = 0; i < 54; i++) F.push({ state: win(CAP2, `hk/sql${i}.png`, 2 + o, i < 10 ? { a: S } : undefined), fade: i === 0 ? 0.12 : 0, dur: i === 53 ? 0.7 : dt })
fs.writeFileSync(A ? 'hookA.json' : 'hook2.json', JSON.stringify(F))
