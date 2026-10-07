// ① Watch: captures the Hotel walkthrough. Every model shot uses the viewport of step 10, so entities
// appear in place instead of the canvas re-fitting each step.
import { chromium } from 'playwright'
import fs from 'fs'
fs.rmSync('wa', { recursive: true, force: true }); fs.mkdirSync('wa')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 3 })
await p.goto('http://localhost:5173/')
await p.getByText('Start with an empty model').click()
await p.getByRole('button', { name: /Examples/ }).click()
await p.getByRole('menuitem', { name: 'Other cases…' }).click()
await p.getByRole('button', { name: /Watch it built/ }).nth(1).click()
await p.waitForTimeout(800)
await p.getByLabel(/Ask me before/).uncheck()
await p.mouse.move(1, 1); await p.evaluate(() => document.activeElement?.blur())
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(250) } await p.waitForTimeout(1100) }
await key('ArrowRight', 10)
const T = await p.evaluate(() => document.querySelector('.react-flow__viewport').style.transform)
const nodes = await p.locator('.react-flow__node').evaluateAll(ns => ns.map(n => n.getBoundingClientRect().toJSON()))
const pad = 28
const full = { x: Math.min(...nodes.map(r => r.left)) - pad, y: Math.min(...nodes.map(r => r.top)) - pad }
full.width = Math.max(...nodes.map(r => r.right)) + pad - full.x; full.height = Math.max(...nodes.map(r => r.bottom)) + pad - full.y
const pin = () => p.evaluate(t => { document.querySelector('.react-flow__viewport').style.transform = t }, T)
const head = () => p.evaluate(() => document.querySelector('.trainer-pane').innerText.split('\n').slice(2, 6).join(' | '))
await key('ArrowLeft', 10)
const meta = { steps: [] }
for (let s = 0; s <= 10; s++) {
  if (s) await key('ArrowRight')
  await pin(); await p.waitForTimeout(150)
  await p.screenshot({ path: `wa/m${s}.png`, clip: full })
  meta.steps.push(await head())
}
// steps 2 and 3 in detail: the text paragraph, the panel (Back/Next + first explanation card), the two entities
const two = await p.evaluate(() => {
  const ns = [...document.querySelectorAll('.react-flow__node')].filter(n => /^Room( Type)?/.test(n.textContent) && !/^Booked/.test(n.textContent)).map(n => n.getBoundingClientRect())
  return { l: Math.min(...ns.map(r => r.left)), t: Math.min(...ns.map(r => r.top)), r: Math.max(...ns.map(r => r.right)), b: Math.max(...ns.map(r => r.bottom)) }
})
const twoClip = { x: two.l - 24, y: two.t - 24, width: two.r - two.l + 48, height: two.b - two.t + 48 }
await key('ArrowLeft', 8) // step 2
for (const s of [2, 3]) {
  if (s === 3) await key('ArrowRight')
  const r = await p.evaluate(() => {
    const pane = document.querySelector('.trainer-pane').getBoundingClientRect()
    const back = [...document.querySelectorAll('.trainer-pane button')].find(b => /Back/.test(b.textContent)).getBoundingClientRect()
    const card = [...document.querySelectorAll('.trainer-pane div')].find(d => /^“/.test(d.textContent.trim()) && d.getBoundingClientRect().top > back.bottom && d.children.length >= 1 && getComputedStyle(d).borderTopWidth !== '0px').getBoundingClientRect()
    const span = [...document.querySelectorAll('.walk-spec p')].find(q => /room number/.test(q.textContent)); span.scrollIntoView({ block: 'center' })
    const para = span.getBoundingClientRect()
    return { panel: { x: pane.left + 8, y: back.top - 10, width: pane.width - 16, height: card.bottom + 5 - (back.top - 10) }, para: { x: para.left - 2, y: para.top - 6, width: para.width + 2, height: para.height + 12 }, next: [...document.querySelectorAll('.trainer-pane button')].find(b => /^Next/.test(b.textContent)).getBoundingClientRect().toJSON() }
  })
  await p.waitForTimeout(200); await pin(); await p.waitForTimeout(150)
  await p.screenshot({ path: `wa/panel${s}.png`, clip: r.panel })
  await p.screenshot({ path: `wa/text${s}.png`, clip: r.para })
  await p.screenshot({ path: `wa/two${s}.png`, clip: twoClip })
  meta[`s${s}`] = r
}
meta.nextFrac = { fx: (meta.s2.next.x + meta.s2.next.width * 0.55 - meta.s2.panel.x) / meta.s2.panel.width, fy: (meta.s2.next.y + meta.s2.next.height * 0.65 - meta.s2.panel.y) / meta.s2.panel.height }
fs.writeFileSync('wa/meta.json', JSON.stringify(meta, null, 1))
console.log(meta.steps.join('\n'), JSON.stringify(meta.s2.panel), JSON.stringify(meta.s3.panel), JSON.stringify(meta.s2.para), JSON.stringify(meta.s3.para))
await b.close()
