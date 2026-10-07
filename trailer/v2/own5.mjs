// variant B only: "or your own model" — an own model file opened in the app, then its SQL.
import { chromium } from 'playwright'
import fs from 'fs'
fs.rmSync('ow', { recursive: true, force: true }); fs.mkdirSync('ow')
const W = 833, H = 583
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3.6 })
await p.goto('http://localhost:5173/')
await p.getByText('Start with an empty model').click()
await p.locator('input[type=file]').first().setInputFiles('own.strata.json')
await p.waitForTimeout(900)
await p.getByTitle('Hide the properties').click({ timeout: 1500 }).catch(() => {})
await p.getByTitle('Fit the model on screen').click(); await p.waitForTimeout(800)
await p.mouse.move(W / 2, H / 2 + 40); await p.mouse.wheel(0, -260); await p.waitForTimeout(500)
await p.mouse.move(1, 1); await p.waitForTimeout(200)
await p.screenshot({ path: 'ow/model.png' })
const r = await p.getByRole('tab', { name: /^SQL/ }).boundingBox()
await p.getByRole('tab', { name: /^SQL/ }).click(); await p.waitForTimeout(700)
await p.addStyleTag({ content: 'pre, pre * { font-size: 17.5px !important; line-height: 1.45 !important }' }); await p.waitForTimeout(300)
await p.mouse.move(1, 1)
const pre = p.locator('pre').first()
const N = 30, dist = 230
for (let i = 0; i < N; i++) {
  const t = i / (N - 1), k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  await pre.evaluate((e, y) => { let n = e; while (n && n.scrollHeight <= n.clientHeight + 2) n = n.parentElement; (n ?? document.scrollingElement).scrollTop = y }, Math.round(k * dist))
  await p.screenshot({ path: `ow/sql${i}.png` })
}
const sql = { fx: (r.x + r.width * 0.55) / W, fy: (r.y + r.height * 0.65) / H }
const CAP = 'Or bring<br><em>your own model</em>'
const dt = 1 / 30, F = []
const win = (img, cur, pill, click) => ({ cap: CAP, pill, cur, click, blocks: [{ id: 'w', img, cardH: 700, pad0: true, maxH: 700 }] })
const m0 = { id: 'w', fx: 0.55, fy: 0.75 }, S = { id: 'w', ...sql }
F.push({ state: win('ow/model.png', { a: m0 }, 'Your own model, e.g. coursework'), dur: 0.9 })
for (let i = 1; i <= 14; i++) F.push({ state: win('ow/model.png', { a: m0, b: S, t: i / 14 }, 'Your own model, e.g. coursework'), dur: dt })
for (let i = 0; i < 6; i++) F.push({ state: win('ow/model.png', { a: S }, 'Your own model, e.g. coursework', i / 6), dur: dt })
for (let i = 0; i < N; i++) F.push({ state: win(`ow/sql${i}.png`, i < 8 ? { a: S } : undefined, '→ SQL Server script'), fade: i === 0 ? 0.2 : 0, dur: i === N - 1 ? 1.0 : dt })
fs.writeFileSync('own.json', JSON.stringify(F))
await b.close()
