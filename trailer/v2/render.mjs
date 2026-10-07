// node render.mjs frames.json out.mp4 — frames: [{state, dur, fade?}] ; renders each frame, concat with durations.
// fade: s = crossfade from the previous picture over s seconds (30 fps) before the frame's own dur.
import { chromium } from 'playwright'
import { pathToFileURL } from 'url'
import fs from 'fs'
import { execFileSync } from 'child_process'
const [, , inFile, outFile] = process.argv
const frames = JSON.parse(fs.readFileSync(inFile, 'utf8'))
const dir = inFile.replace(/\.json$/, '_frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } })
await p.goto(pathToFileURL('stage4.html').href)
// Exact 30 fps: each picture is hard-linked into seq/ as many times as its duration needs
// (cumulative rounding), so no frame is dropped or doubled by timestamp rounding.
fs.mkdirSync(`${dir}/seq`)
let k = 0, prev = null, t = 0, out = 0
const shot = async (dur) => {
  const name = `${dir}/f${String(k++).padStart(4, '0')}.png`
  await p.screenshot({ path: name })
  t += dur
  while (out < Math.round(t * 30)) fs.linkSync(name, `${dir}/seq/${String(out++).padStart(5, '0')}.png`)
  return name
}
for (const f of frames) {
  await p.evaluate(s => render(s), f.state)
  const n = f.fade && prev ? Math.max(1, Math.round(f.fade * 30)) : 0
  for (let j = 1; j <= n; j++) { await p.evaluate(([src, o]) => fadeFrom(src, o), [prev, 1 - j / (n + 1)]); await shot(1 / 30) }
  if (n) await p.evaluate(() => fadeFrom(null))
  prev = await shot(f.dur)
}
await b.close()
execFileSync('node_modules/ffmpeg-static/ffmpeg.exe', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/seq/%05d.png`, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', outFile])
console.log('pictures', k, 'frames', out, 'sec', frames.reduce((s, f) => s + f.dur + (f.fade ?? 0), 0).toFixed(2))
