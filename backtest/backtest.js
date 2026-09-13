// Backtest: build the database as it stood on a cutoff date, simulate the
// season, compare against what actually happened at Lane in November.
//
// Each season is its own contest. The leagues, their membership and the size of
// the state field all move year to year — 2024 and 2025 both ran 18 teams
// (14 automatic + 4 at-large) where 2026 runs 16 — so the harness reads those
// from the season's own results rather than assuming today's rules.
//
//   node backtest/backtest.js                 every season, September cutoff
//   node backtest/backtest.js 2025            one season
//   node backtest/backtest.js 5.0             with the variance dial at 5.0%
//   node backtest/backtest.js --cut 3         the fourth cutoff (late October)
const L = require('./lib.js');

const argv = process.argv.slice(2);
const ci = argv.includes('--cut') ? +argv[argv.indexOf('--cut') + 1] : 0;
const years = argv.filter(a => /^\d{4}$/.test(a));
const YEARS = years.length ? years : L.years();
const sigArg = argv.find(a => /^\d+\.\d+$/.test(a));
const SIGMA = sigArg ? +sigArg : L.M.CAL.sd;
const SEASONS = 20000;

console.log('BACKTEST — predicting November from an in-season database');
console.log('seasons simulated: ' + SEASONS.toLocaleString() + '   sigma: ' + SIGMA + '%\n');

const pooled = [];
for (const year of YEARS) {
  const cutoff = L.cutoffs(year)[ci];
  for (const gender of ['M', 'F']) {
    const { teams, order, model, truth } = L.odds(year, gender, cutoff, SIGMA, SEASONS);
    pooled.push(...teams);
    const dropped = model.teams.filter(t => t.short).map(t => t.name);
    const hits = teams.filter(t => t.modelled).slice(0, order.length).filter(t => t.actual).length;
    const bs = L.brier(teams.map(t => [t.p, t.actual]));
    const base = teams.reduce((s, t) => s + t.actual, 0) / teams.length;
    const bref = L.brier(teams.map(t => [base, t.actual]));
    const b = truth.berths[gender];
    console.log('─'.repeat(66));
    console.log(year + '  ' + (gender === 'M' ? 'BOYS ' : 'GIRLS') + '   cutoff ' + cutoff
      + '   field ' + order.length + ' (' + b.auto * b.leagues + ' auto + ' + b.atLarge + ' at-large)');
    console.log('  teams modelled ' + model.teams.filter(t => !t.short).length + '/' + teams.length
      + (dropped.length ? '   under five runners: ' + dropped.join(', ') : ''));
    console.log('  Brier ' + bs.toFixed(4) + '  (base rate ' + bref.toFixed(4) + ')   skill '
      + (100 * (1 - bs / bref)).toFixed(0) + '%');
    console.log('  top ' + order.length + ' by odds held ' + hits + '/' + order.length + ' actual qualifiers');
    // the favourite is the team most likely to WIN, which is not the top of a
    // list sorted by P(qualify) - those ties break arbitrarily among teams at 100%
    const fav = teams.reduce((x, y) => (y.win > x.win ? y : x));
    console.log('  favourite ' + fav.name + ' ' + (100 * fav.win).toFixed(0)
      + '% to win   →   champion ' + order[0]
      + (fav.name === order[0] ? '   HIT' : '   miss'));
    const wrong = teams.filter(t => (t.p >= 0.5) !== !!t.actual)
      .map(t => t.name + ' ' + (100 * t.p).toFixed(0) + '%' + (t.actual ? ' QUALIFIED' : ' missed'));
    if (wrong.length) console.log('  wrong side of 50%: ' + wrong.join(' · '));
  }
}

console.log('\n' + '═'.repeat(66));
console.log('POOLED   ' + pooled.length + ' team-seasons, ' + pooled.filter(t => t.actual).length + ' qualified');
const bs = L.brier(pooled.map(t => [t.p, t.actual]));
const base = pooled.reduce((s, t) => s + t.actual, 0) / pooled.length;
const bref = L.brier(pooled.map(t => [base, t.actual]));
console.log('Brier ' + bs.toFixed(4) + '   base rate ' + bref.toFixed(4) + '   skill '
  + (100 * (1 - bs / bref)).toFixed(0) + '%   logloss '
  + L.logloss(pooled.map(t => [t.p, t.actual])).toFixed(4));
L.calib(pooled, 'calibration, all seasons and both genders');
L.calib(pooled.filter(t => t.gender === 'M'), 'boys only');
L.calib(pooled.filter(t => t.gender === 'F'), 'girls only');
