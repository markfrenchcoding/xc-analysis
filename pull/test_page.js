// node pull/test_page.js            run the audit
// node pull/test_page.js --baseline write pull/roster/.page-baseline.json
//
// THE CROSS-VIEW AUDIT. Every time on the dashboard should come from one
// place, and this is what proves it. It reads the built page's own data
// blocks - not the CSVs, not the puller - because what the page ships is what
// a reader sees.
//
// It exists because the page shipped two answers for one race. d-results
// rounded to hundredths and d-seasons wrote the raw float, so Tyler Williams'
// 2027 5,000m was 963.95 in one block and 963.949 in the other, and the two
// straddle the tenth the formatter rounds to: 16:04.0 on one view and 16:03.9
// on another.
//
// THE TRAP THIS SUITE EXISTS TO AVOID. An audit that rounds before it compares
// reports agreement. I wrote that version first, and it said the two sources
// matched on all 1,112 athlete-rulers - which was true at hundredths and said
// nothing about what the page was printing. Compare the stored values.
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'tualatin', 'index.html');
const BASE = path.join(__dirname, 'roster', '.page-baseline.json');
const html = fs.readFileSync(PAGE, 'utf8');

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const eq = (a, b, m) => ok(a === b, m + ' — got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b));

/* ---------- the page's own blocks, read the way the page reads them ---------- */
function block(id) {
  const s = html.indexOf('<script id="' + id + '" type="text/plain">');
  if (s < 0) throw new Error('no block ' + id);
  const a = html.indexOf('>', s) + 1;
  const b = html.indexOf('</' + 'script>', a);
  const t = html.slice(a, b).trim();
  return t ? t.split('\n') : [];
}
const SPORT = ['xc', 'tfo'];
const A = block('d-athletes').map((l, i) => {
  const c = l.split(',');
  return { i, id: +c[0], first: c[1], last: c[2], g: c[4], classOf: +c[5] || null };
});
const Slines = block('d-seasons');
const S = Slines.map((l) => {
  const c = l.split(',');
  return { a: +c[0], y: +c[1], sport: SPORT[+c[2]], grade: +c[3] || null, n: +c[4], cols: c.length };
});
const R = block('d-results').map((l) => {
  const c = l.split(',');
  return {
    a: +c[0], m: +c[1], sport: SPORT[+c[2]], dist: +c[4], t: +c[5],
    place: +c[6] || null, off: c[7] ? +c[7] : 0,
  };
});

const RULERS = {
  xc5000: { sport: 'xc', dist: 5000, col: 'b5000' },
  tf3000: { sport: 'tfo', dist: 3000, col: 'b3000' },
  tf1500: { sport: 'tfo', dist: 1500, col: 'b1500' },
};
const RKEYS = Object.keys(RULERS);

/* Is the page storing hundredths yet, or still seconds? The suite runs either
   way so it can be written before the change and run after it, which is the
   only way it can prove the change did what it said. */
const HUNDREDTHS = R.every((r) => Number.isInteger(r.t)) && R.some((r) => r.t > 20000);
const toH = (v) => (v == null ? null : HUNDREDTHS ? v : Math.round(v * 100));
const RAW = (v) => v;                                   // what the block literally holds

/* The page's own formatter, copied here ON PURPOSE. A suite that imports the
   thing it is testing cannot catch the thing being wrong. */
const frac = (h) => (h % 100 === 0 ? 0 : h % 10 === 0 ? 1 : 2);
const fmt = (h) => {
  if (h == null) return '—';
  if (h < 6000) return (h / 100).toFixed(frac(h));
  const m = Math.floor(h / 6000), r = (h - m * 6000) / 100;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(frac(h));
};

/* ---------- non-vacuous ---------- */
ok(A.length > 600, 'the page carries a real roster — ' + A.length + ' athletes');
ok(R.length > 10000, 'and real results — ' + R.length);
ok(S.length > 1500, 'and real athlete-seasons — ' + S.length);
ok(R.some((r) => r.sport === 'xc') && R.some((r) => r.sport === 'tfo'), 'from both sports');

/* ---------- 1. every stored time is a clean value ---------- */
const dirty = R.filter((r) => {
  const x = r.t * (HUNDREDTHS ? 1 : 100);
  return Math.abs(x - Math.round(x)) > 1e-9;
});
eq(dirty.length, 0, 'every result time is exact at hundredths in the block'
  + (dirty.length ? ' — e.g. ' + dirty[0].t : ''));

/* ---------- 2. THE SEASON BLOCK CARRIES NO TIMES ----------
   This is the fix, asserted structurally rather than by comparison. There is
   nothing to cross-check any more because there is nothing to cross-check
   against: the seasons block keeps the grade and the race count, and every
   best on the page is derived from the results. A block that grew a time
   column back would fail here before anybody saw a wrong number. */
eq(S.every((r) => r.cols === 5), true,
  'the seasons block has five columns and none of them is a time — '
  + 'widest row has ' + Math.max(...S.map((r) => r.cols)));
const numeric = Slines.filter((l) => {
  const c = l.split(',');
  return c.slice(5).some((v) => v !== '' && !Number.isNaN(+v));
});
eq(numeric.length, 0, 'and no row smuggles one in past the fifth column');

/* ---------- 3. the derivation, done here the way the page does it ---------- */
const schoolYearOf = (d) => +d.slice(0, 4) + (+d.slice(5, 7) >= 7 ? 1 : 0);
const MEETS = block('d-meets').map((l) => {
  const i2 = l.indexOf(',');
  return { date: l.slice(0, i2) };
});
const DAY = 86400000;
for (const r of R) {
  let d = (MEETS[r.m] || {}).date || '';
  if (d && r.off) d = new Date(Date.parse(d) + r.off * DAY).toISOString().slice(0, 10);
  r.date = d;
}
const have = new Set(S.map((x) => x.a + '|' + x.y + '|' + x.sport));
const orphan = R.filter((r) => r.date && !have.has(r.a + '|' + schoolYearOf(r.date) + '|' + r.sport));
eq(orphan.length, 0, 'EVERY RACE LANDS ON A SEASON — a race with no season row '
  + 'is a race that counts towards a career best and no grade'
  + (orphan.length ? ' — ' + orphan.length + ' of ' + R.length : ''));

const noDate = R.filter((r) => !r.date);
eq(noDate.length, 0, 'and every race has a date to land by');

/* A meet's date is the earliest of its own races, so no race may predate it
   and the offsets that carry the rest are small. */
const early = [], wild = [];
for (const r of R) {
  if (r.off < 0) early.push(r.m);
  if (r.off > 14) wild.push(r.m + ' +' + r.off);
}
eq(early.length, 0, 'no race is dated before its own meet');
eq(wild.length, 0, 'and none is a fortnight after it'
  + (wild.length ? ' — ' + wild.slice(0, 3).join(', ') : ''));

const fromResults = new Map();
for (const r of R) {
  if (!r.date) continue;
  for (const k of RKEYS) {
    const u = RULERS[k];
    if (r.sport !== u.sport || r.dist !== u.dist) continue;
    const key = r.a + '|' + schoolYearOf(r.date) + '|' + k;
    const was = fromResults.get(key);
    if (was == null || r.t < was) fromResults.set(key, r.t);
  }
}

/* ---------- 4. career bests, derived the same way twice ---------- */
const careerR = new Map();
for (const [key, v] of fromResults) {
  const [a, , k] = key.split('|');
  const kk = a + '|' + k;
  if (!careerR.has(kk) || v < careerR.get(kk)) careerR.set(kk, v);
}
/* The page derives a career best straight from the results rather than from
   the season bests. Both routes must land on the same value or the athlete
   page and the Board can disagree again. */
const careerDirect = new Map();
for (const r of R) {
  for (const k of RKEYS) {
    const u = RULERS[k];
    if (r.sport !== u.sport || r.dist !== u.dist) continue;
    const kk = r.a + '|' + k;
    if (!careerDirect.has(kk) || r.t < careerDirect.get(kk)) careerDirect.set(kk, r.t);
  }
}
let cDrift = 0;
for (const [kk, v] of careerDirect) if (careerR.get(kk) !== v) cDrift++;
eq(cDrift, 0, 'a career best is the same whether taken from the races or from '
  + 'the season bests — ' + careerDirect.size + ' athlete-rulers');

/* ---------- 5. ties are visible or shared, never silently ordered ---------- */
for (const g of ['M', 'F']) {
  const best = new Map();
  for (const [kk, v] of careerR) {
    const [a, k] = kk.split('|');
    if (k !== 'xc5000') continue;
    if (A[+a] && A[+a].g === g) best.set(+a, v);
  }
  const rows = [...best.entries()].sort((x, y) => x[1] - y[1]);
  let sameString = 0, sameValue = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === rows[i - 1][1]) sameValue++;
    else if (fmt(toH(rows[i][1])) === fmt(toH(rows[i - 1][1]))) sameString++;
  }
  ok(true, g + ' XC 5,000m: ' + sameValue + ' truly tied pairs, '
    + sameString + ' pairs that merely PRINT the same');
}

/* ---------- 6. the baseline: what every number on the page says today ---------- */
const snapshot = {};
for (const [kk, v] of careerR) snapshot['career|' + kk] = fmt(toH(v));
for (const [key, v] of fromResults) snapshot['season|' + key] = fmt(toH(v));

if (process.argv.includes('--baseline')) {
  fs.writeFileSync(BASE, JSON.stringify(snapshot));
  console.log('baseline written: ' + Object.keys(snapshot).length + ' values');
} else if (fs.existsSync(BASE)) {
  const was = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  const moved = [], gone = [], added = [];
  for (const k of Object.keys(was)) {
    if (!(k in snapshot)) gone.push(k);
    else if (snapshot[k] !== was[k]) moved.push(k + ': ' + was[k] + ' -> ' + snapshot[k]);
  }
  for (const k of Object.keys(snapshot)) if (!(k in was)) added.push(k);
  /* A number that moves is not automatically wrong - removing drift is
     supposed to move some of them - but it is never allowed to move quietly. */
  console.log('\nagainst the baseline: ' + moved.length + ' values changed, '
    + gone.length + ' gone, ' + added.length + ' new');
  if (moved.length) console.log('  ' + moved.slice(0, 12).join('\n  '));
  if (moved.length > 12) console.log('  ...and ' + (moved.length - 12) + ' more');
}

/* ---------- report ---------- */
for (const f of fails) console.log('  FAIL  ' + f);
console.log(pass + ' passed' + (fails.length ? ', ' + fails.length + ' FAILED' : ''));
process.exit(fails.length ? 1 : 0);
