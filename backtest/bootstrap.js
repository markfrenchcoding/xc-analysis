// How well-pinned is the best sigma? Resamples the backtest outcomes to put an
// interval around the optimum, and shows what one season buys versus two - which
// is the question "is another season worth pulling" in measurable form.
//
// Teams inside a league compete for the same berths, so their outcomes are not
// independent. Resampling is therefore done on whole league-seasons, not teams.
//   node backtest/bootstrap.js [seasonsPerPoint] [draws]
const fs = require('fs');
const path = require('path');
const M = require('../model.js');

const DIR = path.join(__dirname, 'data');
const SEASONS = +(process.argv[2] || 8000);
const DRAWS = +(process.argv[3] || 2000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0];
const YEARS = fs.readdirSync(DIR).filter(f => /-truth\.json$/.test(f)).map(f => f.slice(0, 4)).sort();

function run(year, gender, sigma) {
  const truth = JSON.parse(fs.readFileSync(path.join(DIR, year + '-truth.json'), 'utf8'));
  const csv = fs.readFileSync(path.join(DIR, year + '-seed.csv'), 'utf8');
  M.setDATA(M.parseCSV(csv).rows.filter(r => r.g === gender));
  M.setLeagues(truth.leagues[gender]);
  M.setBerths(truth.berths[gender].auto, truth.berths[gender].atLarge);
  const model = M.buildModel(gender, 5000);
  const t = M.blankTally(model);
  const worlds = [{ adj: null, byIdx: t.byIdx }];
  const times = new Float64Array(model.runners.length);
  const tmp = new Float64Array(model.runners.length);
  const shock = new Float64Array(model.teams.length);
  for (let i = 0; i < SEASONS; i++) M.oneSeason(model, worlds, sigma / 100, times, shock, tmp);
  const qualified = new Set(truth.state[gender].map(x => x.team));
  const pred = {}; for (const x of t.list) pred[x.name] = x.qual / SEASONS;
  const out = [];
  for (const lg in truth.leagues[gender]) for (const name of truth.leagues[gender][lg])
    out.push({ cluster: year + '|' + gender + '|' + lg, year, gender,
               p: pred[name] || 0, o: qualified.has(name) ? 1 : 0 });
  return out;
}

// prediction matrix: one row per team-season, one column per sigma
console.log('building prediction matrix (' + SIGMAS.length + ' sigmas x ' + (YEARS.length * 2) + ' season-genders)...');
let rows = null;
SIGMAS.forEach((s, si) => {
  const all = [];
  for (const y of YEARS) for (const g of ['M', 'F']) all.push(...run(y, g, s));
  if (!rows) rows = all.map(r => ({ cluster: r.cluster, year: r.year, o: r.o, p: [] }));
  all.forEach((r, i) => rows[i].p[si] = r.p);
});
console.log('team-seasons: ' + rows.length + '   clusters: ' + new Set(rows.map(r => r.cluster)).size + '\n');

const byCluster = {};
rows.forEach(r => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(r));
const clusters = Object.keys(byCluster);

function brierAt(sample, si) {
  let s = 0, n = 0;
  for (const r of sample) { s += (r.p[si] - r.o) ** 2; n++; }
  return s / n;
}
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
  const hist = {}; picks.forEach(v => hist[v] = (hist[v] || 0) + 1);
  const over3 = picks.filter(v => v >= 3.5).length / picks.length;
  console.log(label);
  console.log('  median best sigma ' + q(0.5).toFixed(1) + '%   80% interval ' + q(0.1).toFixed(1) + '–' + q(0.9).toFixed(1) + '%'
    + '   95% interval ' + q(0.025).toFixed(1) + '–' + q(0.975).toFixed(1) + '%');
  console.log('  P(best sigma is at least 3.5%) = ' + (100 * over3).toFixed(0) + '%');
  console.log('  spread of picks: ' + Object.keys(hist).sort((a, b) => a - b)
    .map(k => k + '%:' + (100 * hist[k] / picks.length).toFixed(0)).join('  ') + '\n');
  return q(0.9) - q(0.1);
}

const wAll = bootstrap(clusters, 'BOTH SEASONS (' + clusters.length + ' league-seasons)');
// one season at a time, to see how the interval narrows as seasons are added
const widths = [];
for (const y of YEARS) {
  const sub = clusters.filter(c => c.startsWith(y));
  widths.push(bootstrap(sub, 'ONLY ' + y + ' (' + sub.length + ' league-seasons)'));
}
const oneSeason = widths.reduce((a, b) => a + b, 0) / widths.length;
console.log('80% interval width: one season ' + oneSeason.toFixed(1) + ' points, two seasons ' + wAll.toFixed(1) + ' points');
const ratio = Math.sqrt(2 / 3);
console.log('\nif width scales as 1/sqrt(seasons), a third season would take it to about '
  + (wAll * ratio).toFixed(1) + ' points');
