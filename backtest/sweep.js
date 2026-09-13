// Which variance dial fits the outcomes best, per season-gender and pooled?
// Defaults to the September cutoff; --cut N picks a later one.
//   node backtest/sweep.js [seasonsPerPoint] [--cut N]
const L = require('./lib.js');

const argv = process.argv.slice(2);
const ci = argv.includes('--cut') ? +argv[argv.indexOf('--cut') + 1] : 0;
const SEASONS = +(argv.find(a => /^\d+$/.test(a)) || 8000);
const SIGMAS = [2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0];
const YEARS = L.years();

const cells = [];
for (const y of YEARS) for (const g of ['M', 'F']) cells.push({ y, g, key: y + ' ' + (g === 'M' ? 'boys' : 'girls') });

console.log('sigma sweep — ' + YEARS.map(y => L.cutoffs(y)[ci]).join(', ')
  + ', ' + SEASONS.toLocaleString() + ' seasons per point\n');
process.stdout.write(' sigma ');
cells.forEach(c => process.stdout.write('  ' + c.key.padStart(11)));
console.log('     POOLED    logloss');

const results = [];
for (const s of SIGMAS) {
  const per = cells.map(c => L.odds(c.y, c.g, L.cutoffs(c.y)[ci], s, SEASONS)
    .teams.map(t => [t.p, t.actual]));
  const all = per.flat();
  process.stdout.write(' ' + s.toFixed(1).padStart(4) + '%');
  per.forEach(p => process.stdout.write('  ' + L.brier(p).toFixed(4).padStart(11)));
  const bs = L.brier(all), ll = L.logloss(all);
  console.log('     ' + bs.toFixed(4) + '     ' + ll.toFixed(4));
  results.push({ s, bs, ll, per: per.map(L.brier) });
}
const bB = results.reduce((a, b) => b.bs < a.bs ? b : a);
const bL = results.reduce((a, b) => b.ll < a.ll ? b : a);
const shipped = results.find(r => r.s === L.M.CAL.sd);
console.log('\nbest pooled Brier   : sigma ' + bB.s + '%  (' + bB.bs.toFixed(4) + ')');
console.log('best pooled logloss : sigma ' + bL.s + '%  (' + bL.ll.toFixed(4) + ')');
if (shipped) console.log('shipped ' + L.M.CAL.sd + '%        : Brier ' + shipped.bs.toFixed(4)
  + ', logloss ' + shipped.ll.toFixed(4));
console.log('\nper-season optimum (Brier):');
cells.forEach((c, i) => {
  const best = results.reduce((a, b) => b.per[i] < a.per[i] ? b : a);
  console.log('  ' + c.key.padEnd(12) + ' sigma ' + String(best.s).padStart(4) + '%   ' + best.per[i].toFixed(4));
});
