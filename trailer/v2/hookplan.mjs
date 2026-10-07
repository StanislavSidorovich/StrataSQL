import fs from 'fs'
const { tabs } = JSON.parse(fs.readFileSync('hk/meta.json', 'utf8'))
const CAP = process.argv[2] === 'A' ? 'From requirements to SQL —<br><em>any model, even yours</em>' : 'From requirements to SQL —<br><em>in your browser</em>'
const dt = 1 / 30, F = []
const NAMES = ['Text', 'Conceptual', 'Physical', 'SQL']
const foot = on => `<div id="steps">${NAMES.map((n, i) => `<span class="${i === on ? 'on' : ''}">${n}</span>`).join('<i style="font-style:normal">→</i>')}</div><div>model.quaera.app</div>`
const win = (img, on, cur, pressed) => ({ cap: CAP, foot: foot(on), cur, blocks: [{ id: 'w', img, cardH: 700, pad0: true, maxH: 700 }] })
F.push({ state: { cap: CAP, foot: foot(0), blocks: [{ id: 't', img: 'hk/text.png', cover: true, cardH: 700 }] }, dur: 1.2 })
const P = { id: 'w', ...tabs.pdm }, S = { id: 'w', ...tabs.sql }, start = { id: 'w', fx: 0.8, fy: 0.75 }
F.push({ state: win('hk/cdm.png', 1, { a: start }), fade: 0.3, dur: 0.3 })
for (let i = 1; i <= 14; i++) F.push({ state: win('hk/cdm.png', 1, { a: start, b: P, t: i / 14 }), dur: dt })
F.push({ state: win('hk/cdm.png', 1, { a: P }), dur: 0.15 })
F.push({ state: win('hk/pdm.png', 2, { a: P }), fade: 0.12, dur: 0.45 })
for (let i = 1; i <= 8; i++) F.push({ state: win('hk/pdm.png', 2, { a: P, b: S, t: i / 8 }), dur: dt })
F.push({ state: win('hk/pdm.png', 2, { a: S }), dur: 0.15 })
for (let i = 0; i < 54; i++) F.push({ state: win(`hk/sql${i}.png`, 3, i < 10 ? { a: S } : undefined), fade: i === 0 ? 0.12 : 0, dur: i === 53 ? 0.5 : dt })
fs.writeFileSync(process.argv[2] === 'A' ? 'hookA.json' : 'hook2.json', JSON.stringify(F))
