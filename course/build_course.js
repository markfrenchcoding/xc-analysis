// Rebuild the isometric Lane scene in index.html from the GPS trace.
//
//   node course/build_course.js
//
// Reads course/state_3rd.gpx, projects it, lays the scenery out around it and
// rewrites the COURSE constant near the top of the easter egg. Nothing about the
// route is drawn by hand, so replacing the GPX and re-running gives a new course
// for free. Everything else is positioned in the same metric frame as the trace.
const fs = require('fs');
const path = require('path');
const HERE = __dirname;

/* ---------- the trace ---------- */
const raw = fs.readFileSync(path.join(HERE, 'state_3rd.gpx'), 'utf8');
const ll = [...raw.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(m => [+m[1], +m[2]]);
if (ll.length < 100) { console.log('no track points found'); process.exit(1); }
const lat0 = ll.reduce((s, p) => s + p[0], 0) / ll.length;
const lon0 = ll.reduce((s, p) => s + p[1], 0) / ll.length;
const MPD = 111320;
let T = ll.map(([la, lo]) =>
  [(lo - lon0) * MPD * Math.cos(lat0 * Math.PI / 180), (la - lat0) * MPD]);   // x east, y north

/* Strava keeps recording after the line. Trim by proximity to the final point
   rather than by step size: standing still leaves a cluster at the finish,
   while a step threshold also eats the slow sections mid-race. */
const last = T[T.length - 1];
let end = T.length - 1;
while (end > 1 && Math.hypot(T[end - 1][0] - last[0], T[end - 1][1] - last[1]) < 2.5) end--;
T = T.slice(0, end + 1);

const cum = [0];
for (let i = 1; i < T.length; i++)
  cum.push(cum[i - 1] + Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1]));
const L = cum[cum.length - 1];
const at = d => T[Math.max(0, cum.findIndex(v => v >= d))];

/* ---------- projection ----------
   Six degrees of rotation before projecting, which is the angle that fills a
   two-to-one frame best: the site is 834m by 371m and would otherwise sit in a
   letterbox. Two-to-one dimetric after that. */
const ROT = 6 * Math.PI / 180, C = Math.cos(ROT), S = Math.sin(ROT);
const KX = 0.72, KY = 0.36;
const iso = (x, y) => {
  const X = x * C - y * S, Y = x * S + y * C;
  return [(X + Y) * KX, (X - Y) * KY];
};

/* ---------- what goes where ----------
   The oval is measured off the closing loop, so the runners finish on the track
   they are drawn on. Everything else sits in ground the course provably never
   touches: grid the site at 8m, mark every cell within 16m of the trace, and
   take the largest clear rectangles. */
const track = { cx: -55.5, cy: -99, rx: 49, ry: 80 };
/* Two ponds, north-west, inside the loop with the course running between them -
   which is where the route planner puts them, not the south-west corner the
   printed map suggested. Sized to keep the trace 13m clear. */
const ponds = [[-377, 74, -283, 136], [-253, 68, -195, 126]];
const fields = [[22, -104, 118, -56], [22, -46, 118, -2]];
// plain grass inside the eastern loop: the satellite shows practice fields
// there, not the buildings that used to sit on them
const greens = [[140, 4, 210, 44], [222, 10, 268, 46]];
const soccer = [-48, 58, 118, 90];
const builds = [                                              // x0,y0,x1,y1,height in metres
  [198, -196, 268, -150, 21], [280, -192, 352, -146, 15], [360, -186, 414, -140, 12],
  [196, -132, 262, -88, 17], [276, -128, 344, -84, 13], [352, -124, 412, -80, 10],
  [200, -74, 266, -36, 12], [278, -70, 340, -34, 9], [350, -66, 400, -34, 7],
];
const trees = [
  [-150, 120], [-250, 140], [-330, 150], [-60, 110], [40, 100], [140, 96], [240, 120],
  [-120, -20], [-160, 40], [-240, 60], [-330, 40], [-400, 60], [-150, -120], [-120, -190],
  [-10, -200], [80, -190], [150, -60], [160, 100], [330, 60], [400, 40], [-20, 60],
  [60, 20], [-90, 40], [-400, -20], [-390, -120], [-200, -220], [120, -20], [300, -20],
];

/* ---------- frame ---------- */
// the slab is the outermost thing drawn, so it sizes the frame along with
// everything else; leave it out and its corners hang off the edge
const MARGIN = 40;
const gx0 = Math.min(...T.map(p => p[0])) - MARGIN, gx1 = Math.max(...T.map(p => p[0])) + MARGIN;
const gy0 = Math.min(...T.map(p => p[1])) - MARGIN, gy1 = Math.max(...T.map(p => p[1])) + MARGIN;
const all = [];
for (const c of [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]]) all.push(iso(c[0], c[1]));
for (const p of T) all.push(iso(p[0], p[1]));
for (const [x0, y0, x1, y1] of [...ponds, ...fields, ...greens, soccer, ...builds.map(b => b.slice(0, 4))])
  for (const c of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) all.push(iso(c[0], c[1]));
for (let a = 0; a < 8; a++)
  all.push(iso(track.cx + track.rx * Math.cos(a / 8 * 6.283),
               track.cy + track.ry * Math.sin(a / 8 * 6.283)));
const bx0 = Math.min(...all.map(p => p[0])), bx1 = Math.max(...all.map(p => p[0]));
const by0 = Math.min(...all.map(p => p[1])), by1 = Math.max(...all.map(p => p[1]));
const VW = 200, VH = 100, PAD = 6;
const K = Math.min((VW - 2 * PAD) / (bx1 - bx0), (VH - 2 * PAD) / (by1 - by0));
const OX = PAD - bx0 * K + (VW - 2 * PAD - (bx1 - bx0) * K) / 2;
const OY = PAD - by0 * K + (VH - 2 * PAD - (by1 - by0) * K) / 2 + 2;
// heights are exaggerated: at true scale a building is two pixels and nothing
// reads as standing up
const pj = (x, y, h = 0) => {
  const p = iso(x, y);
  return [+(p[0] * K + OX).toFixed(2), +(p[1] * K + OY - (h || 0) * K * 1.85).toFixed(2)];
};
const PT = (x, y, h) => pj(x, y, h).join(' ');
console.log('points', T.length, '| length', L.toFixed(0), 'm | scale', K.toFixed(3));

/* ---------- pieces ---------- */
const poly = (pts, cls, h = 0) =>
  `<polygon class="${cls}" points="${pts.map(p => PT(p[0], p[1], h)).join(' ')}"/>`;
const soft = (x0, y0, x1, y1, c) => [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c],
  [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const box = (x0, y0, x1, y1, h) =>
  `<polygon class="c-wr" points="${PT(x1,y0,h)} ${PT(x1,y1,h)} ${PT(x1,y1)} ${PT(x1,y0)}"/>`
  + `<polygon class="c-wl" points="${PT(x1,y1,h)} ${PT(x0,y1,h)} ${PT(x0,y1)} ${PT(x1,y1)}"/>`
  + poly(rect(x0, y0, x1, y1), 'c-top', h);
function ellipse(cx, cy, rx, ry, cls, n = 48) {
  const p = [];
  for (let a = 0; a < n; a++) {
    const t = a / n * 6.283;
    p.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return poly(p, cls);
}
function ballField(hx, hy, r) {
  const p = [[hx, hy]];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12 * Math.PI / 2;
    p.push([hx + r * Math.cos(t), hy + r * Math.sin(t)]);
  }
  const d = r * 0.3;
  return poly(p, 'c-grass')
    + poly([[hx, hy], [hx + d, hy + d], [hx + 2 * d, hy], [hx + d, hy - d]], 'c-dirt');
}
const tree = (x, y) => {
  const a = pj(x, y), b = pj(x, y, 11);
  return `<g class="c-tree"><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/>`
    + `<circle cx="${b[0]}" cy="${(b[1] - 1.1).toFixed(2)}" r="2.3"/></g>`;
};

const F = [];
// a slab with a visible edge, so the site reads as a model rather than a fill
const cs = [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]];
const low = cs.map(c => pj(c[0], c[1], -9)), top = cs.map(c => pj(c[0], c[1]));
let deep = 0;
for (let i = 1; i < 4; i++) if (top[i][1] > top[deep][1]) deep = i;
F.push('<polygon class="c-edge" points="' + [top[(deep + 3) % 4], top[deep], top[(deep + 1) % 4],
  low[(deep + 1) % 4], low[deep], low[(deep + 3) % 4]].map(p => p.join(' ')).join(' ') + '"/>');
F.push('<polygon class="c-ground" points="' + top.map(p => p.join(' ')).join(' ') + '"/>');

for (const [a, b, c, d] of ponds) F.push(poly(soft(a, b, c, d, 14), 'c-water'));
F.push(poly(soft(soccer[0], soccer[1], soccer[2], soccer[3], 10), 'c-grass'));
for (const [a, b, c, d] of greens) F.push(poly(soft(a, b, c, d, 8), 'c-grass'));
F.push(ballField(fields[0][0], fields[0][1], 46));
F.push(ballField(fields[1][0], fields[1][1], 44));
F.push(ellipse(track.cx, track.cy, track.rx, track.ry, 'c-track'));
F.push(ellipse(track.cx, track.cy, track.rx - 7, track.ry - 7, 'c-lane'));
F.push(ellipse(track.cx, track.cy, track.rx - 13, track.ry - 13, 'c-infield'));
for (const [x0, y0, x1, y1, h] of builds) F.push(box(x0, y0, x1, y1, h));
for (const [x, y] of trees) F.push(tree(x, y));

// every third trace point is plenty at this scale
const RP = T.filter((_, i) => i % 3 === 0 || i === T.length - 1).map(p => pj(p[0], p[1]));
const D = 'M' + RP.map(p => p.join(' ')).join('L');

const mk = (d, l) => {
  const p = pj(at(d)[0], at(d)[1]);
  return `<g class="c-mk" transform="translate(${p[0]} ${p[1]})"><circle r="3.9"/>`
    + `<text y="1.8">${l}</text></g>`;
};
const tag = (x, y, dx, dy, l, cls) => {
  const p = pj(x, y);
  return `<g class="c-tag ${cls}"><text x="${(p[0] + dx).toFixed(1)}" `
    + `y="${(p[1] + dy).toFixed(1)}">${l}</text></g>`;
};

const SCENE = `<svg class="pl-map" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`
  + F.join('')
  + `<path class="c-trail" d="${D}"/><path id="plRoute" class="c-route" d="${D}"/>`
  + mk(1000, '1K') + mk(2000, '2K') + mk(3000, '3K') + mk(4000, '4K')
  + tag(T[0][0], T[0][1], -6, -6, 'START', '')
  + tag(T[T.length - 1][0], T[T.length - 1][1], 6, -4, 'FINISH', 'c-fin')
  + tag(track.cx, track.cy - track.ry - 26, -12, 2, 'TRACK BOWL', 'c-sm')
  + tag((ponds[0][0] + ponds[1][2]) / 2, ponds[0][1] - 52, -11, 3, 'THE PONDS', 'c-sm')
  + tag(280, -30, -10, 16, 'CAMPUS', 'c-sm')
  + '</svg>';

// the scene ships inside a single-quoted JS string
if (SCENE.includes("'")) { console.log('scene contains a quote; aborting'); process.exit(1); }
console.log('scene', SCENE.length, 'chars |', RP.length, 'route points');

const IDX = path.join(HERE, '..', 'index.html');
let t = fs.readFileSync(IDX, 'utf8').replace(/\r\n/g, '\n');
const a = t.indexOf("const COURSE='"), b = t.indexOf("';", a);
if (a < 0 || b < 0) { console.log('COURSE constant not found in index.html'); process.exit(1); }
t = t.slice(0, a) + "const COURSE='" + SCENE + t.slice(b);
if (!t.includes(`aspect-ratio:${VW}/${VH}`)) console.log('WARNING: .pl-wrap aspect-ratio is not ' + VW + '/' + VH);
if (!t.includes(`wrap.clientWidth/${VW}`)) console.log('WARNING: the pixel scale is not clientWidth/' + VW);
fs.writeFileSync(IDX, t.replace(/\n/g, '\r\n'));
console.log('index.html updated');
