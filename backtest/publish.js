// Publish the backtest into the site.
//
//   node backtest/publish.js [seasons] [horizonSeasons]
//
// Runs the backtest, packs the result into the RECORD constant in index.html,
// and the Track record view renders from that. The eight figures in the How tab
// used to be typed in by hand and they drifted: the champion record was still
// published as two of four after a model change had made it one of four. Numbers
// the site claims should come out of the harness that produced them, so re-run
// this after anything that touches the model.
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 20000);
const HSEASONS = +(process.argv[3] || 5000);
const SIGMA = L.M.CAL.sd;
const YEARS = L.years();
const t0 = Date.now();

console.log('publishing the backtest — ' + SEASONS.toLocaleString() + ' seasons per board, sigma '
  + SIGMA + '%');

/* ---------- the September pass, board by board ---------- */
/* How many marks the model actually had at a cutoff. athletic.net's coverage
   has grown - 14 meets by the 2022 September cutoff, 33 by the same point in
   2025 - so the same date is not the same information set, and a reader
   comparing seasons deserves to see that rather than guess at it. */
const seedRows = (year, cutoff) => fs.readFileSync(
  path.join(__dirname, 'data', year + '-seed-' + cutoff + '.csv'), 'utf8')
  .trim().split(/\r?\n/).length - 1;

const pooled = [];
const perSeason = [];
for (const year of YEARS) {
  const cutoff = L.cutoffs(year)[0];
  for (const gender of ['M', 'F']) {
    const { teams, order, truth } = L.odds(year, gender, cutoff, SIGMA, SEASONS);
    pooled.push(...teams);
    const found = teams.filter(t => t.modelled).slice(0, order.length).filter(t => t.actual).length;
    const bs = L.brier(teams.map(t => [t.p, t.actual]));
    const base = teams.reduce((s, t) => s + t.actual, 0) / teams.length;
    const bref = L.brier(teams.map(t => [base, t.actual]));
    // the favourite is the team most likely to WIN; a list sorted by P(qualify)
    // breaks its ties arbitrarily among everyone sitting at 100%
    const fav = teams.reduce((x, y) => (y.win > x.win ? y : x));
    /* The same board four weeks out. Without it a reader has no way to tell a
       model that is weak from a model that is early, and those are different
       things to know about a September projection. */
    const lateCut = L.cutoffs(year)[2];
    const lt = L.odds(year, gender, lateCut, SIGMA, SEASONS);
    const lb = L.brier(lt.teams.map(x => [x.p, x.actual]));
    const lbase = lt.teams.reduce((s, x) => s + x.actual, 0) / lt.teams.length;
    const lref = L.brier(lt.teams.map(x => [lbase, x.actual]));

    perSeason.push({
      year: +year, g: gender, cutoff, field: order.length, found,
      skill: Math.round(100 * (1 - bs / bref)),
      skillLate: Math.round(100 * (1 - lb / lref)),
      foundLate: lt.teams.filter(x => x.modelled).slice(0, lt.order.length)
        .filter(x => x.actual).length,
      marks: seedRows(year, cutoff),
      fav: fav.name, favP: Math.round(100 * fav.win),
      champ: order[0], hit: fav.name === order[0],
    });
    console.log('  ' + year + ' ' + (gender === 'M' ? 'boys ' : 'girls') + '  found ' + found
      + '/' + order.length + '  favourite ' + fav.name + (fav.name === order[0] ? ' HIT' : ' miss'));
  }
}

const brier = L.brier(pooled.map(t => [t.p, t.actual]));
const baseRate = pooled.reduce((s, t) => s + t.actual, 0) / pooled.length;
const bref = L.brier(pooled.map(t => [baseRate, t.actual]));
const bins = [[0, .1], [.1, .3], [.3, .5], [.5, .7], [.7, .9], [.9, 1.01]];
const bands = bins.map(([lo, hi]) => {
  const g = pooled.filter(t => t.p >= lo && t.p < hi);
  if (!g.length) return null;
  return {
    lo: Math.round(100 * lo), hi: Math.round(Math.min(100 * hi, 100)), n: g.length,
    said: Math.round(100 * g.reduce((s, t) => s + t.p, 0) / g.length),
    was: Math.round(100 * g.reduce((s, t) => s + t.actual, 0) / g.length),
  };
}).filter(Boolean);

/* ---------- how the right dial moves with the horizon ---------- */
console.log('  horizon sweep, ' + HSEASONS.toLocaleString() + ' seasons per point');
/* Wide enough that the answer is never the edge of the range. With four
   seasons the eight-week optimum came back as exactly 6.0%, the old top of the
   sweep, which is not a measurement - it is a sweep that ran out. sweep.js had
   already gone to 8.0 for the same reason. */
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0];
// every season carries its own state meet date in its truth file
const STATE_DAY = Object.fromEntries(YEARS.map(y => [y, L.truthFor(y).stateDate]));
const nCuts = Math.min(...YEARS.map(y => L.cutoffs(y).length));
const horizon = [];
for (let ci = 0; ci < nCuts; ci++) {
  let weeks = 0, best = null, atShipped = 0;
  for (const s of SIGMAS) {
    const ps = [];
    for (const year of YEARS) for (const g of ['M', 'F']) {
      const cut = L.cutoffs(year)[ci];
      weeks = (new Date(STATE_DAY[year]) - new Date(cut)) / 6048e5;
      for (const t of L.odds(year, g, cut, s, HSEASONS).teams) ps.push([t.p, t.actual]);
    }
    const b = L.brier(ps);
    if (Math.abs(s - SIGMA) < 1e-9) atShipped = b;
    if (!best || b < best.b) best = { s, b };
  }
  horizon.push({ weeks: +weeks.toFixed(1), best: best.s, brier: +best.b.toFixed(4),
                 shipped: +atShipped.toFixed(4) });
  console.log('    ' + weeks.toFixed(0) + 'w out: best sigma ' + best.s + '%');
}

/* ---------- pack it ----------
   RECORD used to carry the live seed's row count as `marks`. It has been
   dropped, and the reason is worth keeping: it was a 2026 number living inside
   a record of the 2024 and 2025 backtest, so nothing that regenerates this file
   has any reason to run when it changes. It duly went stale the moment the
   database was refreshed - 2,974 against a seed of 3,645 - and now that the pull
   is automated it would be wrong most weeks rather than occasionally.

   Nothing rendered it, so nothing is lost. If a reader ever needs "how many
   marks is the board built on", the page is holding DATA and can count them. */

/* "mid-September" reads better than "2024-09-14", and the seasons do not share
   a cutoff date anyway - only a cutoff week. */
const MONTHS = ["January","February","March","April","May","June","July","August",
  "September","October","November","December"];
const label = d => {
  const day = +d.slice(8, 10);
  return (day <= 10 ? "early " : day <= 20 ? "mid-" : "late ") + MONTHS[+d.slice(5, 7) - 1];
};

const R = {
  seasons: YEARS.map(Number),
  cutoff: label(perSeason[0].cutoff),
  cutoffDates: perSeason.filter((_, i) => i % 2 === 0).map(x => x.cutoff),
  teamSeasons: pooled.length,
  qualified: pooled.filter(t => t.actual).length,
  found: perSeason.reduce((s, x) => s + x.found, 0),
  ofField: perSeason.reduce((s, x) => s + x.field, 0),
  champHit: perSeason.filter(x => x.hit).length,
  champOf: perSeason.length,
  brier: +brier.toFixed(4),
  base: +bref.toFixed(4),
  skill: Math.round(100 * (1 - brier / bref)),
  logloss: +L.logloss(pooled.map(t => [t.p, t.actual])).toFixed(3),
  sigma: SIGMA,
  runs: SEASONS,
  bands, horizon, perSeason,
  cutoffLate: label(L.cutoffs(YEARS[0])[2]),
  /* The seasons share a horizon, not a date - every first cutoff is exactly
     eight weeks from its own state meet, and the months differ. Say the thing
     that is true of all four. */
  weeksOut: Math.round((new Date(L.truthFor(YEARS[0]).stateDate)
    - new Date(L.cutoffs(YEARS[0])[0])) / 6048e5),
  weeksOutLate: Math.round((new Date(L.truthFor(YEARS[0]).stateDate)
    - new Date(L.cutoffs(YEARS[0])[2])) / 6048e5),
  built: new Date().toISOString().slice(0, 10),
};

const line = 'const RECORD=' + JSON.stringify(R) + ';';
const IDX = path.join(__dirname, '..', 'index.html');
let t = fs.readFileSync(IDX, 'utf8').replace(/\r\n/g, '\n');
if (/\nconst RECORD=\{[\s\S]*?\};\n/.test(t)) {
  t = t.replace(/\nconst RECORD=\{[\s\S]*?\};\n/, '\n' + line + '\n');
  console.log('  replaced RECORD');
} else {
  const anchor = 'const DATA_DATE=';
  const i = t.indexOf(anchor);
  if (i < 0) { console.log('  cannot find an anchor for RECORD'); process.exit(1); }
  t = t.slice(0, i) + line + '\n' + t.slice(i);
  console.log('  inserted RECORD');
}
fs.writeFileSync(IDX, t.replace(/\n/g, '\r\n'));

console.log('\n  ' + R.found + ' of ' + R.ofField + ' qualifiers inside the board, '
  + R.champHit + ' of ' + R.champOf + ' champions, Brier ' + R.brier
  + ', skill ' + R.skill + '%');
console.log('  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
