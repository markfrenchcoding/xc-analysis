// node backtest/exclusions.js [seasonsPerBoard]
//
// Which reasons for leaving a meet out of the marks database actually earn
// their place?
//
// HOW THIS AVOIDS FOOLING ITSELF
// Picking exclusions because they improve the score, and then quoting the
// improved score as evidence the model is good, measures the search rather than
// the model. Three things keep this honest:
//
//   1. Every rule states its reason first, in exclusion_rules.js, and the
//      reason has to stand without reference to any score. The rules are fixed
//      before any of them are run.
//   2. Every rule is reported, including the ones that make things worse. A
//      table with the losers deleted is not evidence.
//   3. One season is held out. Rules are judged on the development seasons and
//      then applied, once, to a season they were never allowed to influence.
//      Only the held-out number is quotable.
//
// A rule that helps on development and not on the holdout was noise. Say so.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const RULES = require('./exclusion_rules.js');

const N = +(process.argv[2] || 8000);
const SIGMA = L.M.CAL.sd;
const YEARS = L.years();

/* 2023 is the holdout. CLAUDE.md reserved it as the one season never fitted on,
   and this is exactly the kind of decision it was reserved for. */
const HOLDOUT = '2023';
const DEV = YEARS.filter(y => y !== HOLDOUT);

function build(year, rule) {
  execFileSync(process.execPath,
    [path.join(__dirname, 'build_season.js'), year, '--xrule=' + rule],
    { stdio: 'pipe', env: process.env });
}

function score(years, rule) {
  const rows = [];
  let found = 0, of = 0;
  for (const y of years) {
    const cut = L.cutoffs(y)[0];                       // the September cutoff
    const tag = rule === 'none' ? cut : cut + '-x' + rule;
    for (const g of ['M', 'F']) {
      const { teams, order } = L.odds(y, g, tag, SIGMA, N);
      rows.push(...teams);
      found += teams.filter(t => t.modelled).slice(0, order.length).filter(t => t.actual).length;
      of += order.length;
    }
  }
  const b = L.brier(rows.map(t => [t.p, t.actual]));
  const base = rows.reduce((s, t) => s + t.actual, 0) / rows.length;
  const bref = L.brier(rows.map(t => [base, t.actual]));
  return { brier: b, skill: Math.round(100 * (1 - b / bref)), found, of };
}

const names = Object.keys(RULES).filter(r => r !== 'combined');
console.log('September cutoff, sigma ' + SIGMA + '%, ' + N.toLocaleString() + ' seasons per board');
console.log('development seasons ' + DEV.join(', ') + ' — holdout ' + HOLDOUT + '\n');

console.log('  rule          development          holdout ' + HOLDOUT + '        reason');
console.log('                Brier    skill       Brier    skill');
const devOf = {};
for (const r of names) {
  if (r !== 'none') for (const y of YEARS) build(y, r);
  const d = score(DEV, r), h = score([HOLDOUT], r);
  devOf[r] = d.brier;
  const mark = r === 'none' ? '  ' : (d.brier < devOf.none ? ' +' : ' -');
  console.log('  ' + r.padEnd(12) + mark + ' ' + d.brier.toFixed(4) + '   ' + (d.skill + '%').padStart(4)
    + '        ' + h.brier.toFixed(4) + '   ' + (h.skill + '%').padStart(4)
    + '     ' + RULES[r].reason);
}

/* Anything that helped on development, applied together and then tried once on
   the season none of it was chosen on. */
const helped = names.filter(r => r !== 'none' && devOf[r] < devOf.none);
console.log('\n  helped on development: ' + (helped.join(', ') || 'nothing'));
if (helped.length) {
  // the child processes read the set from here
  process.env.COMBINED_RULES = helped.join(',');
  for (const y of YEARS) build(y, 'combined');
  const d = score(DEV, 'combined'), h = score([HOLDOUT], 'combined');
  console.log('  combined      ' + (d.brier < devOf.none ? '+' : '-') + ' ' + d.brier.toFixed(4)
    + '   ' + (d.skill + '%').padStart(4) + '        ' + h.brier.toFixed(4) + '   ' + (h.skill + '%').padStart(4));
  console.log('\n  baseline on the holdout was ' + score([HOLDOUT], 'none').brier.toFixed(4)
    + '. The combined rule is only worth adopting if it beats that,');
  console.log('  and the holdout number is the only one worth quoting.');
}
