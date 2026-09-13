// How well-pinned is the best sigma? Resamples the backtest outcomes to put an
// interval around the optimum, and shows what one season buys versus two — which
// is the question "is another season worth pulling" in measurable form.
//
// Teams inside a league compete for the same berths, so their outcomes are not
// independent. Resampling is therefore done on whole league-seasons, not teams.
//   node backtest/bootstrap.js [seasonsPerPoint] [draws] [--cut N]
const L = require('./lib.js');

const argv = process.argv.slice(2);
const ci = argv.includes('--cut') ? +argv[argv.indexOf('--cut') + 1] : 0;
const nums = argv.filter(a => /^\d+$/.test(a));
const SEASONS = +(nums[0] || 8000);
const DRAWS = +(nums[1] || 2000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0];
const YEARS = L.years();

console.log('building prediction matrix (' + SIGMAS.length + ' sigmas x ' + (YEARS.length * 2) + ' season-genders)...');
let rows = null;
SIGMAS.forEach((s, si) => {
  const all = [];
  for (const y of YEARS) for (const g of ['M', 'F'])
    all.push(...L.odds(y, g, L.cutoffs(y)[ci], s, SEASONS).teams);
  if (!rows) rows = all.map(r => ({ cluster: r.cluster, year: r.year, o: r.actual, p: [] }));
  all.forEach((r, i) => rows[i].p[si] = r.p);
});
console.log('team-seasons: ' + rows.length + '   clusters: ' + new Set(rows.map(r => r.cluster)).size
  + '   cutoff: ' + YEARS.map(y => L.cutoffs(y)[ci]).join(', ') + '\n');

const byCluster = {};
rows.forEach(r => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(r));
const clusters = Object.keys(byCluster);

const brierAt = (sample, si) => sample.reduce((s, r) => s + (r.p[si] - r.o) ** 2, 0) / sample.length;
function argmin(sample) {
  let best = 0;
  for (let i = 1; i < SIGMAS.length; i++) if (brierAt(sample, i) < brierAt(sample, best)) best = i;
  return SIGMAS[best];
}

function bootstrap(pool, label) {
  const picks = [];
  for (let d = 0; d < DRAWS; d++) {
    const sample = [];
    for (let i = 0; i < pool.length; i++) sample.push(...byCluster[pool[Math.floor(Math.random() * pool.length)]]);
    picks.push(argmin(sample));
  }
  picks.sort((a, b) => a - b);
  const q = f => picks[Math.floor(f * (picks.length - 1))];
  const over = picks.filter(v => v >= 3.5).length / picks.length;
  console.log(label);
  console.log('  median best sigma ' + q(0.5).toFixed(1) + '%   80% interval ' + q(0.1).toFixed(1)
    + '–' + q(0.9).toFixed(1) + '%   95% interval ' + q(0.025).toFixed(1) + '–' + q(0.975).toFixed(1) + '%');
  console.log('  P(best sigma is at least 3.5%) = ' + (100 * over).toFixed(0) + '%\n');
  return q(0.9) - q(0.1);
}

const wAll = bootstrap(clusters, 'ALL SEASONS (' + clusters.length + ' league-seasons)');
const widths = [];
for (const y of YEARS) {
  const sub = clusters.filter(c => c.startsWith(y));
  widths.push(bootstrap(sub, 'ONLY ' + y + ' (' + sub.length + ' league-seasons)'));
}
const one = widths.reduce((a, b) => a + b, 0) / widths.length;
console.log('80% interval width: one season ' + one.toFixed(1) + ' points, '
  + YEARS.length + ' seasons ' + wAll.toFixed(1) + ' points');
console.log('if width scales as 1/sqrt(seasons), one more season takes it to about '
  + (wAll * Math.sqrt(YEARS.length / (YEARS.length + 1))).toFixed(1) + ' points');
