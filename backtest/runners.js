// Are individual predictions biased by how often an athlete has raced?
//
// The Runners board rates a one-race athlete at that time and a two-race athlete
// on both, so the two are not treated alike. Which one is flattered is not
// obvious from the arithmetic: a season best is a minimum, and a minimum of two
// draws is faster than a minimum of one, so ranking on best flatters the athlete
// who raced more — while the model's weights pull the other way.
//
// Only the actual results settle it. This predicts every athlete's finishing
// place at Lane from a mid-September database, compares against what they really
// did, and splits the residual by how many races they had at the cutoff. A group
// finishing WORSE than predicted was being flattered.
//
// Then it sweeps a penalty applied to single-race athletes and reports which
// value removes the split and which minimises the error — not necessarily the
// same number.
//
//   node backtest/runners.js [seasons] [cutoffIndex]
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const M = L.M;

const SEASONS = +(process.argv[2] || 6000);
const CI = +(process.argv[3] || 0);
const YEARS = L.years();
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];
const RAW = process.argv[4] || 'C:/Users/markf/AppData/Local/Temp/claude/'
  + 'C--Users-markf-AppData-Roaming-Claude-scratch-workspaces-edd86ec1-c286-4e8d-9b2e-04c2d64053e8-'
  + '482c3e88-ecde-4057-a831-4da3a0351471-scratch-2026-09-13-ce2c9a/'
  + 'd9d632e3-6905-40f3-83de-59067cda8a99/scratchpad/raw';
// 6A individual qualifiers. OSAA publishes 14 for 2026; the backtest seasons are
// assumed the same, which only shifts every place by a shared handful.
const IND6A = 14;

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const key = (name, team) => (name + '|' + team).toLowerCase().replace(/[^a-z0-9|]/g, '');

const STATE = { '2025': '258447', '2024': '237896' };

// what actually happened: individual places in the 6A race
function actualPlaces(year, gender) {
  const rows = fs.readFileSync(path.join(RAW, 'y' + year + '_raw.csv'), 'utf8')
    .trim().split(/\r?\n/).slice(1).map(split)
    .filter(c => c[9] === STATE[year] && c[6] === gender && /6A/.test(c[11]) && +c[8] > 0)
    .map(c => ({ k: key(c[1] + ' ' + c[2], c[5]), s: +c[8] }));
  rows.sort((a, b) => a.s - b.s);
  const m = new Map();
  rows.forEach((r, i) => { if (!m.has(r.k)) m.set(r.k, i + 1); });
  return m;
}

// predicted mean finishing place, with an optional penalty on single-race athletes
function predict(year, gender, penalty) {
  const truth = L.truthFor(year);
  const cutoff = L.cutoffs(year)[CI];
  const csv = fs.readFileSync(path.join(L.DIR, year + '-seed-' + cutoff + '.csv'), 'utf8');
  M.setDATA(M.parseCSV(csv).rows.filter(r => r.g === gender));
  M.setLeagues(truth.leagues[gender]);
  M.setBerths(truth.berths[gender].auto, truth.berths[gender].atLarge);
  M.setInd(IND6A);
  const model = M.buildModel(gender, 5000);
  if (penalty) for (const r of model.runners)
    if (r.marks.length === 1) r.marks = r.marks.map(v => v * (1 + penalty));
  const t = M.blankTally(model), rt = M.runnerTally(model);
  const worlds = [{ adj: null, byIdx: t.byIdx, rt }];
  const times = new Float64Array(model.runners.length);
  const tmp = new Float64Array(model.runners.length);
  const shock = new Float64Array(model.teams.length);
  for (let i = 0; i < SEASONS; i++) M.oneSeason(model, worlds, SIGMA_BY_CUT[CI] / 100, times, shock, tmp);
  return rt.filter(r => r && r.n).map(r => ({
    k: key(r.name, r.team), marks: r.marks, mean: r.placeSum / r.n, rate: r.n / SEASONS,
  }));
}

function residuals(penalty) {
  const out = [];
  for (const y of YEARS) for (const g of ['M', 'F']) {
    const actual = actualPlaces(y, g);
    for (const p of predict(y, g, penalty)) {
      const a = actual.get(p.k);
      if (a === undefined) continue;             // did not run at state
      out.push({ marks: p.marks, resid: a - p.mean, actual: a, pred: p.mean });
    }
  }
  return out;
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const mae = r => mean(r.map(x => Math.abs(x.resid)));
function split1v2(r) {
  const one = r.filter(x => x.marks === 1).map(x => x.resid);
  const two = r.filter(x => x.marks > 1).map(x => x.resid);
  return { one: mean(one), two: mean(two), n1: one.length, n2: two.length, gap: mean(one) - mean(two) };
}

console.log('individual predictions vs what happened at Lane');
console.log(YEARS.join(', ') + ' 6A, cutoff index ' + CI + ', ' + SEASONS.toLocaleString() + ' seasons\n');
console.log('residual = actual place minus predicted place. Positive means the');
console.log('athlete finished worse than predicted, i.e. the model flattered them.\n');

const base = residuals(0);
const b = split1v2(base);
console.log('  athletes matched to a real state result: ' + base.length);
console.log('  one race at the cutoff : n=' + b.n1 + '  mean residual ' + b.one.toFixed(2));
console.log('  two or more            : n=' + b.n2 + '  mean residual ' + b.two.toFixed(2));
console.log('  gap (one minus two)    : ' + b.gap.toFixed(2) + ' places');
console.log('  mean absolute error    : ' + mae(base).toFixed(2) + ' places');

console.log('\npenalty applied to single-race athletes');
console.log('  penalty   gap     MAE     one     two');
const rows = [];
for (const p of [0, 0.002, 0.004, 0.006, 0.008, 0.010, 0.015]) {
  const r = residuals(p), s = split1v2(r);
  rows.push({ p, gap: s.gap, mae: mae(r), one: s.one, two: s.two });
  console.log('  ' + (100 * p).toFixed(1).padStart(5) + '%'
    + s.gap.toFixed(2).padStart(8) + mae(r).toFixed(2).padStart(8)
    + s.one.toFixed(2).padStart(8) + s.two.toFixed(2).padStart(8));
}
const fair = rows.reduce((a, x) => Math.abs(x.gap) < Math.abs(a.gap) ? x : a);
const best = rows.reduce((a, x) => x.mae < a.mae ? x : a);
console.log('\n  smallest gap  : ' + (100 * fair.p).toFixed(1) + '%  (gap ' + fair.gap.toFixed(2) + ')');
console.log('  smallest error: ' + (100 * best.p).toFixed(1) + '%  (MAE ' + best.mae.toFixed(2) + ')');
console.log('\nIf the gap at 0% is small, race count is not biasing the board and no');
console.log('correction is warranted regardless of what MAE prefers.');
