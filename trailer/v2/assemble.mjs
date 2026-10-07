import { execFileSync } from 'child_process'
const FF = 'node_modules/ffmpeg-static/ffmpeg.exe'
const V = process.argv[2], out = process.argv[3]
const clips = process.argv.slice(4).length ? process.argv.slice(4) : ['01-hook', '02-walkthrough', '03-trainer', '05-endcard'].map(c => `${V}/${c}.mp4`)
const dur = f => { try { execFileSync(FF, ['-i', f], { stdio: 'pipe' }) } catch (e) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(e.stderr.toString()); return +m[1] * 3600 + +m[2] * 60 + +m[3] } }
const X = 0.3
const ds = clips.map(dur)
let fc = clips.map((_, i) => `[${i}]settb=1/30,fps=30,format=yuv420p[v${i}]`).join(';')
let prev = 'v0', acc = ds[0]
for (let i = 1; i < clips.length; i++) {
  const off = (acc - X).toFixed(3)
  fc += `;[${prev}][v${i}]xfade=transition=fade:duration=${X}:offset=${off}[x${i}]`
  prev = `x${i}`; acc = acc - X + ds[i]
}
execFileSync(FF, ['-y', '-loglevel', 'error', ...clips.flatMap(c => ['-i', c]), '-filter_complex', fc, '-map', `[${prev}]`, '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
console.log(ds.map(d => d.toFixed(2)).join(' + '), '→', acc.toFixed(2), 's')
