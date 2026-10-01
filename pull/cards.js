// node pull/cards.js [seasons]
//
// A share card for every school on every board: t/<slug>.html and
// t/img/<slug>.png, e.g. /t/6a-boys-grant.
//
// Why a page per team and not just a link: the site is one file and a team is
// named in the hash (#6A/boys/Grant). Link previews are built by a crawler that
// never sees the hash and never runs the page's script, so every link to the
// site previews as the same generic card. A small static page per team carries
// that team's own title, description and picture, and sends a person (who does
// run script) straight on to that team's page on the site.
//
// The numbers come from the latest Called it snapshot when it was taken from
// this exact database and model, so a card and the archive say the same thing.
// Otherwise (a hand run between crawls, a model change) the boards are simulated
// here the way snapshot.js does it: same model.js, same sigma, same seasons.
//
// No dependencies, like make-icon.js. The font is Poppins (OFL, pull/fonts),
// read by a small TrueType reader below and filled by a scanline rasteriser.
// The site's own faces (Oswald, Anton) live on Google's font servers, which the
// weekly job should not depend on.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://chutexc.vercel.app';
const OUT = path.join(ROOT, 't');
const IMG = path.join(OUT, 'img');
const W = 1200, H = 630;

/* The slug is the one thing the page and this script must agree on. index.html
   carries the same function (teamSlug) and test_cards.js checks they match. */
const slugOf = (cls, g, name) => (cls + '-' + (g === 'M' ? 'boys' : 'girls') + '-' + name)
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* ---------------- TrueType ---------------- */
function loadFont(file) {
  const b = fs.readFileSync(file);
  const u8 = o => b[o], u16 = o => b.readUInt16BE(o), i16 = o => b.readInt16BE(o), u32 = o => b.readUInt32BE(o);
  const T = {};
  for (let i = 0, n = u16(4); i < n; i++) {
    const r = 12 + 16 * i;
    T[b.toString('ascii', r, r + 4)] = u32(r + 8);
  }
  const upm = u16(T.head + 18), longLoca = i16(T.head + 50) === 1;
  const numGlyphs = u16(T.maxp + 4), nhm = u16(T.hhea + 34);
  const adv = g => u16(T.hmtx + 4 * Math.min(g, nhm - 1));
  const loca = g => longLoca ? u32(T.loca + 4 * g) : 2 * u16(T.loca + 2 * g);

  // cmap: Windows Unicode BMP, format 4
  let sub = -1;
  for (let i = 0, n = u16(T.cmap + 2); i < n; i++) {
    const r = T.cmap + 4 + 8 * i, pid = u16(r), eid = u16(r + 2), off = T.cmap + u32(r + 4);
    if (u16(off) === 4 && ((pid === 3 && eid === 1) || pid === 0)) { sub = off; break; }
  }
  if (sub < 0) throw new Error('no format 4 cmap in ' + file);
  const segX2 = u16(sub + 6), ends = sub + 14, starts = ends + segX2 + 2,
    deltas = starts + segX2, ranges = deltas + segX2;
  const cache = new Map();
  const gid = c => {
    if (cache.has(c)) return cache.get(c);
    let g = 0;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = u16(ends + 2 * i);
      if (end < c) continue;
      const start = u16(starts + 2 * i);
      if (start > c) break;
      const delta = i16(deltas + 2 * i), ro = u16(ranges + 2 * i);
      if (!ro) g = (c + delta) & 0xFFFF;
      else {
        const v = u16(ranges + 2 * i + ro + 2 * (c - start));
        g = v ? (v + delta) & 0xFFFF : 0;
      }
      break;
    }
    cache.set(c, g); return g;
  };

  // glyph outlines as contours of {x, y, on}
  const outline = g => {
    if (g >= numGlyphs) return [];
    const at = T.glyf + loca(g);
    if (loca(g + 1) === loca(g)) return [];
    const nc = i16(at);
    if (nc >= 0) {
      const endPts = []; for (let i = 0; i < nc; i++) endPts.push(u16(at + 10 + 2 * i));
      const n = nc ? endPts[nc - 1] + 1 : 0;
      let p = at + 10 + 2 * nc; p += 2 + u16(p);
      const flags = [];
      while (flags.length < n) {
        const f = u8(p++); flags.push(f);
        if (f & 8) { let r = u8(p++); while (r--) flags.push(f); }
      }
      const xs = [], ys = [];
      let v = 0;
      for (const f of flags) {
        if (f & 2) { const d = u8(p++); v += f & 16 ? d : -d; }
        else if (!(f & 16)) { v += i16(p); p += 2; }
        xs.push(v);
      }
      v = 0;
      for (const f of flags) {
        if (f & 4) { const d = u8(p++); v += f & 32 ? d : -d; }
        else if (!(f & 32)) { v += i16(p); p += 2; }
        ys.push(v);
      }
      const out = []; let s = 0;
      for (const e of endPts) {
        const c = [];
        for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
        out.push(c); s = e + 1;
      }
      return out;
    }
    // composite
    const out = []; let p = at + 10, more = true;
    while (more) {
      const fl = u16(p), cg = u16(p + 2); p += 4;
      let dx, dy;
      if (fl & 1) { dx = i16(p); dy = i16(p + 2); p += 4; }
      else { dx = (b.readInt8(p)); dy = (b.readInt8(p + 1)); p += 2; }
      let a = 1, bb = 0, c = 0, d = 1;
      const f2 = o => i16(o) / 16384;
      if (fl & 8) { a = d = f2(p); p += 2; }
      else if (fl & 0x40) { a = f2(p); d = f2(p + 2); p += 4; }
      else if (fl & 0x80) { a = f2(p); bb = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const ct of outline(cg))
        out.push(ct.map(q => ({ x: a * q.x + c * q.y + dx, y: bb * q.x + d * q.y + dy, on: q.on })));
      more = !!(fl & 0x20);
    }
    return out;
  };
  return { upm, gid, adv, outline };
}

/* ---------------- text to polygons ---------------- */
// Contours to closed polygons, quadratic curves flattened in pixel space.
function contourPolys(contours, tf) {
  const polys = [];
  for (const ct of contours) {
    if (ct.length < 2) continue;
    // expand implied on-curve points, start on an on-curve point
    const pts = [];
    for (let i = 0; i < ct.length; i++) {
      const a = ct[i], b2 = ct[(i + 1) % ct.length];
      pts.push(a);
      if (!a.on && !b2.on) pts.push({ x: (a.x + b2.x) / 2, y: (a.y + b2.y) / 2, on: true });
    }
    let k = pts.findIndex(q => q.on);
    if (k < 0) continue;
    const seq = pts.slice(k).concat(pts.slice(0, k));
    const poly = [];
    const P = q => tf(q.x, q.y);
    let cur = P(seq[0]); poly.push(cur);
    for (let i = 1; i <= seq.length; i++) {
      const q = seq[i % seq.length];
      if (q.on) { cur = P(q); poly.push(cur); continue; }
      const ctl = P(q), end = P(seq[(i + 1) % seq.length]);
      const steps = Math.max(2, Math.ceil(Math.hypot(end[0] - cur[0], end[1] - cur[1]) / 2.5));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        poly.push([u * u * cur[0] + 2 * u * t * ctl[0] + t * t * end[0],
                   u * u * cur[1] + 2 * u * t * ctl[1] + t * t * end[1]]);
      }
      cur = end; i++;
    }
    polys.push(poly);
  }
  return polys;
}
const measure = (font, str, size, track = 0) => {
  const s = size / font.upm; let w = 0;
  for (const ch of str) w += font.adv(font.gid(ch.codePointAt(0))) * s + track;
  return w - (str.length ? track : 0);
};
function textPolys(font, str, x, base, size, { track = 0, skew = 0 } = {}) {
  const s = size / font.upm, polys = [];
  let pen = x;
  for (const ch of str) {
    const g = font.gid(ch.codePointAt(0));
    const ox = pen;
    polys.push(...contourPolys(font.outline(g), (gx, gy) => {
      const py = base - gy * s;
      return [ox + gx * s + skew * (base - py), py];
    }));
    pen += font.adv(g) * s + track;
  }
  return polys;
}
const circle = (cx, cy, r, ccw = false, n = 72) => {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (ccw ? -1 : 1) * 2 * Math.PI * i / n;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
};
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/* ---------------- raster ---------------- */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function canvas(bg) {
  const px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { px[i * 3] = bg[0]; px[i * 3 + 1] = bg[1]; px[i * 3 + 2] = bg[2]; }
  return px;
}
/* Nonzero fill. Four sample rows a pixel, exact coverage across each row, and
   the result rounded to 32 levels so the PNG fits a palette. */
const SUB = 4, LEVELS = 32;
function fill(px, polys, color) {
  const edges = [];
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (a[1] === b[1]) continue;
    edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1]);
    y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]);
    x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]);
  }
  if (!edges.length) return;
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(H - 1, Math.ceil(y1));
  const xs = Math.max(0, Math.floor(x0)), xe = Math.min(W - 1, Math.ceil(x1));
  const cov = new Float32Array(xe - xs + 2);
  for (let y = ys; y <= ye; y++) {
    cov.fill(0);
    for (let k = 0; k < SUB; k++) {
      const sy = y + (k + 0.5) / SUB, xc = [];
      for (const e of edges)
        if (sy >= e[1] && sy < e[3]) xc.push([e[0] + (sy - e[1]) * (e[2] - e[0]) / (e[3] - e[1]), e[4]]);
      if (!xc.length) continue;
      xc.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xc.length - 1; i++) {
        wind += xc[i][1];
        if (!wind) continue;
        const a = Math.max(xs, xc[i][0]), b = Math.min(xe + 1, xc[i + 1][0]);
        if (b <= a) continue;
        const ia = Math.floor(a), ib = Math.floor(b);
        if (ia === ib) { cov[ia - xs] += (b - a) / SUB; continue; }
        cov[ia - xs] += (ia + 1 - a) / SUB;
        for (let x = ia + 1; x < ib; x++) cov[x - xs] += 1 / SUB;
        if (ib <= xe) cov[ib - xs] += (b - ib) / SUB;
      }
    }
    for (let x = xs; x <= xe; x++) {
      const c = Math.round(Math.min(1, cov[x - xs]) * LEVELS) / LEVELS;
      if (!c) continue;
      const i = (y * W + x) * 3;
      for (let j = 0; j < 3; j++) px[i + j] = Math.round(px[i + j] + (color[j] - px[i + j]) * c);
    }
  }
}

/* ---------------- png ---------------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return b => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
};
/* A palette PNG when the colours fit in 256, which they do by construction:
   a handful of inks, each blended over the ground at 32 levels. */
function png(px) {
  const pal = new Map(); let fits = true;
  for (let i = 0; i < W * H && fits; i++) {
    const k = (px[i * 3] << 16) | (px[i * 3 + 1] << 8) | px[i * 3 + 2];
    if (!pal.has(k)) { if (pal.size >= 256) fits = false; else pal.set(k, pal.size); }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = fits ? 3 : 2;
  const bpp = fits ? 1 : 3, raw = Buffer.alloc((W * bpp + 1) * H);
  for (let y = 0; y < H; y++) {
    const r = y * (W * bpp + 1);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (fits) raw[r + 1 + x] = pal.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      else px.copy(raw, r + 1 + x * 3, i, i + 3);
    }
  }
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (fits) {
    const p = Buffer.alloc(pal.size * 3);
    for (const [k, i] of pal) { p[i * 3] = k >> 16; p[i * 3 + 1] = (k >> 8) & 255; p[i * 3 + 2] = k & 255; }
    parts.push(chunk('PLTE', p));
  }
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/* ---------------- the card ---------------- */
// The dark theme's own tokens. A PNG cannot read a custom property.
const C = {
  bg: hex('#0D0D0F'), surface: hex('#17171A'), line: hex('#2E2E35'),
  text: hex('#F3F3F4'), muted: hex('#A2A2AB'), dim: hex('#6C6C77'), accent: hex('#E8A33D'),
};
const BOLD = loadFont(path.join(__dirname, 'fonts', 'Poppins-Bold.ttf'));
const MED = loadFont(path.join(__dirname, 'fonts', 'Poppins-Medium.ttf'));

// the seven runners, from the favicon's 32-unit space: five filled, two hollow
const MARK_F = [[27.74, 7.9], [21.02, 4.5], [26.78, 14.7], [20.06, 11.3], [13.34, 7.9]];
const MARK_H = [[19.11, 18.1], [12.38, 14.7]];

const pc = v => v == null ? '—' : v >= 995 ? '100%' : v < 10 ? '<1%' : (v / 10).toFixed(v < 100 ? 1 : 0) + '%';
const shortDate = iso => {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, mo, d] = iso.split('-').map(Number); return m[mo - 1] + ' ' + d;
};

function drawCard({ name, cls, g, league, odds, through }) {
  const px = canvas(C.bg);
  const L = 72;                                  // left edge of the type
  // the rail: chance of reaching Lane, read as a height, the same as a board card
  fill(px, [rect(0, 0, 14, H)], C.surface);
  if (odds) { const h = Math.round(H * Math.min(1000, odds[0]) / 1000); if (h) fill(px, [rect(0, H - h, 14, h)], C.accent); }

  // the mark and the wordmark, top left
  const k = 2.1, mx = L - 10, my = 40;
  fill(px, MARK_F.map(p => circle(mx + p[0] * k, my + p[1] * k, 1.9 * k)), C.accent);
  for (const p of MARK_H) {
    const r = 1.7 * k, w = 1.5 * k;
    fill(px, [circle(mx + p[0] * k, my + p[1] * k, r + w / 2), circle(mx + p[0] * k, my + p[1] * k, r - w / 2, true)], C.accent);
  }
  fill(px, textPolys(BOLD, 'CHUTE', mx + 72, 88, 40, { track: 1, skew: Math.tan(8 * Math.PI / 180) }), C.text);

  // the board, top right
  const board = (cls + ' ' + (g === 'M' ? 'BOYS' : 'GIRLS'));
  const bw = measure(MED, board, 26, 3);
  fill(px, textPolys(MED, board, W - 64 - bw, 82, 26, { track: 3 }), C.muted);

  // the school, as large as it will go on one line
  const title = name.toUpperCase();
  let size = 124;
  while (size > 48 && measure(BOLD, title, size, -size * 0.01) > W - L - 64) size -= 2;
  const nameBase = 268;
  fill(px, textPolys(BOLD, title, L - size * 0.03, nameBase, size, { track: -size * 0.01 }), C.text);
  fill(px, textPolys(MED, league + ' · Oregon cross country', L, nameBase + 50, 28), C.muted);

  if (odds) {
    // three numbers, the same three a board card leads with
    const cols = [[pc(odds[2]), 'WINS STATE', C.accent], [pc(odds[0]), 'REACHES LANE', C.text]];
    if (odds[0] >= 10 && odds[3]) cols.push([String(odds[3]), 'POINTS WHEN THERE', C.muted]);
    let x = L;
    for (const [v, lab, col] of cols) {
      fill(px, textPolys(BOLD, v, x, 476, 104, { track: -2 }), col);
      fill(px, textPolys(MED, lab, x + 4, 516, 22, { track: 2.5 }), C.muted);
      x += Math.max(measure(BOLD, v, 104, -2), measure(MED, lab, 22, 2.5)) + 72;
    }
  } else {
    fill(px, textPolys(MED, 'Not enough 5,000m runners yet to field a team.', L, 470, 34), C.muted);
  }

  fill(px, [rect(L, 560, W - L - 64, 1)], C.line);
  fill(px, textPolys(MED, 'From results through ' + shortDate(through) + ', simulated thousands of times', L, 600, 22), C.dim);
  const site = 'chutexc.vercel.app';
  fill(px, textPolys(MED, site, W - 64 - measure(MED, site, 22), 600, 22), C.muted);
  return png(px);
}

/* ---------------- the odds ---------------- */
function boardOdds(html, runs) {
  const seed = (html.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1].trim();
  const through = (html.match(/const DATA_DATE="([\d-]+)"/) || [, ''])[1];
  const M = require(path.join(ROOT, 'model.js'));
  const parsed = M.parseCSV(seed);
  const snapM = fs.readFileSync(path.join(ROOT, 'backtest', 'snapshot.js'), 'utf8').match(/const MODEL = '([^']+)'/);
  const sm = html.match(/\r?\nconst SNAPSHOTS=(\[[\s\S]*?\]);\r?\n/);
  const list = sm ? JSON.parse(sm[1]) : [];
  const last = list.length ? list.reduce((a, b) => (b.taken > a.taken ? b : a)) : null;
  if (last && snapM && last.model === snapM[1] && last.through === through && last.marks === parsed.rows.length) {
    console.log('numbers from the ' + last.taken + ' snapshot (same database, same model)');
    const out = {};
    for (const [k, b] of Object.entries(last.boards)) out[k] = b.t;
    return { through, boards: out };
  }
  console.log('no snapshot of this database - simulating ' + runs.toLocaleString() + ' seasons a board');
  // the same sigma as the board and snapshot.js: race-day spread widened by the horizon allowance
  const stateDate = (html.match(/const STATE_DATE="([\d-]+)"/) || [, ''])[1];
  const rec = (() => { const m = html.match(/\nconst RECORD=(\{[\s\S]*?\});\r?\n/); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } })();
  const weeks = stateDate && through ? (Date.parse(stateDate + 'T00:00:00') - Date.parse(through + 'T00:00:00')) / 6048e5 : null;
  let drift = 0;
  if (weeks != null && rec && rec.horizon) {
    const c = rec.horizon.map(h => ({ w: h.weeks, d: Math.sqrt(Math.max(0, h.best * h.best - M.CAL.sd * M.CAL.sd)) })).sort((a, b) => a.w - b.w);
    if (weeks <= c[0].w) drift = c[0].d;
    else if (weeks >= c[c.length - 1].w) drift = c[c.length - 1].d;
    else for (let i = 1; i < c.length; i++) if (weeks <= c[i].w) { const a = c[i - 1], b = c[i]; drift = a.d + (b.d - a.d) * (weeks - a.w) / (b.w - a.w); break; }
  }
  const SIGMA = Math.sqrt(M.CAL.sd * M.CAL.sd + drift * drift);
  M.setDATA(parsed.rows);
  const classNames = Object.keys(require('./seed.js').parseClasses(html).CLASSES);
  const boards = {};
  for (const cls of classNames) for (const g of ['M', 'F']) {
    M.setClass(cls, g);
    const model = M.buildModel(g, 5000);
    if (model.teams.filter(t => !t.short).length < M.FIELD) continue;
    const t = M.blankTally(model);
    const worlds = [{ adj: null, byIdx: t.byIdx }];
    const times = new Float64Array(model.runners.length), tmp = new Float64Array(model.runners.length);
    const shock = new Float64Array(model.teams.length);
    for (let i = 0; i < runs; i++) M.oneSeason(model, worlds, SIGMA / 100, times, shock, tmp);
    const P3 = v => Math.round(1000 * v / runs), row = {};
    for (const x of t.list) row[x.name] = [P3(x.qual), P3(x.auto), P3(x.win), x.ptsN ? Math.round(x.ptsSum / x.ptsN) : 0];
    boards[cls + '|' + g] = row;
    process.stdout.write('  ' + cls + ' ' + g + '\n');
  }
  return { through, boards };
}

/* ---------------- the page ---------------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function page({ name, cls, g, slug, odds, through }) {
  const side = g === 'M' ? 'boys' : 'girls';
  // the team's own page, not the board: somebody opening a team's link came for that team
  const hash = '/#' + encodeURIComponent(cls) + '/' + side + '/' + encodeURIComponent(name) + '/team';
  const title = name + ' ' + side + ' · ' + cls + ' state odds · Chute';
  const desc = odds
    ? pc(odds[2]) + ' to win the ' + cls + ' ' + side + ' title, ' + pc(odds[0]) + ' to reach Lane. From results through ' + shortDate(through) + '.'
    : 'Not enough 5,000m runners yet to field a team. From results through ' + shortDate(through) + '.';
  const img = SITE + '/t/img/' + slug + '.png?d=' + through;
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>' + esc(title) + '</title>\n'
    + '<meta name="description" content="' + esc(desc) + '">\n'
    + '<meta name="robots" content="noindex">\n'
    + '<meta property="og:type" content="website">\n<meta property="og:site_name" content="Chute">\n'
    + '<meta property="og:title" content="' + esc(title) + '">\n'
    + '<meta property="og:description" content="' + esc(desc) + '">\n'
    + '<meta property="og:url" content="' + SITE + '/t/' + slug + '">\n'
    + '<meta property="og:image" content="' + img + '">\n'
    + '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
    + '<meta property="og:image:alt" content="' + esc(desc) + '">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<meta name="twitter:title" content="' + esc(title) + '">\n'
    + '<meta name="twitter:description" content="' + esc(desc) + '">\n'
    + '<meta name="twitter:image" content="' + img + '">\n'
    // a person runs script and goes straight to the board; a crawler does neither and reads the tags
    + '<script>location.replace(' + JSON.stringify(hash) + ')</script>\n'
    + '<noscript><meta http-equiv="refresh" content="0;url=' + esc(hash) + '"></noscript>\n'
    + '<style>body{background:#0D0D0F;color:#F3F3F4;font:16px system-ui,sans-serif;padding:24px}a{color:#E8A33D}</style>\n'
    + '</head><body><p><a href="' + esc(hash) + '">' + esc(name) + ' ' + side + ' on Chute</a></p></body></html>\n';
}

/* ---------------- run ---------------- */
if (require.main === module) {
  const runs = +(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 20000);
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const CLASSES = require('./seed.js').parseClasses(html).CLASSES;
  const { through, boards } = boardOdds(html, runs);
  if (!through) { console.error('could not read DATA_DATE'); process.exit(1); }
  fs.mkdirSync(IMG, { recursive: true });
  const seen = new Map(), keep = new Set();
  let n = 0;
  for (const cls of Object.keys(CLASSES)) for (const g of ['M', 'F']) {
    const cfg = CLASSES[cls][g]; if (!cfg) continue;
    for (const [league, teams] of Object.entries(cfg.lg)) for (const name of teams) {
      const slug = slugOf(cls, g, name);
      if (seen.has(slug)) { console.error('slug collision: ' + slug + ' (' + seen.get(slug) + ' / ' + name + ')'); process.exit(1); }
      seen.set(slug, name); keep.add(slug);
      if (only && !slug.includes(only)) continue;
      const b = boards[cls + '|' + g], odds = b && b[name] ? b[name] : null;
      fs.writeFileSync(path.join(IMG, slug + '.png'), drawCard({ name, cls, g, league, odds, through }));
      fs.writeFileSync(path.join(OUT, slug + '.html'), page({ name, cls, g, slug, odds, through }));
      n++;
    }
  }
  // a school that left a board takes its card with it
  if (!only) for (const dir of [OUT, IMG]) for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(.+)\.(html|png)$/);
    if (m && !keep.has(m[1])) { fs.unlinkSync(path.join(dir, f)); console.log('removed ' + f); }
  }
  console.log(n + ' cards written, results through ' + through);
}

module.exports = { slugOf, loadFont, drawCard, page };
