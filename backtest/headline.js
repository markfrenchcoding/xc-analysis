// The figures quoted on the How tab, computed with repeats so they can be
// published without wobbling.
//
// Every number here comes out of a Monte Carlo, so a single run is an estimate,
// not a fact. This runs the whole backtest REPS times and reports the spread of
// each headline statistic. Quote a number only at a precision the spread
// supports — if "qualifiers found" ranges 58 to 60 out of 72, publish "8 in 10",
// not "82%".
//
//   node backtest/headline.js [seasonsPerRun] [reps]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 20000);
const REPS = +(process.argv[3] || 5);
const YEARS = L.years();
const SIGMA = L.M.CAL.sd;

function oneRep() {
  let found = 0, field = 0, champs = 0, races = 0;
  const all = [];
  for (const y of YEARS) for (const g of ['M', 'F']) {
    const { teams, order } = L.odds(y, g, L.cutoffs(y)[0], SIGMA, SEASONS);
    const modelled = teams.filter(t => t.modelled);
    found += modelled.slice(0, order.length).filter(t => t.actual).length;
    field += order.length;
    const fav = teams.reduce((a, b) => (b.win > a.win ? b : a));
    if (fav.name === order[0]) champs++;
    races++;
    all.push(...teams);
  }
  const band = (lo, hi) => {
    const g = all.filter(t => t.p >= lo && t.p < hi);
    return g.length ? g.reduce((s, t) => s + t.actual, 0) / g.length : null;
  };
  return {
    found, field, champs, races,
    hi: band(0.9, 1.01), lo: band(0, 0.1),
    hiN: all.filter(t => t.p >= 0.9).length,
    loN: all.filter(t => t.p < 0.1).length,
    brier: L.brier(all.map(t => [t.p, t.actual])),
  };
}

console.log('headline figures — ' + YEARS.join(', ') + ' at the September cutoff');
console.log(REPS + ' independent runs of ' + SEASONS.toLocaleString() + ' seasons each\n');

const reps = [];
for (let i = 0; i < REPS; i++) {
  const r = oneRep();
  reps.push(r);
  console.log('  run ' + (i + 1) + ':  qualifiers ' + r.found + '/' + r.field
    + '  champions ' + r.champs + '/' + r.races
    + '  above-90 ' + (100 * r.hi).toFixed(1) + '%'
    + '  below-10 ' + (100 * r.lo).toFixed(1) + '%'
    + '  Brier ' + r.brier.toFixed(4));
}

const rng = f => { const v = reps.map(f).sort((a, b) => a - b); return [v[0], v[v.length - 1]]; };
const mean = f => reps.reduce((s, r) => s + f(r), 0) / reps.length;

console.log('\n  statistic                      mean        range across runs');
const line = (name, m, r, fmt) => console.log('  ' + name.padEnd(30) + fmt(m).padStart(8) + '    ' + fmt(r[0]) + ' to ' + fmt(r[1]));
const pc = x => (100 * x).toFixed(1) + '%';
line('qualifiers found (of 72)', mean(r => r.found), rng(r => r.found), x => x.toFixed(1));
line('  as a share', mean(r => r.found / r.field), rng(r => r.found / r.field), pc);
line('champions named (of 4)', mean(r => r.champs), rng(r => r.champs), x => x.toFixed(1));
line('above-90% band qualified', mean(r => r.hi), rng(r => r.hi), pc);
line('below-10% band qualified', mean(r => r.lo), rng(r => r.lo), pc);
line('pooled Brier', mean(r => r.brier), rng(r => r.brier), x => x.toFixed(4));
console.log('\n  band sizes: above-90 n=' + reps[0].hiN + ', below-10 n=' + reps[0].loN
  + ' (of ' + (reps[0].field / reps[0].races * 0 + 197) + ' team-seasons)');
console.log('\nPublish at a precision the range supports, and prefer a plain-English');
console.log('fraction to a decimal that will not reproduce.');
