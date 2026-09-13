// Does the right variance dial shrink as the state meet gets closer?
//
// The shipped 2.3% is race-to-race spread. A September projection also has to
// cover eight weeks of fitness change, injury and roster churn, which is why the
// backtest prefers about 5%. If that is the reason, the best sigma should fall
// as the database gets closer to November - and the gap between the two is the
// drift term the model is missing.
//
//   node backtest/horizon.js [seasonsPerPoint]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 6000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0];
const YEARS = L.years();
const STATE_DAY = { '2024': '2024-11-09', '2025': '2025-11-08' };

const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// cutoffs line up across seasons by index: first is mid-September, and so on
const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
console.log('horizon test — ' + YEARS.join(', ') + ', ' + SEASONS.toLocaleString() + ' seasons per point\n');
console.log(' cutoff (weeks to state)     best sigma   Brier at best   Brier at 2.3%   teams');

const rowsOut = [];
for (let ci = 0; ci < nCuts; ci++) {
  const perSigma = SIGMAS.map(() => []);
  let weeks = 0;
  for (const y of YEARS) {
    const cut = L.cutoffs(y)[ci];
    weeks += days(cut, STATE_DAY[y]) / 7 / YEARS.length;
    for (const g of ['M', 'F']) {
      SIGMAS.forEach((s, si) => {
        const { teams } = L.odds(y, g, cut, s, SEASONS);
        perSigma[si].push(...teams.map(t => [t.p, t.actual]));
      });
    }
  }
  const briers = perSigma.map(L.brier);
  let bi = 0; briers.forEach((b, i) => { if (b < briers[bi]) bi = i; });
  const base = SIGMAS.indexOf(2.3);
  const label = YEARS.map(y => L.cutoffs(y)[ci].slice(5)).join(' / ');
  console.log('  ' + label.padEnd(14) + ('(' + weeks.toFixed(1) + 'w)').padStart(8)
    + SIGMAS[bi].toFixed(1).padStart(14) + '%'
    + briers[bi].toFixed(4).padStart(15) + briers[base].toFixed(4).padStart(16)
    + String(perSigma[0].length).padStart(8));
  rowsOut.push({ weeks, best: SIGMAS[bi], briers, label });
}

// If total variance is race-day and drift added in quadrature, the drift term is
// whatever is left once the 2.3% race-day component is taken out.
console.log('\nimplied drift term, if total^2 = raceDay^2 + drift^2 with raceDay = 2.3%');
console.log('  weeks to state    best sigma    implied drift');
for (const r of rowsOut) {
  const d = Math.sqrt(Math.max(0, r.best * r.best - 2.3 * 2.3));
  console.log('  ' + r.weeks.toFixed(1).padStart(8) + 'w' + (r.best.toFixed(1) + '%').padStart(16)
    + (d.toFixed(1) + '%').padStart(17));
}
const first = rowsOut[0], last = rowsOut[rowsOut.length - 1];
console.log('\n' + (last.best < first.best
  ? 'Best sigma FALLS as the state meet approaches: ' + first.best + '% at ' + first.weeks.toFixed(1)
    + ' weeks out, ' + last.best + '% at ' + last.weeks.toFixed(1) + ' weeks out.\n'
    + 'That is the signature of a horizon term - the dial should depend on how far\n'
    + 'out the projection is rather than being one number.'
  : 'Best sigma does NOT fall toward the state meet (' + first.best + '% -> ' + last.best + '%).\n'
    + 'The gap is not explained by horizon; look elsewhere before adding a drift term.'));
