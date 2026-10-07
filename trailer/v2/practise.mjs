// ② Practise: Hotel trainer, level 3 (build it yourself). Captures the real app and writes practise.json.
// The canvas is always shot through one fixed viewport (CSS-pinned), and Guest and Booking are created at
// their places in the reference layout, so the camera can pull back and the other entities appear around them.
// Beats: double-click (the app's hint) → Guest, name, guest_no, L01 → tick PI → ✓; ⏩ Booking the same way;
// drag the Guest — Booking link; pull back, ⏩ the other entities (injected from hotel-ref.json); Check.
import { chromium } from 'playwright'
import fs from 'fs'
fs.rmSync('pr', { recursive: true, force: true }); fs.mkdirSync('pr')
const ref = JSON.parse(fs.readFileSync('hotel-ref.json', 'utf8'))
const refPos = name => ref.entities.find(e => e.name === name).position
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 4 })
await p.goto('http://localhost:5173/')
await p.getByText('Start with an empty model').click()
await p.getByRole('button', { name: /Examples/ }).click()
await p.getByRole('menuitem', { name: 'Other cases…' }).click()
await p.getByRole('button', { name: /Build it yourself/ }).nth(1).click()
await p.waitForTimeout(1000)
await p.mouse.move(1, 1)

// ── the fixed view: scale 1, the reference layout centred in the canvas
const pane = await p.locator('.react-flow').boundingBox()
const TX = 9, TY = 190
const PIN = `.react-flow__viewport { transform: translate(${TX}px, ${TY}px) scale(1) !important }`
await p.addStyleTag({ content: PIN })
const at = f => ({ x: pane.x + TX + f.x, y: pane.y + TY + f.y }) // flow → screen, in the pinned view
const FULL = { x: pane.x + TX + 15, y: pane.y + TY + 15, width: 970, height: 540 }
const frac = q => ({ fx: (q.x - FULL.x) / FULL.width, fy: (q.y - FULL.y) / FULL.height })
const view = (x0, y0, x1, y1) => ({ x: (x0 - FULL.x) / FULL.width, y: (y0 - FULL.y) / FULL.height, w: (x1 - x0) / FULL.width, h: (y1 - y0) / FULL.height })
// React Flow's own viewport moves (it centres a new entity); pan it back under the pinned picture before acting
const align = async () => {
  const t = await p.evaluate(() => document.querySelector('.react-flow__viewport').getAttribute('style'))
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t)
  const dx = TX - +m[1], dy = TY - +m[2]
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
  const g = { x: pane.x + 30, y: pane.y + 120 }
  await p.mouse.move(g.x, g.y); await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(g.x + dx * i / 10, g.y + dy * i / 10)
  await p.mouse.up(); await p.mouse.move(1, 1); await p.waitForTimeout(200)
}

const CAP = 'Build it — <em>the trainer checks</em>'
const dt = 1 / 30, F = []
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
let n = 0
const snap = async (clip) => { const f = `pr/s${n++}.png`; await p.screenshot({ path: f, clip }); return f }
const fr = (id, clip, q) => ({ id, fx: (q.x - clip.x) / clip.width, fy: (q.y - clip.y) / clip.height })
const mid = (r, fx = 0.5, fy = 0.6) => ({ x: r.x + r.width * fx, y: r.y + r.height * fy })
const box = loc => loc.boundingBox()
const glide = (S, a, z, frames = 14) => { for (let i = 1; i <= frames; i++) F.push({ state: S({ a, b: z, t: i / frames }), dur: dt }) }
const clickFx = (S, a, k = 6) => { for (let i = 0; i < k; i++) F.push({ state: { ...S({ a }), click: i / k }, dur: dt }) }
const lerpV = (u, v, t) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t, w: u.w + (v.w - u.w) * t, h: u.h + (v.h - u.h) * t })

const G = at(refPos('Guest')), B = at(refPos('Booking'))
const VH = view(pane.x + 25, 400, pane.x + 870, 720)        // the hint + where Guest goes
const VG = view(G.x - 30, G.y - 26, G.x + 200, G.y + 104)  // Guest close-up
const VP = view(G.x - 30, G.y - 26, B.x + 205, B.y + 150)  // Guest and Booking
const VF = { x: 0, y: 0, w: 1, h: 1 }
const cv = (img, v, o = {}) => ({ id: 'cv', label: o.label ?? 'The canvas', img, view: v, camW: o.camW ?? 1000, maxH: o.maxH ?? 640 })

// ── beat 1: the app's own hint; double-click where Guest belongs
await align()
let full = await snap(FULL)
const pill1 = 'Double-click the canvas → a new entity'
const S1 = img => cur => ({ mode: 2, cap: CAP, pill: pill1, cur, blocks: [cv(img, VH)] })
let S = S1(full)
const c0 = { id: 'cv', fx: 0.6, fy: 0.95 }, cG = { id: 'cv', ...frac({ x: G.x + 12, y: G.y + 10 }) }
F.push({ state: S({ a: c0 }), dur: 0.6 })
glide(S, c0, cG, 16)
F.push({ state: S({ a: cG }), dur: 0.12 })
clickFx(S, cG, 4); clickFx(S, cG, 6)
await p.mouse.dblclick(G.x, G.y); await p.waitForTimeout(800); await p.mouse.move(1, 1); await p.waitForTimeout(150)
F.push({ state: S1(await snap(FULL))({ a: cG }), dur: 0.6 })

// ── beat 2: close-up — the entity, the trainer's note, the properties panel
const aside = await p.evaluate(() => { const a = document.querySelector('aside.panel').getBoundingClientRect(), sec = document.querySelector('aside.panel section.panel-section').getBoundingClientRect(); return { left: a.left, top: sec.top } })
const PX = aside.left + 4, PW = 1800 - PX - 4
const note = () => p.evaluate(() => { const ls = [...document.querySelectorAll('aside.panel .issue-list .issue')].map(e => e.getBoundingClientRect()); if (!ls.length) return null; const top = Math.min(...ls.map(r => r.top)), bottom = Math.max(...ls.map(r => r.bottom)); return { top, height: bottom - top } })
const NAME = { x: PX, y: aside.top + 4, width: PW, height: 92 }
const OK = (who, key) => `<div class="okn">✓ No issues<small>${key} is ${who}’s key</small></div>`
const noteBlock = async okText => {
  const r = await note()
  return r ? { id: 'note', label: 'The trainer’s note', img: await snap({ x: PX, y: r.top - 6, width: PW, height: r.height + 12 }), maxH: 170, cardH: 185 }
    : { id: 'note', label: 'The trainer’s note', html: okText, cardH: 185 }
}
const attTop = () => p.evaluate(() => { const e = [...document.querySelectorAll('aside.panel *')].find(e => e.children.length <= 2 && /^Attributes \(\d+\)/i.test(e.textContent.trim())); return e.getBoundingClientRect().top })
let V = VG
// one picture of the 3-card layout; props: 'name' or 'att'
const S2 = async (pill, props, okText) => {
  const img = await snap(FULL), nb = await noteBlock(okText)
  const clip = props === 'name' ? NAME : { x: PX, y: (await attTop()) - 10, width: PW, height: 150 }
  const pi = await snap(clip), v = V
  const st = cur => ({ mode: 2, cap: CAP, pill, cur, blocks: [cv(img, st.v ?? v, { label: 'Your entity', maxH: 280 }), nb, { id: 'props', label: props === 'name' ? 'Properties' : 'Attributes', img: pi, maxH: 290, cardH: 300 }] })
  st.clip = clip
  return st
}
const nameC = mid(await box(p.locator('aside.panel section.panel-section input.input').first()), 0.3, 0.6)
S = await S2('Type its name', 'name')
F.push({ state: S({ a: fr('props', NAME, nameC) }), fade: 0.35, dur: 0.4 })
await p.keyboard.press('Control+A')
for (const part of ['Gu', 'est']) { await p.keyboard.type(part); await p.waitForTimeout(90); S = await S2('Type its name', 'name'); F.push({ state: S({ a: fr('props', NAME, nameC) }), dur: 0.12 }) }
await p.keyboard.press('Enter'); await p.waitForTimeout(300)
S = await S2('Type its name', 'name'); F.push({ state: S({ a: fr('props', NAME, nameC) }), dur: 0.4 })

S = await S2('Add an attribute', 'att')
let A = S.clip
const addC = mid(await box(p.getByRole('button', { name: /\+ Attribute/ })))
F.push({ state: S(undefined), fade: 0.3, dur: 0.2 })
glide(S, { id: 'props', fx: 0.3, fy: 0.2 }, fr('props', A, addC), 12)
clickFx(S, fr('props', A, addC))
await p.getByRole('button', { name: /\+ Attribute/ }).click(); await p.waitForTimeout(350)
await p.keyboard.type('guest_no'); await p.waitForTimeout(100)
await p.locator('select[aria-label="Data type"]').first().selectOption('Integer'); await p.waitForTimeout(400); await p.mouse.move(1, 1)
S = await S2('No key yet → the trainer flags it', 'att'); A = S.clip
F.push({ state: S({ a: fr('props', A, addC) }), fade: 0.15, dur: 1.4 })
const piBox = name => p.evaluate((name) => { const inp = [...document.querySelectorAll('aside.panel input')].find(i => i.value === name); let r = inp; while (r && !r.querySelector('input[type=checkbox]')) r = r.parentElement; return r.querySelector('input[type=checkbox]').getBoundingClientRect().toJSON() }, name)
const piC = mid(await piBox('guest_no'), 0.5, 0.55), atPI = fr('props', A, piC)
const pillPI = 'Tick PI → guest_no is the key'
glide(cur => ({ ...S(cur), pill: pillPI }), fr('props', A, addC), atPI, 10)
clickFx(cur => ({ ...S(cur), pill: pillPI }), atPI)
await p.mouse.click(piC.x, piC.y); await p.waitForTimeout(500); await p.mouse.move(1, 1); await p.waitForTimeout(200)
S = await S2(pillPI + ' ✓', 'att', OK('Guest', 'guest_no')); A = S.clip
F.push({ state: S({ a: fr('props', A, piC) }), fade: 0.15, dur: 1.0 })

// ── beat 3: ⏩ Booking the same way (the camera widens to the pair)
const pillB = '⏩ Booking, the same way'
S = await S2(pillB, 'att', OK('Guest', 'guest_no'))
for (let i = 1; i <= 14; i++) { S.v = lerpV(VG, VP, ease(i / 14)); F.push({ state: S(undefined), dur: dt }) }
V = VP; S.v = VP
const cB = { id: 'cv', ...frac({ x: B.x + 12, y: B.y + 10 }) }
glide(S, { id: 'cv', ...frac({ x: G.x + 90, y: G.y + 70 }) }, cB, 12)
clickFx(S, cB, 4); clickFx(S, cB, 4)
await align()
await p.mouse.dblclick(B.x, B.y); await p.waitForTimeout(800); await p.mouse.move(1, 1)
await p.keyboard.press('Control+A'); await p.keyboard.type('Booking'); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
S = await S2(pillB, 'name'); F.push({ state: S({ a: cB }), fade: 0.12, dur: 0.45 })
await p.getByRole('button', { name: /\+ Attribute/ }).click(); await p.waitForTimeout(300)
await p.keyboard.type('booking_id'); await p.locator('select[aria-label="Data type"]').first().selectOption('Integer'); await p.waitForTimeout(300)
const pb = mid(await piBox('booking_id'), 0.5, 0.55)
await p.mouse.click(pb.x, pb.y); await p.waitForTimeout(500); await p.mouse.move(1, 1); await p.waitForTimeout(200)
S = await S2(pillB + ' ✓', 'att', OK('Booking', 'booking_id')); F.push({ state: S({ a: cB }), fade: 0.15, dur: 0.7 })

// ── beat 4: link them (one big canvas card)
const chk = await box(p.getByRole('button', { name: /^Check my model/ }))
const btnImg = await snap({ x: chk.x - 8, y: chk.y - 8, width: chk.width + 16, height: chk.height + 16 })
const S4 = (img, v, pill, label = 'Your model') => cur => ({ mode: 2, cap: CAP, pill, cur, blocks: [cv(img, v, { label, maxH: 620 }), { id: 'btn', img: btnImg, small: true, h: 92 }] })
await align()
await p.mouse.click(pane.x + 30, pane.y + 120); await p.waitForTimeout(300); await p.mouse.move(1, 1)
await align()
full = await snap(FULL)
const pillL = 'Drag from ● onto another entity → a relationship'
S = S4(full, VP, pillL)
const h = await box(p.locator('[data-testid="entity-Guest"] .react-flow__handle.source').first())
const tb = await box(p.locator('[data-testid="entity-Booking"]'))
const s0 = mid(h, 0.5, 0.5), e0 = { x: tb.x + tb.width * 0.4, y: tb.y + tb.height * 0.5 }
const cStart = { id: 'cv', ...frac({ x: G.x + 90, y: G.y + 120 }) }
F.push({ state: S({ a: cStart }), fade: 0.35, dur: 0.3 })
glide(S, cStart, { id: 'cv', ...frac(s0) }, 12)
F.push({ state: S({ a: { id: 'cv', ...frac(s0) } }), dur: 0.15 })
await p.mouse.move(s0.x, s0.y); await p.mouse.down()
for (let i = 1; i <= 18; i++) {
  const k = ease(i / 18), q = { x: s0.x + (e0.x - s0.x) * k, y: s0.y + (e0.y - s0.y) * k }
  await p.mouse.move(q.x, q.y); await p.waitForTimeout(60)
  F.push({ state: S4(await snap(FULL), VP, pillL)({ a: { id: 'cv', ...frac(q) } }), dur: dt })
}
await p.mouse.up(); await p.waitForTimeout(500)
await p.mouse.click(pane.x + 30, pane.y + 120); await p.mouse.move(1, 1); await p.waitForTimeout(300)
full = await snap(FULL)
const atE = { id: 'cv', ...frac(e0) }
F.push({ state: S4(full, VP, 'Guest — Booking: a relationship')({ a: atE }), dur: 0.6 })

// ── beat 5: pull back, ⏩ the other entities appear in place
const pillR = '⏩ The other entities, the same way'
for (let i = 1; i <= 20; i++) F.push({ state: S4(full, lerpV(VP, VF, ease(i / 20)), pillR)(undefined), dur: dt })
const mine = JSON.parse(await p.evaluate(() => localStorage.getItem('stratasql.trainer.model')))
mine.entities.push(...ref.entities.filter(e => e.name !== 'Guest' && e.name !== 'Booking'))
mine.domains = ref.domains
mine.relationships.push(...ref.relationships.filter(r => r.name !== 'makes' && r.name !== 'includes'))
await p.evaluate(m => localStorage.setItem('stratasql.trainer.model', JSON.stringify(m)), mine)
await p.reload(); await p.waitForTimeout(1500)
await p.addStyleTag({ content: PIN })
await p.mouse.move(1, 1); await p.waitForTimeout(300)
full = await snap(FULL)
F.push({ state: S4(full, VF, pillR)(undefined), fade: 0.5, dur: 1.0 })

// ── beat 6: Check
const bC = { id: 'btn', fx: 0.6, fy: 0.6 }
S = S4(full, VF, 'Done? Check it against the reference')
glide(S, { id: 'cv', fx: 0.5, fy: 0.9 }, bC, 14)
F.push({ state: S({ a: bC }), dur: 0.15 })
clickFx(S, bC)
await p.getByRole('button', { name: /^Check my model/ }).click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: /^Check again/ }).evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300)
await p.evaluate(() => { const n = [...document.querySelectorAll('.trainer-pane button')].find(b => /^Next:/.test(b.textContent)); if (n) n.style.display = 'none'; const e = [...document.querySelectorAll('.trainer-pane p, .trainer-pane div')].find(e => e.children.length <= 1 && /^Model check: [0-9]/.test(e.textContent.trim())); if (e) e.style.display = 'none' })
const ca = await box(p.getByRole('button', { name: /^Check again/ }))
const endY = await p.evaluate(() => { const m = [...document.querySelectorAll('.trainer-pane *')].find(e => /^Matched \(/.test(e.textContent.trim()) && e.children.length <= 1); return m.getBoundingClientRect().top - 4 })
const tp = await p.evaluate(() => document.querySelector('.trainer-pane').getBoundingClientRect().toJSON())
const fbImg = await snap({ x: tp.left + 8, y: ca.y + ca.height + 4, width: tp.width - 16, height: endY - (ca.y + ca.height + 4) })
const tx = await p.evaluate(() => document.querySelector('.trainer-pane').innerText.match(/Check again[\s\S]*?Matched/)[0])
console.log(tx)
const score = (tx.match(/(\d+)%/) ?? [])[0]
F.push({ state: { mode: 2, cap: CAP, pill: `Check → ${score}: what is still missing`, blocks: [{ id: 'fb', label: 'Your model vs the reference', img: fbImg, maxH: 760 }] }, fade: 0.35, dur: 3.0 })
// ── beat 7: the same model, finished (the full reference) → Check again → 100 %
await p.evaluate(m => localStorage.setItem('stratasql.trainer.model', JSON.stringify({ ...m, name: 'Hotel — my model' })), ref)
await p.reload(); await p.waitForTimeout(1500)
await p.addStyleTag({ content: PIN }); await p.mouse.move(1, 1); await p.waitForTimeout(300)
const fullDone = await snap(FULL)
await p.getByRole('button', { name: /^Check my model/ }).click(); await p.waitForTimeout(1200)
await p.getByRole('button', { name: /^Check again/ }).evaluate(e => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300)
await p.evaluate(() => { const n = [...document.querySelectorAll('.trainer-pane button')].find(b => /^Next:/.test(b.textContent)); if (n) n.style.display = 'none' })
const ca2 = await box(p.getByRole('button', { name: /^Check again/ }))
const done = await box(p.locator('.trainer-pane .trainer-done').first())
const doneImg = await snap({ x: tp.left + 8, y: ca2.y - 6, width: tp.width - 16, height: done.y + done.height + 10 - (ca2.y - 6) })
console.log(await p.evaluate(() => document.querySelector('.trainer-pane').innerText.match(/Check again[\s\S]*?model\./)[0]))
F.push({ state: { mode: 2, cap: CAP, pill: 'Fix what is missing → 100 % ✓', blocks: [cv(fullDone, VF, { label: 'Your finished model', maxH: 500 }), { id: 'fb', img: doneImg, maxH: 190 }] }, fade: 0.45, dur: 3.0 })
fs.writeFileSync('practise.json', JSON.stringify(F))
await b.close()
