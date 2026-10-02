// Generates the PWA icons in public/ (the same three blue strata as the favicon).
// Pure Node, no dependencies: run `node scripts/make-icons.mjs` after changing the design.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [255, 255, 255]
const STRATA = [
  [0x3b, 0x82, 0xf6],
  [0x60, 0xa5, 0xfa],
  [0x93, 0xc5, 0xfd],
]

// In a 32-unit box like the favicon; `pad` shrinks the art for maskable icons.
function pixel(x, y, size, pad) {
  const u = 32 / (size * (1 - 2 * pad))
  const px = (x + 0.5 - size * pad) * u
  const py = (y + 0.5 - size * pad) * u
  for (let i = 0; i < 3; i++) {
    const top = 5 + i * 8
    // rounded rect x 3..29, y top..top+6, radius 1.5 — coverage by 4×4 supersampling
    let hit = 0
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++) {
        const qx = px + ((sx + 0.5) / 4 - 0.5) * u
        const qy = py + ((sy + 0.5) / 4 - 0.5) * u
        const cx = Math.min(Math.max(qx, 4.5), 27.5)
        const cy = Math.min(Math.max(qy, top + 1.5), top + 4.5)
        if ((qx - cx) ** 2 + (qy - cy) ** 2 <= 1.5 ** 2) hit++
      }
    if (hit) return BG.map((b, k) => Math.round(b + ((STRATA[i][k] - b) * hit) / 16))
  }
  return BG
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, pad) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) raw.set(pixel(x, y, size, pad), y * (size * 3 + 1) + 1 + x * 3)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icon-192.png', png(192, 0.04))
writeFileSync('public/icon-512.png', png(512, 0.04))
writeFileSync('public/icon-maskable-512.png', png(512, 0.14)) // safe zone for round/squircle masks
writeFileSync('public/apple-touch-icon.png', png(180, 0.08))
console.log('icons written to public/')
