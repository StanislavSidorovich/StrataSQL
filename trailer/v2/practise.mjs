// ② Practise: Hotel trainer, level 3 (build it yourself). Captures the real app at deviceScaleFactor 3 and
// writes practise.json for render.mjs. Beats: double-click → entity; name; attribute; L01 → tick PI;
// ⏩ the other entities (injected from hotel-ref.json, minus the "makes" link); drag one link; Check.
import { chromium } from 'playwright'
import fs from 'fs'
fs.rmSync('pr', { recursive: true, force: true }); fs.mkdirSync('pr')
const ref = JSON.parse(fs.readFileSync('hotel-ref.json', 'utf8'))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 3 })
await p.goto('http://localhost:5173/')
await p.getByText('Start with an empty model').click()
await p.getByRole('button', { name: /Examples/ }).click()
await p.getByRole('menuitem', { name: 'Other cases…' }).click()
await p.getByRole('button', { name: /Build it yourself/ }).nth(1).click()
await p.waitForTimeout(1000)
await p.mouse.move(1, 1)

const CAP = 'Build it — <em>the trainer checks</em>'
const dt = 1 / 30, F = []
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
let n = 0
const snap = async (clip) => { const f = `pr/s${n++}.png`; await p.screenshot({ path: f, clip }); return f }
const fr = (id, clip, q) => ({ id, fx: (q.x - clip.x) / clip.width, fy: (q.y - clip.y) / clip.height })
const mid = (r, fx = 0.5, fy = 0.6) => ({ x: r.x + r.width * fx, y: r.y + r.height * fy })
const box = loc => loc.boundingBox()
// glide the stage cursor from a to b (both already {id,fx,fy}), state builder S(cur)
const glide = (S, a, z, frames = 14) => { for (let i = 1; i <= frames; i++) F.push({ state: S({ a, b: z, t: i / frames }), dur: dt }) }
const clickFx = (S, at, k = 6) => { for (let i = 0; i < k; i++) F.push({ state: { ...S({ a: at }), click: i / k }, dur: dt }) }

// ── beat 1: empty canvas with the app's own hint; double-click above it
const HINT = { x: 420, y: 190, width: 516, height: 410 }
const hintImg = await snap(HINT)
const pill1 = 'Double-click the canvas → a new entity'
const S1 = (cur, img = hintImg) => ({ mode: 2, cap: CAP, pill: pill1, cur, blocks: [{ id: 'cv', label: 'The canvas', img, maxH: 760, cardH: 800 }] })
const DBL = { x: 600, y: 300 }
const c0 = { id: 'cv', fx: 0.88, fy: 0.95 }, cD = fr('cv', HINT, DBL)
F.push({ state: S1({ a: c0 }), dur: 0.9 })
glide(S1, c0, cD, 16)
F.push({ state: S1({ a: cD }), dur: 0.15 })
clickFx(S1, cD, 4); clickFx(S1, cD, 6)
await p.mouse.dblclick(DBL.x, DBL.y); await p.waitForTimeout(700); await p.mouse.move(1, 1); await p.waitForTimeout(200)
F.push({ state: S1({ a: cD }, await snap(HINT)), dur: 0.7 })

// ── beat 2: close-up — the entity, the checker's note, the properties panel
const node = await box(p.locator('.react-flow__node').first())
const ENT = { x: node.x - 30, y: node.y - 18, width: node.width + 60, height: 112 }
const pane = await p.evaluate(() => { const a = document.querySelector('aside.panel').getBoundingClientRect(), sec = document.querySelector('aside.panel section.panel-section').getBoundingClientRect(); return { left: a.left, top: sec.top } })
const PX = pane.left + 4, PW = 1366 - PX - 4
const note = async () => p.evaluate(() => { const ls = [...document.querySelectorAll('aside.panel .issue-list .issue')].map(e => e.getBoundingClientRect()); if (!ls.length) return null; const top = Math.min(...ls.map(r => r.top)), bottom = Math.max(...ls.map(r => r.bottom)); return { top, height: bottom - top } })
let nb = await note()
const NOTE = { x: PX, y: nb.top - 6, width: PW, height: nb.height + 12 }
const NAME = { x: PX, y: pane.top + 4, width: PW, height: 92 }
const shots = async (props) => ({ ent: await snap(ENT), note: await snap(NOTE), props: await snap(props) })
const S2 = (imgs, pill, propsLabel) => cur => ({ mode: 2, cap: CAP, pill, cur, blocks: [
  { id: 'ent', label: 'Your entity', img: imgs.ent, maxH: 260, cardH: 275 },
  { id: 'note', label: 'The trainer’s note', img: imgs.note, maxH: 170, cardH: 185 },
  { id: 'props', label: propsLabel, img: imgs.props, maxH: 290, cardH: 300 }] })
const nameBox = await box(p.locator('aside.panel section.panel-section input.input').first())
const nameC = mid(nameBox, 0.3, 0.6)
let imgs = await shots(NAME)
let S = S2(imgs, 'Type its name', 'Properties')
F.push({ state: S({ a: fr('props', NAME, nameC) }), fade: 0.35, dur: 0.5 })
await p.keyboard.press('Control+A')
for (const ch of 'Guest') {
  await p.keyboard.type(ch); await p.waitForTimeout(90)
  imgs = await shots(NAME); S = S2(imgs, 'Type its name', 'Properties')
  F.push({ state: S({ a: fr('props', NAME, nameC) }), dur: 0.09 })
}
await p.keyboard.press('Enter'); await p.waitForTimeout(300)
imgs = await shots(NAME); S = S2(imgs, 'Type its name', 'Properties')
F.push({ state: S({ a: fr('props', NAME, nameC) }), dur: 0.6 })

// attributes section, cropped from its header (the panel moves when the note changes)
const attTop = () => p.evaluate(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length <= 2 && /^Attributes \(\d+\)/i.test(e.textContent.trim())); return e.getBoundingClientRect().top })
const ATT = async () => ({ x: PX, y: (await attTop()) - 10, width: PW, height: 150 })
const noteClip = async () => { const r = await note(); return r ? { x: PX, y: r.top - 6, width: PW, height: Math.max(r.height + 12, NOTE.height) } : null }
const shotsA = async () => { const A = await ATT(); const N = await noteClip(); return { A, imgs: { ent: await snap(ENT), note: N ? await snap(N) : await snap(NOTE), props: await snap(A) } } }
let { A, imgs: ia } = await shotsA()
const add = await box(p.getByRole('button', { name: /\+ Attribute/ }))
let addC = mid(add)
S = S2(ia, 'Add an attribute', 'Attributes')
const nameAtStage = fr('props', A, nameC)
F.push({ state: S(undefined), fade: 0.3, dur: 0.3 })
glide(S, { id: 'props', fx: 0.3, fy: 0.2 }, fr('props', A, addC), 12)
clickFx(S, fr('props', A, addC))
await p.getByRole('button', { name: /\+ Attribute/ }).click(); await p.waitForTimeout(350)
;({ A, imgs: ia } = await shotsA())
const at = fr('props', A, addC)
for (const part of ['guest', '_no']) {
  await p.keyboard.type(part); await p.waitForTimeout(90)
  ;({ A, imgs: ia } = await shotsA()); F.push({ state: S2(ia, 'Add an attribute', 'Attributes')({ a: at }), dur: 0.09 })
}
const sel = p.locator('select[aria-label="Data type"]').first(), selC = mid(await box(sel))
const atSel = fr('props', A, selC)
glide(S2(ia, 'Add an attribute', 'Attributes'), at, atSel, 10)
clickFx(S2(ia, 'Add an attribute', 'Attributes'), atSel)
await sel.selectOption('Integer'); await p.waitForTimeout(400); await p.mouse.move(1, 1)
;({ A, imgs: ia } = await shotsA())
S = S2(ia, 'No key yet → the trainer flags it', 'Attributes')
F.push({ state: S({ a: atSel }), dur: 1.6 })
// tick PI
const piBox = await p.evaluate(() => { const inp = [...document.querySelectorAll('input')].find(i => i.value === 'guest_no'); let r = inp; while (r && !r.querySelector('input[type=checkbox]')) r = r.parentElement; return r.querySelector('input[type=checkbox]').getBoundingClientRect().toJSON() })
const piC = mid(piBox, 0.5, 0.55), atPI = fr('props', A, piC)
glide(S, atSel, atPI, 10)
F.push({ state: { ...S({ a: atPI }), pill: 'Tick PI → guest_no is the key' }, dur: 0.3 })
clickFx(cur => ({ ...S(cur), pill: 'Tick PI → guest_no is the key' }), atPI)
await p.mouse.click(piC.x, piC.y); await p.waitForTimeout(500); await p.mouse.move(1, 1); await p.waitForTimeout(200)
;({ A, imgs: ia } = await shotsA())
S = S2(ia, 'Tick PI → guest_no is the key ✓', 'Attributes')
F.push({ state: S({ a: atPI }), fade: 0.15, dur: 1.2 })

// ── beat 3: ⏩ the other entities (injected), then draw the missing link
const mine = JSON.parse(await p.evaluate(() => localStorage.getItem('stratasql.trainer.model')))
mine.entities[0].position = ref.entities.find(e => e.name === 'Guest').position
mine.entities.push(...ref.entities.filter(e => e.name !== 'Guest'))
mine.domains = ref.domains
mine.relationships = ref.relationships.filter(r => r.name !== 'makes' && r.name !== 'includes')
await p.evaluate(m => localStorage.setItem('stratasql.trainer.model', JSON.stringify(m)), mine)
await p.reload(); await p.waitForTimeout(1500)
await p.getByTitle('Fit the model on screen').click(); await p.waitForTimeout(900)
await p.mouse.move(1, 1)
const ent = name => p.locator(`[data-testid="entity-${name}"]`)
const rs = await p.locator('[data-testid^="entity-"]').evaluateAll(ns => ns.map(n => n.getBoundingClientRect().toJSON()))
const L = Math.min(...rs.map(r => r.left)) - 30, T = Math.min(...rs.map(r => r.top)) - 30
const CV = { x: L, y: T, width: Math.max(...rs.map(r => r.right)) + 30 - L, height: Math.max(...rs.map(r => r.bottom)) + 30 - T }
const chk = await box(p.getByRole('button', { name: /^Check my model/ }))
const BTN = { x: chk.x - 8, y: chk.y - 8, width: chk.width + 16, height: chk.height + 16 }
const btnImg = await snap(BTN)
const S3 = (img, pill, label = 'Your model') => cur => ({ mode: 2, cap: CAP, pill, cur, blocks: [
  { id: 'cv', label, img, maxH: 640 },
  { id: 'btn', img: btnImg, small: true, h: 92 }] })
let cvImg = await snap(CV)
F.push({ state: S3(cvImg, '⏩ 4 more entities, the same way', '⏩ The other entities')(undefined), fade: 0.4, dur: 1.1 })
const h = await box(ent('Guest').locator('.react-flow__handle.source').first())
const tb = await box(ent('Booking'))
const s0 = mid(h, 0.5, 0.5), e0 = { x: tb.x + tb.width * 0.35, y: tb.y + tb.height * 0.45 }
const pillL = 'Drag from ● onto another entity → a relationship'
S = S3(cvImg, pillL)
const cStart = { id: 'cv', fx: 0.5, fy: 0.95 }
F.push({ state: S({ a: cStart }), dur: 0.2 })
glide(S, cStart, fr('cv', CV, s0), 14)
F.push({ state: S({ a: fr('cv', CV, s0) }), dur: 0.2 })
await p.mouse.move(s0.x, s0.y); await p.mouse.down()
for (let i = 1; i <= 18; i++) {
  const k = ease(i / 18), q = { x: s0.x + (e0.x - s0.x) * k, y: s0.y + (e0.y - s0.y) * k }
  await p.mouse.move(q.x, q.y); await p.waitForTimeout(60)
  F.push({ state: S3(await snap(CV), pillL)({ a: fr('cv', CV, q) }), dur: dt })
}
await p.mouse.up(); await p.waitForTimeout(500)
await p.mouse.move(1, 1); await p.waitForTimeout(300)
cvImg = await snap(CV)
const atE = fr('cv', CV, e0)
S = S3(cvImg, 'A relationship: Guest — Booking')
F.push({ state: S({ a: atE }), dur: 0.7 })

// ── beat 4: Check
const bC = { id: 'btn', fx: 0.6, fy: 0.6 }
S = S3(cvImg, 'Done? Check it against the reference')
glide(S, atE, bC, 12)
F.push({ state: S({ a: bC }), dur: 0.2 })
clickFx(S, bC)
await p.getByRole('button', { name: /^Check my model/ }).click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: /^Check again/ }).evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300)
await p.evaluate(() => { const n = [...document.querySelectorAll('.trainer-pane button')].find(b => /^Next:/.test(b.textContent)); if (n) n.style.display = 'none'; const e = [...document.querySelectorAll('.trainer-pane p, .trainer-pane div')].find(e => e.children.length <= 1 && /^Model check: [0-9]/.test(e.textContent.trim())); if (e) e.style.display = 'none' })
await p.screenshot({ path: 'pr/after-check.png' })
const ca = await box(p.getByRole('button', { name: /^Check again/ }))
const endY = await p.evaluate(() => { const m = [...document.querySelectorAll('.trainer-pane *')].find(e => /^Matched \(/.test(e.textContent.trim()) && e.children.length <= 1); return m.getBoundingClientRect().top - 4 })
const FB = { x: 8, y: ca.y + ca.height + 4, width: 364, height: endY - (ca.y + ca.height + 4) }
await snap(FB)
const fbImg = `pr/s${n - 1}.png`
const tx = await p.evaluate(() => document.querySelector('.trainer-pane').innerText.match(/Check again[\s\S]*?Matched/)[0])
console.log(tx)
const score = (tx.match(/(\d+)%/) ?? [])[0]
F.push({ state: { mode: 2, cap: CAP, pill: `Check → ${score}: what is still missing`, blocks: [{ id: 'fb', label: 'Your model vs the reference', img: fbImg, maxH: 760 }] }, fade: 0.35, dur: 3.3 })
fs.writeFileSync('pr/after-check.txt', await p.evaluate(() => document.querySelector('.trainer-pane')?.innerText ?? document.body.innerText))
fs.writeFileSync('practise.json', JSON.stringify(F))
fs.writeFileSync('pr/meta.json', JSON.stringify({ CV, BTN, HINT }))
await b.close()
