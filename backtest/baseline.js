// How much does the simulation buy over simply seeding on season bests?
//
// athletic.net's "hypothetical meet" lines every athlete up at their season best
// and scores one race — no randomness, no probabilities. That is this model with
// the variance dial at zero and all the weight on each athlete's best mark, so
// the comparison can be made exactly, on the same data and the same
// qualification rules, isolating what the Monte Carlo actually adds.
//
// The deterministic version is given every advantage: it uses the same league
// structure, the same berth counts and the same NFHS scoring. The only thing it
// lacks is race-day variance.
//
//   node backtest/baseline.js [seasonsPerPoint]
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 8000);
const YEARS = L.years();
const SIGMA_BY_CUT = [5.0, 3.0, 2.6, 2.6];     // from horizon.js
const bestOnly = () => [1, 0, 0];

function evaluate(rows) {
  const hits = rows.filter(r => r.p >= 0.5 && r.actual).length;
  return { brier: L.brier(rows.map(r => [r.p, r.actual])), hits };
}

console.log('season-best seeding vs the simulation — ' + YEARS.join(', '));
console.log('same leagues, same berths, same scoring; ' + SEASONS.toLocaleString()
  + ' seasons for the simulation\n');

const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
const agg = { det: [], sim: [] };
console.log('  cutoff            season-best seeding        simulation');
console.log('                    in top N   Brier           in top N   Brier   champion');

for (let ci = 0; ci < nCuts; ci++) {
  const det = [], sim = [];
  let detHit = 0, simHit = 0, field = 0, detChamp = 0, simChamp = 0, n = 0;
  for (const y of YEARS) for (const g of ['M', 'F']) {
    const cut = L.cutoffs(y)[ci];
    // deterministic: zero variance, best mark only
    const D = L.odds(y, g, cut, 0, 1, bestOnly);
    // the simulation as it ships, at the dial the horizon test picked
    const S = L.odds(y, g, cut, SIGMA_BY_CUT[ci], SEASONS);
    det.push(...D.teams); sim.push(...S.teams);
    field += D.order.length;
    detHit += D.teams.filter(t => t.p >= 0.5 && t.actual).length;
    simHit += S.teams.slice(0, D.order.length).filter(t => t.actual).length;
    // pick the favourite by P(win), not by P(qualify) — with zero variance the
    // qualifying odds are all exactly 1 and ties would be broken arbitrarily
    const champOf = T => T.reduce((a, b) => (b.win > a.win ? b : a));
    if (champOf(D.teams).name === D.order[0]) detChamp++;
    if (champOf(S.teams).name === S.order[0]) simChamp++;
    n++;
  }
  const d = evaluate(det), s = evaluate(sim);
  agg.det.push(...det); agg.sim.push(...sim);
  console.log('  ' + YEARS.map(y => L.cutoffs(y)[ci].slice(5)).join('/').padEnd(16)
    + (detHit + '/' + field).padStart(9) + d.brier.toFixed(4).padStart(9)
    + '     ' + (simHit + '/' + field).padStart(9) + s.brier.toFixed(4).padStart(9)
    + '   ' + detChamp + ' vs ' + simChamp + ' of ' + n);
}

const d = evaluate(agg.det), s = evaluate(agg.sim);
console.log('\npooled over every cutoff, season and gender (' + agg.det.length + ' team-seasons)');
console.log('  season-best seeding   Brier ' + d.brier.toFixed(4));
console.log('  simulation            Brier ' + s.brier.toFixed(4));
console.log('  the simulation is ' + (100 * (1 - s.brier / d.brier)).toFixed(0) + '% better by Brier');

// where the deterministic version is confidently wrong
const wrong = agg.det.filter(t => (t.p >= 0.5) !== !!t.actual).length;
console.log('\n  season-best seeding was flatly wrong about ' + wrong + ' of ' + agg.det.length
  + ' team-seasons (' + (100 * wrong / agg.det.length).toFixed(0) + '%),');
console.log('  and being deterministic it stated each one at 100% confidence.');
const mid = agg.sim.filter(t => t.p > 0.1 && t.p < 0.9).length;
console.log('  the simulation put ' + mid + ' of ' + agg.sim.length + ' ('
  + (100 * mid / agg.sim.length).toFixed(0) + '%) somewhere between 10% and 90%,');
console.log('  which is the part a deterministic ranking cannot express at all.');
