// How wide should the variance dial be for a September -> November projection?
// Re-runs the backtest across a range of sigma and scores each one.
//   node sweep.js [seasonsPerPoint]
const fs = require('fs');
const path = require('path');
const M = require('../model.js');

const DIR = path.join(__dirname, 'data');
const SEASONS = +(process.argv[2] || 8000);
const YEARS = fs.readdirSync(DIR).filter(f => /-truth\.json$/.test(f)).map(f => f.slice(0, 4)).sort().reverse();

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
  const all = new Set();
  for (const l in truth.leagues[gender]) truth.leagues[gender][l].forEach(x => all.add(x));
  const pred = {}; for (const x of t.list) pred[x.name] = x.qual / SEASONS;
  return [...all].map(n => [pred[n] || 0, qualified.has(n) ? 1 : 0]);
}

const brier = ps => ps.reduce((s, [p, o]) => s + (p - o) * (p - o), 0) / ps.length;
const logloss = ps => -ps.reduce((s, [p, o]) => {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return s + (o ? Math.log(q) : Math.log(1 - q));
}, 0) / ps.length;

console.log('sigma sweep — ' + YEARS.join(', ') + ', ' + SEASONS.toLocaleString() + ' seasons per point\n');
const cells = [];
for (const y of YEARS) for (const g of ['M', 'F']) cells.push({ y, g, key: y + ' ' + (g === 'M' ? 'boys' : 'girls') });
process.stdout.write(' sigma ');
cells.forEach(c => process.stdout.write('  ' + c.key.padStart(11)));
console.log('     POOLED    logloss');

const SIGMAS = [2.3, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0];
const results = [];
for (const s of SIGMAS) {
  const per = cells.map(c => run(c.y, c.g, s));
  const all = per.flat();
  process.stdout.write(' ' + s.toFixed(1).padStart(4) + '%');
  per.forEach(p => process.stdout.write('  ' + brier(p).toFixed(4).padStart(11)));
  const bs = brier(all), ll = logloss(all);
  console.log('     ' + bs.toFixed(4) + '     ' + ll.toFixed(4));
  results.push({ s, bs, ll, per: per.map(brier) });
}
const bB = results.reduce((a, b) => b.bs < a.bs ? b : a);
const bL = results.reduce((a, b) => b.ll < a.ll ? b : a);
console.log('\nbest pooled Brier   : sigma ' + bB.s + '%  (' + bB.bs.toFixed(4) + ')');
console.log('best pooled logloss : sigma ' + bL.s + '%  (' + bL.ll.toFixed(4) + ')');
console.log('shipped 2.3%        : Brier ' + results[0].bs.toFixed(4) + ', logloss ' + results[0].ll.toFixed(4));
console.log('\nper-season optimum (Brier):');
cells.forEach((c, i) => {
  const best = results.reduce((a, b) => b.per[i] < a.per[i] ? b : a);
  console.log('  ' + c.key.padEnd(12) + ' sigma ' + String(best.s).padStart(4) + '%   ' + best.per[i].toFixed(4));
});
