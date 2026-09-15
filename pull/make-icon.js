// node pull/make-icon.js
//
// Writes apple-touch-icon.png at the repo root.
//
// iOS will not use an SVG favicon for a home-screen shortcut. Given no
// apple-touch-icon it renders a screenshot of the page or the first letter of
// the title, which is where the bare "C" came from. It wants a real PNG, so
// this draws one: the same seven runners as the page mark and the tab icon,
// which makes three copies of one drawing. If the formation is ever redrawn,
// all three need it.
//
// No dependencies. Node's zlib does the only hard part; the rest is a 13-byte
// header, a CRC per chunk, and one filter byte per scanline.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'apple-touch-icon.png');
const SIZE = 180;
const SS = 4;                        // supersample, then box-average down
const N = SIZE * SS;

const BG = [0x0D, 0x0D, 0x0F];       // the site's own ground
const FG = [0xE8, 0xA3, 0x3D];       // --accent, hardcoded: a PNG cannot read one

/* Straight out of the favicon's data URI, in its 32-unit space. Five filled,
   six and seven hollow, because five score and two displace. */
const C = [20.06, 11.3], K = 1.45;
const at = p => [(p[0] - C[0]) * K + 16, (p[1] - C[1]) * K + 16];
const FILLED = [[27.74, 7.9], [21.02, 4.5], [26.78, 14.7], [20.06, 11.3], [13.34, 7.9]]
  .map(p => ({ c: at(p), r: 1.9 * K }));
const HOLLOW = [[19.11, 18.1], [12.38, 14.7]]
  .map(p => ({ c: at(p), r: 1.7 * K, w: 1.5 * K }));

/* Fit the formation to the icon. iOS masks the square to a squircle and crops
   a few percent off every edge, so the mark is laid into 74% of the width -
   enough that nothing clips on any iOS version's mask. */
const all = FILLED.concat(HOLLOW);
let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
for (const d of all) {
  const rr = d.r + (d.w ? d.w / 2 : 0);
  x0 = Math.min(x0, d.c[0] - rr); x1 = Math.max(x1, d.c[0] + rr);
  y0 = Math.min(y0, d.c[1] - rr); y1 = Math.max(y1, d.c[1] + rr);
}
const scale = (N * 0.74) / Math.max(x1 - x0, y1 - y0);
const ox = N / 2 - ((x0 + x1) / 2) * scale;
const oy = N / 2 - ((y0 + y1) / 2) * scale;
const T = p => [p[0] * scale + ox, p[1] * scale + oy];

/* ---------- draw ---------- */
const buf = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) { buf[i * 3] = BG[0]; buf[i * 3 + 1] = BG[1]; buf[i * 3 + 2] = BG[2]; }
const put = (x, y) => {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 3;
  buf[i] = FG[0]; buf[i + 1] = FG[1]; buf[i + 2] = FG[2];
};
for (const d of FILLED) {
  const [cx, cy] = T(d.c), r = d.r * scale, r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) put(x, y);
    }
}
for (const d of HOLLOW) {
  const [cx, cy] = T(d.c), r = d.r * scale, w = d.w * scale;
  const ro = r + w / 2, ri = r - w / 2;
  for (let y = Math.floor(cy - ro); y <= Math.ceil(cy + ro); y++)
    for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= ro && dd >= ri) put(x, y);
    }
}

/* ---------- box-average down: this is the antialiasing ---------- */
const px = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < SS; j++)
      for (let i = 0; i < SS; i++) {
        const k = (((y * SS + j) * N) + (x * SS + i)) * 3;
        r += buf[k]; g += buf[k + 1]; b += buf[k + 2];
      }
    const n = SS * SS, o = (y * SIZE + x) * 3;
    px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n);
  }

/* ---------- encode ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return b => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit truecolour

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0;                                        // filter: none
  px.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log('wrote ' + OUT + '  ' + SIZE + 'x' + SIZE + '  ' + (png.length / 1024).toFixed(1) + 'KB');
