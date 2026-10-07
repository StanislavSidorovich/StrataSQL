// node jumps.mjs video.mp4 — frame-to-frame change (mean abs diff, 0–255) at 135×168 grey; prints the biggest jumps
import { execFileSync } from 'child_process'
const W = 135, H = 168
const raw = execFileSync('node_modules/ffmpeg-static/ffmpeg.exe', ['-loglevel', 'error', '-i', process.argv[2], '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 })
const n = raw.length / (W * H), d = []
for (let i = 1; i < n; i++) { let s = 0; for (let j = 0; j < W * H; j++) s += Math.abs(raw[i * W * H + j] - raw[(i - 1) * W * H + j]); d.push({ t: (i / 30).toFixed(2), f: i, v: +(s / W / H).toFixed(2) }) }
console.log('frames', n)
console.log(d.filter(x => x.v > 1.5).map(x => `${x.t}s f${x.f} ${x.v}`).join('\n'))
