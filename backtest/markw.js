// Which sampling weights should MARK_W use?
//
// The shipped scheme truncates [0.25, 0.50, 0.25] and renormalises, so an
// athlete with two marks gets [0.33, 0.67] — two thirds of the weight on the
// SLOWER mark. With three marks the 50% lands on the middle one, which is the
// intent; with two there is no middle, so the split is worth questioning.
//
// Schemes are specified for BOTH counts, because changing only the two-mark case
// is not the same experiment as ignoring extra marks altogether.
//
// Differences between schemes are small, so the ranking alone is not enough to
// act on. The second half runs a paired cluster bootstrap — same resampled
// league-seasons scored under both schemes — to say whether a gap is real.
//
//   node backtest/markw.js [seasonsPerPoint] [draws]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 6000);
const DRAWS = +(process.argv[3] || 2000);
const YEARS = L.years();
const ONLY = process.argv.includes("--cut") ? +process.argv[process.argv.indexOf("--cut")+1] : null;
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];   // from horizon.js

const SCHEMES = [
  ['ignore extras     [1.00,0.00] [1.00,0.00,0.00]', [1, 0], [1, 0, 0]],
  ['best-biased       [0.67,0.33] [0.50,0.30,0.20]', [2 / 3, 1 / 3], [0.5, 0.3, 0.2]],
  ['even              [0.50,0.50] [0.33,0.33,0.33]', [0.5, 0.5], [1 / 3, 1 / 3, 1 / 3]],
  ['even two only     [0.50,0.50] [0.25,0.50,0.25]', [0.5, 0.5], [0.25, 0.5, 0.25]],
  ['SHIPPED           [0.33,0.67] [0.25,0.50,0.25]', [1 / 3, 2 / 3], [0.25, 0.5, 0.25]],
  ['slow-biased       [0.25,0.75] [0.20,0.30,0.50]', [0.25, 0.75], [0.2, 0.3, 0.5]],
];
const mk = (two, three) => n => n === 1 ? [1] : n === 2 ? two : three;

console.log('MARK_W weighting — ' + YEARS.join(', ') + ', all cutoffs, '
  + SEASONS.toLocaleString() + ' seasons per point\n');

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
const CUTS = ONLY===null ? [...Array(nCuts).keys()] : [ONLY];
const preds = [];      // preds[schemeIndex] = [{cluster, p, o}, ...] in a stable order
const rows = [];
for (const [label, two, three] of SCHEMES) {
  const fn = mk(two, three);
  const flat = [], perCut = [];
  for (const ci of CUTS) {
    const cut = [];
    for (const y of YEARS) for (const g of ['M', 'F']) {
      const { teams } = L.odds(y, g, L.cutoffs(y)[ci], SIGMA_BY_CUT[ci], SEASONS, fn);
      for (const t of teams) cut.push({ cluster: t.cluster + '|' + ci, p: t.p, o: t.actual });
    }
    perCut.push(L.brier(cut.map(r => [r.p, r.o])));
    flat.push(...cut);
  }
  preds.push(flat);
  rows.push({ label, brier: L.brier(flat.map(r => [r.p, r.o])), perCut });
  console.log('  ' + label + '   pooled ' + rows[rows.length - 1].brier.toFixed(4)
    + '   by cutoff ' + perCut.map(b => b.toFixed(4)).join(' '));
}

console.log('\nranked by pooled Brier:');
rows.map((r, i) => ({ ...r, i })).sort((a, b) => a.brier - b.brier)
  .forEach((r, n) => console.log('  ' + (n + 1) + '. ' + r.label + '  ' + r.brier.toFixed(4)));

// paired cluster bootstrap: resample whole league-season-cutoffs, score every
// scheme on the same resample, and see how often each beats the shipped one
const shipIdx = SCHEMES.findIndex(s => /SHIPPED/.test(s[0]));
const byCluster = {};
preds[0].forEach((r, i) => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(i));
const clusters = Object.keys(byCluster);

console.log('\npaired bootstrap vs the shipped scheme (' + DRAWS.toLocaleString()
  + ' draws over ' + clusters.length + ' league-season-cutoffs)');
console.log('  scheme                                          median gap    beats shipped');
const wins = SCHEMES.map(() => []);
for (let d = 0; d < DRAWS; d++) {
  const idx = [];
  for (let i = 0; i < clusters.length; i++) idx.push(...byCluster[clusters[Math.floor(Math.random() * clusters.length)]]);
  const bs = preds.map(p => {
    let s = 0; for (const i of idx) s += (p[i].p - p[i].o) ** 2; return s / idx.length;
  });
  bs.forEach((b, i) => wins[i].push(b - bs[shipIdx]));
}
SCHEMES.forEach(([label], i) => {
  if (i === shipIdx) return;
  const g = wins[i].slice().sort((a, b) => a - b);
  const med = g[Math.floor(0.5 * (g.length - 1))];
  const frac = g.filter(v => v < 0).length / g.length;
  console.log('  ' + label + '  ' + (med >= 0 ? '+' : '') + med.toFixed(4)
    + '        ' + (100 * frac).toFixed(0) + '%');
});
console.log('\nA gap is only worth acting on if it beats shipped in the large majority');
console.log('of draws. Anything near 50% is noise.');
