// Records a Strata story (#30) in Present mode: CDP screencast frames (with timestamps) → H.264 MP4.
// Run from this folder with the dev server up: node record-story.mjs <story.strata-story.json> <out.mp4> [url]
// TARGET=133 scales the reading pauses to about that many seconds; CRF=24 makes a smaller file.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ffmpeg = require('ffmpeg-static')

const [storyPath, out, url = 'http://localhost:5175'] = process.argv.slice(2)
const storyText = readFileSync(storyPath, 'utf8')
const story = JSON.parse(storyText)
const words = (b) => [b.title, ...[b.quote ?? []].flat(), ...[b.text ?? []].flat()].join(' ').split(/\s+/).filter(Boolean).length
// Animation ~1.5 s, then reading at ~3.2 words/s.
const holds = story.beats.map((b) => Math.min(10, Math.max(4, 1.8 + words(b) / 4)))
holds[holds.length - 1] += 2
// Optional target length (s): reading time is scaled, never below 3 s a beat (the animation needs ~1.5 s).
const target = Number(process.env.TARGET || 0)
if (target) {
  const fixed = holds.length * 3
  const extra = holds.reduce((a, b) => a + b - 3, 0)
  const k = Math.max(0, (target - fixed) / extra)
  holds.forEach((h, i) => (holds[i] = 3 + (h - 3) * k))
}
console.log('planned', Math.round(holds.reduce((a, b) => a + b, 0)), 's')

const tmp = join(process.env.TEMP ?? '.', 'story-frames')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light' })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('stratasql.theme', 'light')
    // No real full screen in headless: it would shrink the page to the default 800x600 screen.
    Element.prototype.requestFullscreen = undefined
  } catch {}
})
const page = await ctx.newPage()
await page.goto(url)
await page.waitForTimeout(1500)
await page.keyboard.press('Escape')
await page.evaluate((t) => {
  const input = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept.includes('.pdm'))
  const dt = new DataTransfer()
  dt.items.add(new File([t], 'story.strata-story.json', { type: 'application/json' }))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, storyText)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: '⛶ Present' }).click()
// The video needs no controls; the progress line at the bottom stays.
await page.addStyleTag({ content: '.story-presenter-bar{display:none!important} .notice-toast{display:none!important}' })
await page.keyboard.press('Home')
await page.waitForTimeout(1500)

const cdp = await ctx.newCDPSession(page)
const frames = []
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ data, t: metadata.timestamp })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080 })
const t0 = Date.now() / 1000
for (let k = 0; k < holds.length; k++) {
  if (k > 0) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(holds[k] * 1000)
}
const tEnd = Date.now() / 1000
await cdp.send('Page.stopScreencast')
await browser.close()

console.log('frames', frames.length)
const lines = []
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`
  writeFileSync(join(tmp, name), Buffer.from(f.data, 'base64'))
  const next = frames[i + 1]?.t ?? tEnd
  lines.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`)
})
lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`)
writeFileSync(join(tmp, 'list.txt'), lines.join('\n'))
execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', 'fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p', '-c:v', 'libx264', '-crf', process.env.CRF || '18', '-preset', 'slow', '-movflags', '+faststart', out], { stdio: 'inherit' })
console.log('wrote', out, 'first frame at', (frames[0].t - t0).toFixed(2))
