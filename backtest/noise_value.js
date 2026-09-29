// Does the measured race-day noise forecast better than the assumed one?
//
// athlete_level.js --noise measured two things the simulator assumes: how much
// of a race a team shares (8%, against the 30% the simulator used) and how
// often a runner blows up (one in eighty-odd, against a skewed bell curve that
// almost never produces one). They pull opposite ways on a favourite's safety -
// less sharing lets teammates' luck cancel, blow-ups make a scorer's disaster
// likelier - so only the full simulation can say what the pair is worth.
//
// Each noise model runs on the race-rated seeds (what ships) at its own best
// sigma per cutoff from one grid, then a paired cluster bootstrap for the best
// against the current model.
//
//   node backtest/noise_value.js [seasonsPerPoint] [draws]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 4000);
const DRAWS = +(process.argv[3] || 2000);
const VARIANT = '-race' + require('../pull/seed.js').RACE_TAU;
const YEARS = L.years();
const GRID = [[4, 5, 6, 7, 8], [1.8, 2.3, 2.6, 3, 3.5], [1.0, 1.2, 1.4, 1.6, 1.8, 2.0], [1.0, 1.2, 1.4, 1.6, 1.8, 2.0]];
const MODELS = {
  'current (30% shared)':        [0.30, 0],
  'measured share (8%)':         [0.08, 0],
  'blow-ups, 30% shared':        [0.30, 0.012],
  'measured share + blow-ups':   [0.08, 0.012],
};
const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));

const res = {};
for (const [name, [share, blow]] of Object.entries(MODELS)) {
  L.M.setNoise(share, blow);
  res[name] = [];
  for (let ci = 0; ci < nCuts; ci++) {
    let top = null;
    for (const sigma of GRID[ci]) {
      const pts = [];
      for (const y of YEARS) for (const g of ['M', 'F'])
        pts.push(...L.odds(y, g, L.cutoffs(y)[ci] + VARIANT, sigma, SEASONS).teams
          .map(t => ({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual })));
      const b = L.brier(pts.map(x => [x.p, x.o]));
      if (!top || b < top.b) top = { b, sigma, pts };
    }
    res[name].push(top);
  }
}
L.M.setNoise(0.30, 0);

console.log('race-day noise models on race-rated seeds - ' + YEARS.join(', ') + ', '
  + SEASONS.toLocaleString() + ' seasons per point. Brier at each model\'s best sigma.\n');
console.log('  ' + 'model'.padEnd(28) + ['8 wk', '6 wk', '4 wk', '2 wk'].map(w => w.padStart(14)).join('') + '   pooled');
const pooled = n => L.brier(res[n].flatMap(c => c.pts).map(x => [x.p, x.o]));
for (const n of Object.keys(MODELS))
  console.log('  ' + n.padEnd(28) + res[n].map(c => (c.b.toFixed(4) + ' @' + c.sigma).padStart(14)).join('')
    + pooled(n).toFixed(4).padStart(9));

const base = 'current (30% shared)';
for (const n of Object.keys(MODELS).filter(n => n !== base)) {
  const a = res[base].flatMap(c => c.pts), b = res[n].flatMap(c => c.pts);
  const idx = {}; a.forEach((x, i) => (idx[x.cluster] = idx[x.cluster] || []).push(i));
  const cl = Object.keys(idx); let wins = 0;
  for (let d = 0; d < DRAWS; d++) {
    let sa = 0, sb = 0;
    for (let i = 0; i < cl.length; i++) for (const j of idx[cl[Math.floor(Math.random() * cl.length)]]) {
      sa += (a[j].p - a[j].o) ** 2; sb += (b[j].p - b[j].o) ** 2;
    }
    if (sb < sa) wins++;
  }
  console.log('  ' + n + ' beats current in ' + (100 * wins / DRAWS).toFixed(0) + '% of draws');
}
