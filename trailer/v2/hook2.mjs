import { chromium } from 'playwright'
import fs from 'fs'
fs.mkdirSync('hk', { recursive: true })
const b = await chromium.launch()
// text: walkthrough spec at the last step, fully highlighted
{
  const p = await b.newPage({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 3 })
  await p.goto('http://localhost:5173/')
  await p.getByText('Start with an empty model').click()
  await p.getByRole('button', { name: /Examples/ }).click()
  await p.getByRole('menuitem', { name: 'Other cases…' }).click()
  await p.getByRole('button', { name: /Watch it built/ }).nth(1).click()
  await p.waitForTimeout(800)
  await p.getByLabel(/Ask me before/).uncheck()
  for (let i = 0; i < 10; i++) { await p.getByRole('button', { name: /^(Start|Next).*→/ }).first().click(); await p.waitForTimeout(200) }
  await p.evaluate(() => { const b = document.querySelector('.walk-spec'); b.style.maxHeight = 'none'; b.style.height = 'auto'; b.style.overflow = 'visible'; b.scrollTop = 0 })
  await p.waitForTimeout(300)
  await p.locator('.walk-spec').screenshot({ path: 'hk/text.png' })
  await p.close()
}
// app window 1000x700 shown at css 833x583
const W = 833, H = 583
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3.6 })
await p.goto('http://localhost:5173/')
await p.getByText('Start with an empty model').click()
await p.getByRole('button', { name: /Examples/ }).click()
await p.getByRole('menuitem', { name: 'Hotel' }).nth(1).click()
await p.waitForTimeout(600)
await p.getByTitle('Hide the properties').click({ timeout: 1500 }).catch(() => {})
await p.getByTitle('Fit the model on screen').click(); await p.waitForTimeout(800)
const frac = async (loc) => { const r = await loc.boundingBox(); return { fx: (r.x + r.width * 0.55) / W, fy: (r.y + r.height * 0.65) / H } }
const tabs = {}
for (const [k, re] of [['pdm', /Physical|PDM/], ['sql', /^SQL/]]) tabs[k] = await frac(p.getByRole('tab', { name: re }))
await p.mouse.move(1, 1)
await p.screenshot({ path: 'hk/cdm.png' })
await p.getByRole('tab', { name: /Physical|PDM/ }).click(); await p.waitForTimeout(500)
await p.getByTitle('Fit the model on screen').click(); await p.waitForTimeout(600)
await p.mouse.move(W / 2, H / 2 + 80); await p.mouse.wheel(0, -75); await p.waitForTimeout(500)
await p.mouse.move(1, 1); await p.waitForTimeout(300)
await p.screenshot({ path: 'hk/pdm.png' })
await p.getByRole('tab', { name: /^SQL/ }).click(); await p.waitForTimeout(700)
// SQL: zoom text a little via CSS zoom on the code block, then scroll
const pre = p.locator('pre').first()
await p.addStyleTag({ content: 'pre, pre * { font-size: 17.5px !important; line-height: 1.45 !important }' }); await p.waitForTimeout(300)
const sc = await pre.evaluate(e => { let n = e; while (n && n.scrollHeight <= n.clientHeight + 2) n = n.parentElement; return n ? true : false })
const N = 54, dist = 520
for (let i = 0; i < N; i++) {
  const t = i / (N - 1), k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  await pre.evaluate((e, y) => { let n = e; while (n && n.scrollHeight <= n.clientHeight + 2) n = n.parentElement; (n ?? document.scrollingElement).scrollTop = y }, Math.round(k * dist))
  await p.screenshot({ path: `hk/sql${i}.png` })
}
fs.writeFileSync('hk/meta.json', JSON.stringify({ tabs, sc }))
await b.close()
