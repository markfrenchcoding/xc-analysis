// node backtest/common_value.js [seasonsPerBoard]
//
// Is the model actually worse on the older seasons, or does it just know less
// about them?
//
// athletic.net held 14 meets by the September cutoff in 2022 and 33 by the same
// point in 2025. That alone could explain why the model scores worse on the
// early seasons, and pooling the four into one headline figure would then be
// averaging two different regimes - the mistake CLAUDE.md already records from
// the MARK_W episode.
//
// This holds the meet set constant instead. Each season is re-run using only
// meets that recur in all four (common_meets.js, then build_season.js --common).
// If the spread between seasons survives on a fixed set of meets, the seasons
// really do differ. If it collapses, the spread was coverage.
//
// Only the October cutoffs can be done this way: twenty meets recur across all
// four seasons and almost none are early, so the September board cannot field
// its eighteen teams. That is a fact about the sport's schedule, not a bug.
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const N = +(process.argv[2] || 8000);
const SIGMA = L.M.CAL.sd;
const YEARS = L.years();

function run(year, cutoff) {
  const out = { found: 0, field: 0, rows: [] };
  for (const g of ['M', 'F']) {
    const { teams, order } = L.odds(year, g, cutoff, SIGMA, N);
    out.found += teams.filter(t => t.modelled).slice(0, order.length).filter(t => t.actual).length;
    out.field += order.length;
    out.rows.push(...teams);
  }
  const b = L.brier(out.rows.map(t => [t.p, t.actual]));
  const base = out.rows.reduce((s, t) => s + t.actual, 0) / out.rows.length;
  const bref = L.brier(out.rows.map(t => [base, t.actual]));
  return { found: out.found, field: out.field, brier: b, skill: Math.round(100 * (1 - b / bref)) };
}

console.log('sigma ' + SIGMA + '%, ' + N.toLocaleString() + ' seasons per board\n');

for (const ci of [2, 3]) {                       // mid-October and late October
  const label = ci === 2 ? 'mid-October' : 'late October';
  console.log('=== ' + label + ' cutoff');
  console.log('          every meet                 meets common to all four');
  console.log('  year    found   Brier  skill       found   Brier  skill');
  const all = [], com = [];
  for (const y of YEARS) {
    const cut = L.cutoffs(y)[ci];
    const hasCommon = fs.existsSync(path.join(L.DIR, y + '-seed-' + cut + '-common.csv'));
    const a = run(y, cut);
    const c = hasCommon ? run(y, cut + '-common') : null;
    all.push(a.skill); if (c) com.push(c.skill);
    console.log('  ' + y + '   ' + (a.found + '/' + a.field).padStart(6) + '  '
      + a.brier.toFixed(4) + '   ' + (a.skill + '%').padStart(4) + '       '
      + (c ? (c.found + '/' + c.field).padStart(6) + '  ' + c.brier.toFixed(4)
        + '   ' + (c.skill + '%').padStart(4) : '   (not built)'));
  }
  const spread = a => Math.max(...a) - Math.min(...a);
  console.log('  spread across seasons: ' + spread(all) + ' points unrestricted, '
    + (com.length ? spread(com) + ' points on a fixed meet set' : '-'));
  console.log('');
}
