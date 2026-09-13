// Do extra marks per athlete actually help, as currently weighted?
//
// The meet-results pull gave most athletes two or three marks and turned on
// top-three sampling. That is only an improvement if sampling across those marks
// predicts better than simply using each athlete's best. It might not: MARK_W
// puts two thirds of the weight on the slower of two marks, and marks come from
// courses of very different difficulty, so a second mark carries course as much
// as form.
//
// For each cutoff this compares the full database against one thinned to a
// single mark per athlete, each run at its own best sigma so neither is
// handicapped by the other's dial.
//
//   node backtest/marks_value.js [seasonsPerPoint]
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 6000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0];
const YEARS = L.years();

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const secs = m => { const x = /^(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(m);
  return x ? (+x[1]) * 60 + (+x[2]) + (x[3] ? +('0.' + x[3]) : 0) : null; };

function thin(year, cutoff) {
  const lines = fs.readFileSync(path.join(L.DIR, year + '-seed-' + cutoff + '.csv'), 'utf8')
    .trim().split(/\r?\n/);
  const head = lines.shift();
  const best = new Map();
  for (const line of lines) {
    const c = split(line);
    const k = c[0] + '|' + c[1] + '|' + c[4] + '|' + c[5];
    const t = secs(c[2]);
    if (!best.has(k) || t < best.get(k).t) best.set(k, { t, line });
  }
  fs.writeFileSync(path.join(L.DIR, year + '-seed-' + cutoff + '-single.csv'),
    [head, ...[...best.values()].map(v => v.line)].join('\n') + '\n');
  return { marks: lines.length, athletes: best.size };
}

function sweep(cutOf) {
  const per = SIGMAS.map(() => []);
  for (const y of YEARS) for (const g of ['M', 'F']) {
    SIGMAS.forEach((s, si) => {
      const { teams } = L.odds(y, g, cutOf(y), s, SEASONS);
      per[si].push(...teams.map(t => [t.p, t.actual]));
    });
  }
  const b = per.map(L.brier), ll = per.map(L.logloss);
  let bi = 0; b.forEach((v, i) => { if (v < b[bi]) bi = i; });
  return { sigma: SIGMAS[bi], brier: b[bi], logloss: ll[bi] };
}

console.log('value of extra marks — ' + YEARS.join(', ') + ', ' + SEASONS.toLocaleString() + ' seasons per point');
console.log('each column run at its own best sigma\n');
console.log('  cutoff          marks/athlete    full: sigma  Brier     best-only: sigma  Brier     winner');

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
for (let ci = 0; ci < nCuts; ci++) {
  let marks = 0, ath = 0;
  for (const y of YEARS) { const i = thin(y, L.cutoffs(y)[ci]); marks += i.marks; ath += i.athletes; }
  const full = sweep(y => L.cutoffs(y)[ci]);
  const single = sweep(y => L.cutoffs(y)[ci] + '-single');
  const win = single.brier < full.brier ? 'best-only' : 'full';
  const gap = Math.abs(single.brier - full.brier);
  console.log('  ' + YEARS.map(y => L.cutoffs(y)[ci].slice(5)).join('/').padEnd(14)
    + (marks / ath).toFixed(2).padStart(10)
    + (full.sigma.toFixed(1) + '%').padStart(16) + full.brier.toFixed(4).padStart(8)
    + (single.sigma.toFixed(1) + '%').padStart(20) + single.brier.toFixed(4).padStart(8)
    + '     ' + win + ' by ' + gap.toFixed(4));
}
console.log('\nA win for "best-only" means the extra marks are costing accuracy as currently');
console.log('weighted — see open items on MARK_W and course adjustment.');
