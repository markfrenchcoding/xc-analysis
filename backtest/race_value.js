// Do race ratings predict better than raw marks?
//
// The Tully Runners question, asked of the backtest. Every variant is built by
// build_season.js --race=... from marks available AT each cutoff, so no
// September forecast sees October:
//
//   race<r>   each mark divided by how fast its race was on the day, with the
//             weekly improvement fixed at r% so it cannot hide in the races
//   trend<r>  the same, then carried forward to the cutoff date at r% a week
//
// race0 is the old failure in median form: no improvement term at all.
// All variants run at the same sigma per cutoff as course_value.js, then a
// paired cluster bootstrap over league-season-cutoffs for the best one.
//
//   node backtest/race_value.js [seasonsPerPoint] [draws]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 6000);
const DRAWS = +(process.argv[3] || 2000);
const YEARS = L.years();
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];
const TAUS = ['0', '-0.5', '-1', '-1.5'];
const VARIANTS = ['', ...TAUS.map(t => '-race' + t), ...TAUS.map(t => '-trend' + t)];
const label = v => v || 'raw';

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
const all = {}; VARIANTS.forEach(v => all[v] = []);
const byCut = [];

for (let ci = 0; ci < nCuts; ci++) {
  const row = {};
  for (const v of VARIANTS) {
    const pts = [];
    for (const y of YEARS) for (const g of ['M', 'F']) {
      const cut = L.cutoffs(y)[ci];
      pts.push(...L.odds(y, g, cut + v, SIGMA_BY_CUT[ci], SEASONS).teams
        .map(t => ({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual })));
    }
    all[v].push(...pts);
    row[v] = L.brier(pts.map(x => [x.p, x.o]));
  }
  byCut.push(row);
}

console.log('race ratings - ' + YEARS.join(', ') + ', ' + SEASONS.toLocaleString()
  + ' seasons per point. Brier, lower is better.\n');
console.log('  ' + 'variant'.padEnd(14) + byCut.map((_, i) => ('cut ' + (i + 1)).padStart(9)).join('')
  + '   pooled   vs raw');
const pooled = v => L.brier(all[v].map(x => [x.p, x.o]));
const base = pooled('');
for (const v of VARIANTS) {
  const p = pooled(v);
  console.log('  ' + label(v).padEnd(14) + byCut.map(r => r[v].toFixed(4).padStart(9)).join('')
    + p.toFixed(4).padStart(9) + ((p < base ? '  -' : '  +') + (100 * Math.abs(p / base - 1)).toFixed(1) + '%').padStart(9));
}

// the best variant against raw, paired over clusters
const best = VARIANTS.slice(1).reduce((b, v) => pooled(v) < pooled(b) ? v : b, VARIANTS[1]);
const raw = all[''], alt = all[best];
const byCluster = {};
raw.forEach((r, i) => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(i));
const clusters = Object.keys(byCluster);
let wins = 0;
for (let d = 0; d < DRAWS; d++) {
  let sr = 0, sa = 0;
  for (let i = 0; i < clusters.length; i++)
    for (const j of byCluster[clusters[Math.floor(Math.random() * clusters.length)]]) {
      sr += (raw[j].p - raw[j].o) ** 2; sa += (alt[j].p - alt[j].o) ** 2;
    }
  if (sa < sr) wins++;
}
console.log('\n  best: ' + label(best) + ', beats raw marks in ' + (100 * wins / DRAWS).toFixed(0)
  + '% of ' + DRAWS + ' bootstrap draws');
