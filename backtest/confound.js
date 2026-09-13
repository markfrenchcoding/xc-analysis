// Is the September penalty about the horizon, or about the database being thin?
//
// In mid-September only about a quarter of athletes have raced twice; by late
// October it is nearly two thirds. So the September information set is not only
// further from the state meet, it is poorer. Both would push the best sigma up,
// and the horizon test cannot tell them apart.
//
// This does: take the LATEST information set, which is close to the state meet,
// and cripple it to one mark per athlete - the same poverty September has, none
// of the distance. If the best sigma jumps back up, thin data was the cause. If
// it stays put, the horizon was.
//
//   node backtest/confound.js [seasonsPerPoint]
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 6000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0];
const YEARS = L.years();

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const secs = m => { const x = /^(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(m);
  return x ? (+x[1]) * 60 + (+x[2]) + (x[3] ? +('0.' + x[3]) : 0) : null; };

// write a one-mark-per-athlete copy of a seed, tagged so lib.odds can load it
function thin(year, cutoff) {
  const src = path.join(L.DIR, year + '-seed-' + cutoff + '.csv');
  const lines = fs.readFileSync(src, 'utf8').trim().split(/\r?\n/);
  const head = lines.shift();
  const best = new Map();
  for (const line of lines) {
    const c = split(line);
    const k = c[0] + '|' + c[1] + '|' + c[4] + '|' + c[5];
    const t = secs(c[2]);
    if (!best.has(k) || t < best.get(k).t) best.set(k, { t, line });
  }
  const tag = cutoff + '-single';
  fs.writeFileSync(path.join(L.DIR, year + '-seed-' + tag + '.csv'),
    [head, ...[...best.values()].map(v => v.line)].join('\n') + '\n');
  return { tag, kept: best.size, was: lines.length };
}

function sweep(pick) {
  const per = SIGMAS.map(() => []);
  for (const y of YEARS) for (const g of ['M', 'F']) {
    const cut = pick(y);
    SIGMAS.forEach((s, si) => {
      const { teams } = L.odds(y, g, cut, s, SEASONS);
      per[si].push(...teams.map(t => [t.p, t.actual]));
    });
  }
  const b = per.map(L.brier);
  let bi = 0; b.forEach((v, i) => { if (v < b[bi]) bi = i; });
  return { best: SIGMAS[bi], brier: b[bi], at23: b[SIGMAS.indexOf(2.3)] };
}

const firstCut = y => L.cutoffs(y)[0];
const lastCut = y => L.cutoffs(y)[L.cutoffs(y).length - 1];

console.log('confound test — ' + SEASONS.toLocaleString() + ' seasons per point\n');

const info = YEARS.map(y => thin(y, lastCut(y)));
info.forEach((i, n) => console.log('  ' + YEARS[n] + ' late seed thinned to one mark each: '
  + i.was + ' marks -> ' + i.kept));

const sep = sweep(firstCut);
const late = sweep(lastCut);
const lateThin = sweep(y => lastCut(y) + '-single');

console.log('\n  information set                         best sigma    Brier');
console.log('  September, thin data, 8 weeks out   ' + (sep.best.toFixed(1) + '%').padStart(12)
  + sep.brier.toFixed(4).padStart(10));
console.log('  late October, rich data, 2 weeks    ' + (late.best.toFixed(1) + '%').padStart(12)
  + late.brier.toFixed(4).padStart(10));
console.log('  late October, THINNED, 2 weeks      ' + (lateThin.best.toFixed(1) + '%').padStart(12)
  + lateThin.brier.toFixed(4).padStart(10));

console.log('\n' + (lateThin.best >= sep.best - 0.5
  ? 'Thinning the late database pushes the best sigma back up to ' + lateThin.best + '%.\n'
    + 'So the September penalty is mostly about having one mark per athlete, not\n'
    + 'about the eight weeks. A drift term would be fitting the wrong thing.'
  : lateThin.best <= late.best + 0.5
    ? 'Thinning barely moves it (' + late.best + '% -> ' + lateThin.best + '%), so the\n'
      + 'September penalty is about the horizon, not the data. A drift term is the\n'
      + 'right shape of fix.'
    : 'Thinning moves it part of the way (' + late.best + '% -> ' + lateThin.best + '%, vs '
      + sep.best + '% in September).\n'
      + 'Both matter: some of the September penalty is thin data and some is horizon.'));
