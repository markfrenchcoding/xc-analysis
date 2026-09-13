// Backtest: build the database as it stood in mid-September, simulate the
// season, compare against what actually happened at Lane in November.
//
// Each season is its own contest. The leagues, their membership and the size of
// the state field all move year to year - 2024 and 2025 both ran 18 teams
// (14 automatic + 4 at-large) where 2026 runs 16 - so the harness reads those
// from the season's own results rather than assuming today's rules.
//
//   node backtest.js                 both seasons
//   node backtest.js 2025            one season
//   node backtest.js 2025 2024 5.0   both, with the variance dial at 5.0%
const fs = require('fs');
const path = require('path');
const M = require('../model.js');

const DIR = path.join(__dirname, 'data');
const args = process.argv.slice(2);
const sigmaArg = args.find(a => /^\d+(\.\d+)?$/.test(a) && +a < 100 && a.includes('.'));
const years = args.filter(a => /^\d{4}$/.test(a));
const YEARS = years.length ? years : ['2025', '2024'];
const SIGMA = sigmaArg ? +sigmaArg : M.CAL.sd;
const SEASONS = 20000;

const brier = ps => ps.reduce((s, [p, o]) => s + (p - o) * (p - o), 0) / ps.length;
const logloss = ps => -ps.reduce((s, [p, o]) => {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return s + (o ? Math.log(q) : Math.log(1 - q));
}, 0) / ps.length;

function run(year, gender, sigma) {
  const truth = JSON.parse(fs.readFileSync(path.join(DIR, year + '-truth.json'), 'utf8'));
  const csv = fs.readFileSync(path.join(DIR, year + '-seed.csv'), 'utf8');
  const parsed = M.parseCSV(csv);
  M.setDATA(parsed.rows.filter(r => r.g === gender));
  M.setLeagues(truth.leagues[gender]);
  M.setBerths(truth.berths[gender].auto, truth.berths[gender].atLarge);
  const model = M.buildModel(gender, 5000);
  const t = M.blankTally(model);
  const worlds = [{ adj: null, byIdx: t.byIdx }];
  const times = new Float64Array(model.runners.length);
  const tmp = new Float64Array(model.runners.length);
  const shock = new Float64Array(model.teams.length);
  for (let i = 0; i < SEASONS; i++) M.oneSeason(model, worlds, sigma / 100, times, shock, tmp);

  const order = truth.state[gender].map(x => x.team);
  const qualified = new Set(order);
  const all = new Set();
  for (const l in truth.leagues[gender]) truth.leagues[gender][l].forEach(x => all.add(x));
  const pred = {}, win = {};
  for (const x of t.list) { pred[x.name] = x.qual / SEASONS; win[x.name] = x.win / SEASONS; }
  const teams = [...all].map(name => ({
    year, gender, name, p: pred[name] || 0, win: win[name] || 0,
    actual: qualified.has(name) ? 1 : 0, place: order.indexOf(name) + 1 || null,
    modelled: pred[name] !== undefined,
  })).sort((a, b) => b.p - a.p);
  return { teams, order, model, truth, bad: parsed.bad };
}

function calib(teams, label) {
  const bins = [[0, .1], [.1, .3], [.3, .5], [.5, .7], [.7, .9], [.9, 1.01]];
  console.log('\n  ' + label);
  console.log('    band        n   model said   happened');
  for (const [lo, hi] of bins) {
    const g = teams.filter(t => t.p >= lo && t.p < hi);
    if (!g.length) continue;
    const mp = g.reduce((s, t) => s + t.p, 0) / g.length;
    const ma = g.reduce((s, t) => s + t.actual, 0) / g.length;
    console.log('    ' + (100 * lo).toFixed(0).padStart(3) + '-' + (Math.min(100 * hi, 100)).toFixed(0).padStart(3) + '%'
      + String(g.length).padStart(5) + (100 * mp).toFixed(0).padStart(11) + '%' + (100 * ma).toFixed(0).padStart(10) + '%');
  }
}

console.log('BACKTEST — predicting November from a mid-September database');
console.log('seasons simulated: ' + SEASONS.toLocaleString() + '   sigma: ' + SIGMA + '%\n');

const pooled = [];
for (const year of YEARS) {
  for (const gender of ['M', 'F']) {
    const { teams, order, model, truth } = run(year, gender, SIGMA);
    pooled.push(...teams);
    const dropped = model.teams.filter(t => t.short).map(t => t.name);
    const hits = teams.filter(t => t.modelled).slice(0, order.length).filter(t => t.actual).length;
    const bs = brier(teams.map(t => [t.p, t.actual]));
    const base = teams.reduce((s, t) => s + t.actual, 0) / teams.length;
    const bref = brier(teams.map(t => [base, t.actual]));
    const fav = teams[0];
    console.log('─'.repeat(64));
    console.log(year + '  ' + (gender === 'M' ? 'BOYS ' : 'GIRLS') + '   cutoff ' + truth.cutoff
      + '   field ' + order.length + ' (' + truth.berths[gender].auto * truth.berths[gender].leagues
      + ' auto + ' + truth.berths[gender].atLarge + ' at-large)');
    console.log('  teams modelled ' + model.teams.filter(t => !t.short).length + '/' + teams.length
      + (dropped.length ? '   under five runners: ' + dropped.join(', ') : ''));
    console.log('  Brier ' + bs.toFixed(4) + '  (base rate ' + bref.toFixed(4) + ')   skill '
      + (100 * (1 - bs / bref)).toFixed(0) + '%');
    console.log('  top ' + order.length + ' by odds held ' + hits + '/' + order.length + ' actual qualifiers');
    console.log('  favourite ' + fav.name + ' ' + (100 * fav.win).toFixed(0) + '% to win   →   champion ' + order[0]);
    const surprises = teams.filter(t => (t.p >= 0.5) !== !!t.actual)
      .map(t => t.name + ' ' + (100 * t.p).toFixed(0) + '%' + (t.actual ? ' QUALIFIED' : ' missed'));
    if (surprises.length) console.log('  wrong side of 50%: ' + surprises.join(' · '));
  }
}

console.log('\n' + '═'.repeat(64));
console.log('POOLED   ' + pooled.length + ' team-seasons, ' + pooled.filter(t => t.actual).length + ' qualified');
const bs = brier(pooled.map(t => [t.p, t.actual]));
const base = pooled.reduce((s, t) => s + t.actual, 0) / pooled.length;
const bref = brier(pooled.map(t => [base, t.actual]));
console.log('Brier ' + bs.toFixed(4) + '   base rate ' + bref.toFixed(4) + '   skill '
  + (100 * (1 - bs / bref)).toFixed(0) + '%   logloss ' + logloss(pooled.map(t => [t.p, t.actual])).toFixed(4));
calib(pooled, 'calibration, all seasons and both genders');
calib(pooled.filter(t => t.gender === 'M'), 'boys only');
calib(pooled.filter(t => t.gender === 'F'), 'girls only');
