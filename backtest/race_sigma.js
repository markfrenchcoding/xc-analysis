// Race ratings at their own best sigma.
//
// race_value.js ran every variant at the sigma raw marks want. Corrected marks
// should be less noisy, so they may want a narrower spread, and scoring them at
// raw's sigma would understate them. Here each variant, raw included, gets the
// best sigma at each cutoff from the same grid, chosen the same way - so the
// comparison is like for like, and every variant is equally flattered by the
// choice.
//
//   node backtest/race_sigma.js [seasonsPerPoint] [draws]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 4000);
const DRAWS = +(process.argv[3] || 2000);
const YEARS = L.years();
const GRID = [[3, 4, 5, 6, 7], [2, 2.5, 3, 3.5, 4], [1.6, 2, 2.3, 2.6, 3], [1.6, 2, 2.3, 2.6, 3]];
const VARIANTS = ['', '-race-0.5', '-race-1', '-drace-1'];
const label = v => v || 'raw';
const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));

const best = {};   // variant -> [{sigma, brier, pts}] per cutoff
for (const v of VARIANTS) {
  best[v] = [];
  for (let ci = 0; ci < nCuts; ci++) {
    let top = null;
    for (const sigma of GRID[ci]) {
      const pts = [];
      for (const y of YEARS) for (const g of ['M', 'F'])
        pts.push(...L.odds(y, g, L.cutoffs(y)[ci] + v, sigma, SEASONS).teams
          .map(t => ({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual })));
      const b = L.brier(pts.map(x => [x.p, x.o]));
      if (!top || b < top.brier) top = { sigma, brier: b, pts };
    }
    best[v].push(top);
  }
}

console.log('race ratings at their own best sigma - ' + YEARS.join(', ') + ', '
  + SEASONS.toLocaleString() + ' seasons per point\n');
console.log('  ' + 'variant'.padEnd(12) + [1, 2, 3, 4].map(i => ('cut ' + i).padStart(15)).join('')
  + '   pooled   vs raw');
const pooledOf = v => L.brier(best[v].flatMap(c => c.pts).map(x => [x.p, x.o]));
const base = pooledOf('');
for (const v of VARIANTS) {
  const p = pooledOf(v);
  console.log('  ' + label(v).padEnd(12)
    + best[v].map(c => (c.brier.toFixed(4) + ' @' + c.sigma).padStart(15)).join('')
    + p.toFixed(4).padStart(9) + ((p < base ? '  -' : '  +') + (100 * Math.abs(p / base - 1)).toFixed(1) + '%').padStart(9));
}

const top = VARIANTS.slice(1).reduce((b, v) => pooledOf(v) < pooledOf(b) ? v : b, VARIANTS[1]);
const raw = best[''].flatMap(c => c.pts), alt = best[top].flatMap(c => c.pts);
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
console.log('\n  best: ' + label(top) + ', beats raw (each at its own sigma) in '
  + (100 * wins / DRAWS).toFixed(0) + '% of ' + DRAWS + ' bootstrap draws');
