// Draws DorAI's icon (an orange tile, a dark "D", a dot) as PNGs for the
// browser extension and the installable web app, plus the SVG the page uses.
// Plain Node, no image library:
//
//   node tools/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
const TILE = [0xff, 0xb3, 0x47]
const INK = [0x15, 0x19, 0x1d]

// The same shapes as the SVG below, on a 100-unit square.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#ffb347"/><path d="M30 24h12a26 26 0 0 1 0 52H30z M42 36v28a14 14 0 0 0 0-28z" fill="#15191d" fill-rule="evenodd"/><circle cx="76" cy="26" r="5.5" fill="#15191d"/></svg>\n`
const glyph = (x, y) => {
  const d = Math.hypot(x - 42, y - 50)
  const stem = x >= 30 && x <= 42 && y >= 24 && y <= 76
  const bowl = x >= 42 && d <= 26 && d >= 14
  return stem || bowl || Math.hypot(x - 76, y - 26) <= 5.5
}
const inTile = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 100 - r)
  const cy = Math.min(Math.max(y, r), 100 - r)
  return x >= 0 && x <= 100 && y >= 0 && y <= 100 && Math.hypot(x - cx, y - cy) <= r
}

/** RGBA pixels: `maskable` fills the square and keeps the mark inside the middle 70% (Android crops to a circle). */
function draw(size, maskable = false) {
  const px = Buffer.alloc(size * size * 4)
  const n = 4 // 4×4 samples a pixel, for smooth edges
  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let tile = 0
      let ink = 0
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = ((pxx + (i + 0.5) / n) / size) * 100
          const y = ((py + (j + 0.5) / n) / size) * 100
          const [gx, gy] = maskable ? [50 + (x - 50) / 0.7, 50 + (y - 50) / 0.7] : [x, y]
          if (!(maskable || inTile(x, y, 22))) continue
          tile++
          if (glyph(gx, gy)) ink++
        }
      }
      const o = (py * size + pxx) * 4
      const t = ink / (tile || 1)
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(TILE[c] * (1 - t) + INK[c] * t)
      px[o + 3] = Math.round((tile / (n * n)) * 255)
    }
  }
  return png(size, px)
}

const CRC = Array.from({ length: 256 }, (_, k) => {
  let c = k
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const write = (path, data) => {
  const url = new URL(path, root)
  mkdirSync(new URL('./', url), { recursive: true })
  writeFileSync(url, data)
  console.log('wrote', path)
}
for (const size of [16, 32, 48, 128]) write(`extension/icons/icon-${size}.png`, draw(size))
write('public/icon-192.png', draw(192))
write('public/icon-512.png', draw(512))
write('public/icon-maskable-512.png', draw(512, true))
write('public/apple-touch-icon.png', draw(180, true))
write('public/icon.svg', SVG)
