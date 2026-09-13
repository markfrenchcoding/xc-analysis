// Shared loading and simulation for the backtest scripts.
const fs = require('fs');
const path = require('path');
const M = require('../model.js');

const DIR = path.join(__dirname, 'data');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'));

const years = () => Object.keys(CFG).filter(k => /^\d{4}$/.test(k)).sort();
const cutoffs = year => CFG[year].cutoffs;
const truthFor = year => JSON.parse(fs.readFileSync(path.join(DIR, year + '-truth.json'), 'utf8'));

// Odds of qualifying for every team in a season-gender, from the database as it
// stood on `cutoff`, simulated at `sigma` percent.
// `weights`, if given, is a function of how many marks an athlete has returning
// the sampling weights to use instead of whatever buildModel derived. It exists
// so alternative MARK_W schemes can be scored without editing index.html.
function odds(year, gender, cutoff, sigma, seasons, weights) {
  const truth = truthFor(year);
  const csv = fs.readFileSync(path.join(DIR, year + '-seed-' + cutoff + '.csv'), 'utf8');
  M.setDATA(M.parseCSV(csv).rows.filter(r => r.g === gender));
  M.setLeagues(truth.leagues[gender]);
  M.setBerths(truth.berths[gender].auto, truth.berths[gender].atLarge);
  const model = M.buildModel(gender, 5000);
  if (weights) for (const r of model.runners) r.w = weights(r.marks.length);
  const t = M.blankTally(model);
  const worlds = [{ adj: null, byIdx: t.byIdx }];
  const times = new Float64Array(model.runners.length);
  const tmp = new Float64Array(model.runners.length);
  const shock = new Float64Array(model.teams.length);
  for (let i = 0; i < seasons; i++) M.oneSeason(model, worlds, sigma / 100, times, shock, tmp);

  const order = truth.state[gender].map(x => x.team);
  const qualified = new Set(order);
  const pred = {}, win = {};
  for (const x of t.list) { pred[x.name] = x.qual / seasons; win[x.name] = x.win / seasons; }
  const teams = [];
  for (const lg in truth.leagues[gender]) for (const name of truth.leagues[gender][lg]) {
    teams.push({ year, gender, league: lg, cluster: year + '|' + gender + '|' + lg, name,
                 p: pred[name] || 0, win: win[name] || 0,
                 actual: qualified.has(name) ? 1 : 0, place: order.indexOf(name) + 1 || null,
                 modelled: pred[name] !== undefined });
  }
  teams.sort((a, b) => b.p - a.p);
  return { teams, order, model, truth };
}

const brier = ps => ps.reduce((s, [p, o]) => s + (p - o) * (p - o), 0) / ps.length;
const logloss = ps => -ps.reduce((s, [p, o]) => {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return s + (o ? Math.log(q) : Math.log(1 - q));
}, 0) / ps.length;

function calib(teams, label, out = console.log) {
  const bins = [[0, .1], [.1, .3], [.3, .5], [.5, .7], [.7, .9], [.9, 1.01]];
  out('\n  ' + label);
  out('    band        n   model said   happened');
  for (const [lo, hi] of bins) {
    const g = teams.filter(t => t.p >= lo && t.p < hi);
    if (!g.length) continue;
    const mp = g.reduce((s, t) => s + t.p, 0) / g.length;
    const ma = g.reduce((s, t) => s + t.actual, 0) / g.length;
    out('    ' + (100 * lo).toFixed(0).padStart(3) + '-' + Math.min(100 * hi, 100).toFixed(0).padStart(3) + '%'
      + String(g.length).padStart(5) + (100 * mp).toFixed(0).padStart(11) + '%'
      + (100 * ma).toFixed(0).padStart(10) + '%');
  }
}

module.exports = { M, CFG, DIR, years, cutoffs, truthFor, odds, brier, logloss, calib };
