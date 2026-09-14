// Does penalising a single-race athlete help the TEAM board, or only the
// individual one?
//
// backtest/runners.js shows a one-race athlete is flattered by about 2.8 places
// relative to a two-race athlete, and that a ~0.6% penalty closes that gap. But
// the penalty moves every single-mark runner, so it moves team scores too. This
// scores the same penalties against team qualification, with a paired cluster
// bootstrap, so the cost on the team board is known before anything ships.
//
//   node backtest/lone_mark.js [seasons] [draws]
const L = require('./lib.js');
const M = L.M;

const SEASONS = +(process.argv[2] || 8000);
const DRAWS = +(process.argv[3] || 2000);
const YEARS = L.years();
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];
const PENALTIES = [0, 0.002, 0.004, 0.006, 0.008, 0.010];

// same as lib.odds, with a penalty applied to athletes carrying one mark
function odds(year, gender, cutoff, sigma, seasons, penalty) {
  const truth = L.truthFor(year);
  const fs = require('fs'), path = require('path');
  const csv = fs.readFileSync(path.join(L.DIR, year + '-seed-' + cutoff + '.csv'), 'utf8');
  M.setDATA(M.parseCSV(csv).rows.filter(r => r.g === gender));
  M.setLeagues(truth.leagues[gender]);
  M.setBerths(truth.berths[gender].auto, truth.berths[gender].atLarge);
  const model = M.buildModel(gender, 5000);
  if (penalty) for (const r of model.runners)
    if (r.marks.length === 1) { r.marks = r.marks.map(v => v * (1 + penalty)); r.sb = r.marks[0]; }
  const t = M.blankTally(model);
  const worlds = [{ adj: null, byIdx: t.byIdx }];
  const times = new Float64Array(model.runners.length);
  const tmp = new Float64Array(model.runners.length);
  const shock = new Float64Array(model.teams.length);
  for (let i = 0; i < seasons; i++) M.oneSeason(model, worlds, sigma / 100, times, shock, tmp);
  const qualified = new Set(truth.state[gender].map(x => x.team));
  const all = new Set();
  for (const l in truth.leagues[gender]) truth.leagues[gender][l].forEach(x => all.add(x));
  const pred = {}; for (const x of t.list) pred[x.name] = x.qual / seasons;
  return [...all].map(n => ({ cluster: year + '|' + gender + '|' + n.slice(0, 1),
    p: pred[n] || 0, o: qualified.has(n) ? 1 : 0 }));
}

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
console.log('penalty on single-race athletes, scored against TEAM qualification');
console.log(YEARS.join(', ') + ', all cutoffs, ' + SEASONS.toLocaleString() + ' seasons per point\n');
console.log('  penalty   pooled Brier   by cutoff');

const preds = [];
for (const p of PENALTIES) {
  const flat = [], perCut = [];
  for (let ci = 0; ci < nCuts; ci++) {
    const cut = [];
    for (const y of YEARS) for (const g of ['M', 'F'])
      for (const r of odds(y, g, L.cutoffs(y)[ci], SIGMA_BY_CUT[ci], SEASONS, p))
        cut.push({ cluster: r.cluster + '|' + ci, p: r.p, o: r.o });
    perCut.push(L.brier(cut.map(r => [r.p, r.o])));
    flat.push(...cut);
  }
  preds.push(flat);
  console.log('  ' + (100 * p).toFixed(1).padStart(5) + '%'
    + L.brier(flat.map(r => [r.p, r.o])).toFixed(4).padStart(15)
    + '   ' + perCut.map(b => b.toFixed(4)).join(' '));
}

// paired bootstrap against no penalty
const byCluster = {};
preds[0].forEach((r, i) => (byCluster[r.cluster] = byCluster[r.cluster] || []).push(i));
const clusters = Object.keys(byCluster);
console.log('\npaired bootstrap vs no penalty (' + DRAWS.toLocaleString() + ' draws)');
console.log('  penalty   median gap   beats no-penalty');
const gaps = PENALTIES.map(() => []);
for (let d = 0; d < DRAWS; d++) {
  const idx = [];
  for (let i = 0; i < clusters.length; i++) idx.push(...byCluster[clusters[Math.floor(Math.random() * clusters.length)]]);
  const bs = preds.map(pr => { let s = 0; for (const i of idx) s += (pr[i].p - pr[i].o) ** 2; return s / idx.length; });
  bs.forEach((b, i) => gaps[i].push(b - bs[0]));
}
PENALTIES.forEach((p, i) => {
  if (i === 0) return;
  const g = gaps[i].slice().sort((a, b) => a - b);
  const med = g[Math.floor(0.5 * (g.length - 1))];
  console.log('  ' + (100 * p).toFixed(1).padStart(5) + '%'
    + ((med >= 0 ? '+' : '') + med.toFixed(4)).padStart(13)
    + (100 * g.filter(v => v < 0).length / g.length).toFixed(0).padStart(14) + '%');
});
console.log('\nA penalty that fixes the individual board but costs the team board is not');
console.log('free. Near 50% means it costs nothing either way.');
