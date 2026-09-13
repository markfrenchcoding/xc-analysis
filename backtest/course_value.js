// Does correcting marks for course difficulty predict better?
//
// Compares the same seed with and without the fitted factors applied, at every
// cutoff, each run at the sigma the horizon test picked, then a paired cluster
// bootstrap over league-season-cutoffs to say whether the gap is real rather
// than a lucky resample.
//
// The factors are fitted only from marks available AT each cutoff, so a
// September forecast never sees October.
//
//   node backtest/course_value.js [seasonsPerPoint] [draws]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 8000);
const DRAWS = +(process.argv[3] || 2000);
const YEARS = L.years();
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
const raw = [], adj = [];

console.log('course adjustment — ' + YEARS.join(', ') + ', ' + SEASONS.toLocaleString()
  + ' seasons per point\n');
console.log('  cutoff            raw marks   course-adjusted   change');
for (let ci = 0; ci < nCuts; ci++) {
  const r = [], a = [];
  for (const y of YEARS) for (const g of ['M', 'F']) {
    const cut = L.cutoffs(y)[ci];
    r.push(...L.odds(y, g, cut, SIGMA_BY_CUT[ci], SEASONS).teams
      .map(t => ({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual })));
    a.push(...L.odds(y, g, cut + '-course', SIGMA_BY_CUT[ci], SEASONS).teams
      .map(t => ({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual })));
  }
  const br = L.brier(r.map(x => [x.p, x.o])), ba = L.brier(a.map(x => [x.p, x.o]));
  console.log('  ' + YEARS.map(y => L.cutoffs(y)[ci].slice(5)).join('/').padEnd(16)
    + br.toFixed(4).padStart(10) + ba.toFixed(4).padStart(18)
    + ('  ' + (ba < br ? '' : '+') + (ba - br).toFixed(4)).padStart(10)
    + (ba < br ? '   better' : '   worse'));
  raw.push(...r); adj.push(...a);
}

const br = L.brier(raw.map(x => [x.p, x.o])), ba = L.brier(adj.map(x => [x.p, x.o]));
console.log('\n  pooled   raw ' + br.toFixed(4) + '   adjusted ' + ba.toFixed(4)
  + '   ' + (ba < br ? (100 * (1 - ba / br)).toFixed(1) + '% better'
                          : (100 * (ba / br - 1)).toFixed(1) + '% WORSE'));
console.log('  logloss  raw ' + L.logloss(raw.map(x => [x.p, x.o])).toFixed(4)
  + '   adjusted ' + L.logloss(adj.map(x => [x.p, x.o])).toFixed(4));

// paired cluster bootstrap
const byCluster = {};
raw.forEach((r, i) => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(i));
const clusters = Object.keys(byCluster);
let wins = 0; const gaps = [];
for (let d = 0; d < DRAWS; d++) {
  const idx = [];
  for (let i = 0; i < clusters.length; i++) idx.push(...byCluster[clusters[Math.floor(Math.random() * clusters.length)]]);
  let sr = 0, sa = 0;
  for (const i of idx) { sr += (raw[i].p - raw[i].o) ** 2; sa += (adj[i].p - adj[i].o) ** 2; }
  gaps.push((sa - sr) / idx.length);
  if (sa < sr) wins++;
}
gaps.sort((a, b) => a - b);
const q = f => gaps[Math.floor(f * (gaps.length - 1))];
console.log('\n  paired bootstrap over ' + clusters.length + ' league-season-cutoffs, '
  + DRAWS.toLocaleString() + ' draws');
console.log('  median gap ' + q(0.5).toFixed(4) + '   80% interval '
  + q(0.1).toFixed(4) + ' to ' + q(0.9).toFixed(4));
console.log('  adjustment beats raw in ' + (100 * wins / DRAWS).toFixed(0) + '% of draws');
