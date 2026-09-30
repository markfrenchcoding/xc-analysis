// How accurate would a "Lane-equivalent" time be?
//
// For every athlete who ran state, take their race-rated marks from before a
// cutoff, weight them the way the board does, and convert to Lane with a
// factor learned from the OTHER seasons' state meets (leave one season out).
// Then compare with the clock time they actually ran at Lane. Unlike
// athlete_level.js this is not centred per race: it has to get the absolute
// time right, so it also carries how much Lane itself varied that year.
//
//   node backtest/lane_equiv.js [--raw] [--write]
'use strict';
const fs = require('fs');
const path = require('path');
const { fitRaces } = require('./race_ratings.js');

const RAW = path.join(__dirname, 'raw');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'));
const YEARS = Object.keys(CFG).filter(k => /^\d{4}$/.test(k)).sort();
const MARK_W = [[1], [0.67, 0.33], [0.50, 0.30, 0.20]];
// --raw: the same conversion from a plain season best, no race ratings - the baseline
const RAWBEST = process.argv.includes('--raw');
const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const median = a => { const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const weighted = xs => { const s = xs.slice().sort((a, b) => a - b).slice(0, 3); const w = MARK_W[s.length - 1];
  return s.reduce((t, x, i) => t + w[i] * x, 0); };

// per season, per horizon: [{actual, rated}] for every state finisher with marks
const pairs = {};
for (const y of YEARS) {
  const cfg = CFG[y];
  const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'y' + y + '_meta.json'), 'utf8')).meets;
  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', y + '-truth.json'), 'utf8'));
  const dateOf = mid => (meta[mid] || {}).date || '';
  const rows = fs.readFileSync(path.join(RAW, 'y' + y + '_raw.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(split).map(c => ({ aid: c[0], g: c[6], dist: +c[7], s: +c[8], mid: c[9], div: c[11] }))
    .filter(r => r.dist === 5000 && r.s > 0 && dateOf(r.mid) >= y + '-08-15' && !(cfg.exclude || []).includes(r.mid));
  let state = rows.filter(r => r.mid === cfg.state);
  if (state.some(r => /6A/.test(r.div))) state = state.filter(r => /6A/.test(r.div));
  for (const wk of [4, 2, 1]) {
    const cut = addDays(truth.stateDate, -7 * wk);
    const marks = rows.filter(r => dateOf(r.mid) <= cut && r.mid !== cfg.state);
    const fit = fitRaces(marks.map(r => ({ aid: r.aid, g: r.g, mid: r.mid, secs: r.s, date: dateOf(r.mid) })),
      { tauPct: -1, seasonStart: y + '-08-15' });
    const by = new Map();
    for (const r of marks) { const k = r.aid + '|' + r.g;
      (by.get(k) || by.set(k, []).get(k)).push(RAWBEST ? r.s : r.s / fit.factorFor(r.mid + '|' + r.g)); }
    const P = (pairs[wk] = pairs[wk] || {})[y] = [];
    for (const r of state) { const m = by.get(r.aid + '|' + r.g);
      if (m) P.push({ actual: r.s, rated: RAWBEST ? Math.min(...m) : weighted(m), g: r.g }); }
  }
}

console.log('Lane-equivalent times: rated marks converted to Lane with a factor from the other seasons\n');
for (const wk of [4, 2, 1]) {
  const errs = [], yearShift = [];
  for (const y of YEARS) {
    // Lane's factor from the other three seasons: median of actual / rated
    const others = YEARS.filter(v => v !== y).flatMap(v => pairs[wk][v]);
    const L = median(others.map(p => p.actual / p.rated));
    const own = pairs[wk][y];
    const e = own.map(p => Math.log(p.actual / (p.rated * L)));
    yearShift.push(y + ' ' + (100 * median(e)).toFixed(1) + '%');
    errs.push(...e);
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const q = f => abs[Math.floor(f * (abs.length - 1))];
  const sec = (pct, t) => Math.round(pct * t);
  console.log('  ' + wk + ' week' + (wk > 1 ? 's' : '') + ' out (' + errs.length + ' state finishers)');
  console.log('    typical miss ' + (100 * q(0.5)).toFixed(1) + '%  = ' + sec(q(0.5), 1020) + 's on a 17:00, '
    + sec(q(0.5), 1200) + 's on a 20:00');
  console.log('    two in three within ' + (100 * q(0.667)).toFixed(1) + '% (' + sec(q(0.667), 1020) + 's / '
    + sec(q(0.667), 1200) + 's); nine in ten within ' + (100 * q(0.9)).toFixed(1) + '% ('
    + sec(q(0.9), 1020) + 's / ' + sec(q(0.9), 1200) + 's)');
  console.log('    how far Lane itself ran from its usual: ' + yearShift.join(', '));
}

/* --write puts the conversion into the page, generated rather than typed: the
   factor pooled over every season (a rated mark times this is a typical day at
   Lane), and how far off it ran when each season was held out, one week out -
   the information the race table has, which is every race so far. The page
   puts live ratings on the same 6A basis before applying it; see RACES. */
if (process.argv.includes('--write')) {
  const wk = 1;
  const all = YEARS.flatMap(y => pairs[wk][y]);
  const factor = median(all.map(p => p.actual / p.rated));
  const errs = [];
  for (const y of YEARS) {
    const L = median(YEARS.filter(v => v !== y).flatMap(v => pairs[wk][v]).map(p => p.actual / p.rated));
    for (const p of pairs[wk][y]) errs.push(Math.abs(Math.log(p.actual / (p.rated * L))));
  }
  errs.sort((a, b) => a - b);
  const q = f => +(100 * errs[Math.floor(f * (errs.length - 1))]).toFixed(1);
  const LANE = { factor: +factor.toFixed(4), miss: q(0.5), twoThirds: q(0.667), nineTenths: q(0.9),
                 n: errs.length, seasons: YEARS.map(Number) };
  const IDX = path.join(__dirname, '..', 'index.html');
  let t = fs.readFileSync(IDX, 'utf8');
  const line = 'const LANE=' + JSON.stringify(LANE) + ';';
  if (/const LANE=\{[^\n]*\};/.test(t)) t = t.replace(/const LANE=\{[^\n]*\};/, () => line);
  else t = t.replace(/(const DATA_DATE="[\d-]+";)/, m => m + '\n' + line);
  fs.writeFileSync(IDX, t);
  console.log('\n  wrote ' + line);
}
