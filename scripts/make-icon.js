// Generates app icons as PNGs with zero dependencies (pure Node + zlib).
// Draws the classic 2048 amber tile with a white "2" glyph.
// Usage: node scripts/make-icon.js

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'app', 'icons');

// ---- PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Canvas + drawing helpers ----
function makeCanvas(size) {
  return { size, buf: Buffer.alloc(size * size * 4) };
}

function blend(canvas, x, y, r, g, b, a) {
  if (a <= 0) return;
  const i = (y * canvas.size + x) * 4;
  if (a >= 255) {
    canvas.buf[i] = r;
    canvas.buf[i + 1] = g;
    canvas.buf[i + 2] = b;
    canvas.buf[i + 3] = 255;
    return;
  }
  const da = a / 255;
  canvas.buf[i] = Math.round(r * da + canvas.buf[i] * (1 - da));
  canvas.buf[i + 1] = Math.round(g * da + canvas.buf[i + 1] * (1 - da));
  canvas.buf[i + 2] = Math.round(b * da + canvas.buf[i + 2] * (1 - da));
  canvas.buf[i + 3] = 255;
}

function circleCoverage(x, y, cx, cy, r) {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

// Coverage (0..1) of pixel (x,y) inside a rounded rect.
function rrCoverage(x, y, x0, y0, x1, y1, radius) {
  const R = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  if (x < x0 + R && y < y0 + R) return circleCoverage(x, y, x0 + R, y0 + R, R);
  if (x > x1 - R && y < y0 + R) return circleCoverage(x, y, x1 - R, y0 + R, R);
  if (x < x0 + R && y > y1 - R) return circleCoverage(x, y, x0 + R, y1 - R, R);
  if (x > x1 - R && y > y1 - R) return circleCoverage(x, y, x1 - R, y1 - R, R);
  return 1;
}

function fillRoundRect(canvas, x0, y0, x1, y1, radius, [r, g, b]) {
  const x0i = Math.max(0, Math.round(x0));
  const y0i = Math.max(0, Math.round(y0));
  const x1i = Math.min(canvas.size - 1, Math.round(x1));
  const y1i = Math.min(canvas.size - 1, Math.round(y1));
  for (let y = y0i; y <= y1i; y++) {
    for (let x = x0i; x <= x1i; x++) {
      const cov = rrCoverage(x, y, x0, y0, x1, y1, radius);
      if (cov > 0) blend(canvas, x, y, r, g, b, Math.round(cov * 255));
    }
  }
}

// ---- Icon drawing ----
// Brand mark: teal->indigo gradient tile with a white "T" glyph (TileShift).
function drawGlyph(c, size, color) {
  const th = 0.16 * size;
  const gw = 0.56 * size;
  const gh = 0.5 * size;
  const cx = size / 2;
  const cy = size / 2;
  const xLeft = cx - gw / 2;
  const xRight = cx + gw / 2;
  const yTop = cy - gh / 2;
  const yBottom = cy + gh / 2;
  const rad = th * 0.45;
  fillRoundRect(c, xLeft, yTop, xRight, yTop + th, rad, color); // top bar
  fillRoundRect(c, cx - th / 2, yTop, cx + th / 2, yBottom, rad, color); // stem
}

function drawIcon(size, { rounded = false } = {}) {
  const c = makeCanvas(size);
  const top = [34, 211, 238]; // #22d3ee
  const bottom = [99, 102, 241]; // #6366f1
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x++) blend(c, x, y, r, g, b, 255);
  }

  drawGlyph(c, size, [255, 255, 255]);

  if (rounded) {
    // Cut square corners (favicon style).
    const R = size * 0.2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cov = rrCoverage(x, y, 0, 0, size - 1, size - 1, R);
        if (cov < 1) {
          const i = (y * size + x) * 4;
          c.buf[i + 3] = Math.round((c.buf[i + 3] / 255) * cov * 255);
        }
      }
    }
  }
  return encodePng(size, size, c.buf);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-1024.png', 1024, false],
  ['favicon-32.png', 32, true],
];

for (const [name, size, rounded] of targets) {
  const png = drawIcon(size, { rounded });
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote ${name} (${size}x${size})`);
}

// Extra sizes used by the Android launcher mipmaps (stored under app/icons/android).
const androidSizes = [48, 72, 96, 144, 192];
const androidDir = join(OUT_DIR, 'android');
mkdirSync(androidDir, { recursive: true });
for (const size of androidSizes) {
  const png = drawIcon(size, { rounded: false });
  writeFileSync(join(androidDir, `ic_launcher_${size}.png`), png);
}
console.log('wrote android mipmap sources');

// Adaptive icon foregrounds (transparent bg + white glyph inside the safe zone).
function drawForeground(size) {
  const c = makeCanvas(size);
  drawGlyph(c, size, [255, 255, 255]);
  return encodePng(size, size, c.buf);
}

const fgSizes = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};
for (const [dpi, size] of Object.entries(fgSizes)) {
  writeFileSync(join(androidDir, `ic_launcher_foreground_${dpi}.png`), drawForeground(size));
}
console.log('wrote android adaptive foreground sources');