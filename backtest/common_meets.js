// node backtest/common_meets.js [minSeasons]
//
// Which meets are the same meet in every season? Writes common-meets.json,
// which build_season.js reads to produce a second set of seeds restricted to
// them.
//
// WHY
// The four seasons are not equally well recorded. athletic.net held 14 meets by
// the September cutoff in 2022 and 33 by the same point in 2025, so a model
// that scores worse on 2022 might be facing a harder season or might simply
// know less. Holding the meet set constant separates the two: if the gap
// survives on a fixed set of meets it is the season, and if it closes it was
// the coverage.
//
// WHAT IT CANNOT DO
// Only twenty meets recur in all four seasons, and almost none of them fall
// early, because September is mostly one-off duals and local invitationals that
// change year to year. At the September cutoff the restricted board can field
// three teams of the eighteen it needs. Relaxing to "at least two of four"
// does not rescue it either. So this is a diagnostic for the October cutoffs,
// not a replacement for the published record - see backtest/README.md.
const fs = require('fs');
const path = require('path');

const MIN = +(process.argv[2] || 4);
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'));
const YEARS = Object.keys(CFG).filter(k => /^\d{4}$/.test(k)).sort();

/* Meet names drift: the 61st Annual Steve Maas Run-A-Ree becomes the 62nd, the
   23rd Bellarmine Invite the 24th, 2nd Annual Rose City the 3rd. Strip the
   counting and the decoration and what is left identifies the meet. */
function norm(name) {
  return String(name || '').toLowerCase()
    .replace(/\b\d+\s*(st|nd|rd|th)\b/g, ' ')
    .replace(/\b(19|20)\d\d\b/g, ' ')
    .replace(/\bannual\b/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const byName = {}, meta = {};
for (const y of YEARS) {
  const f = path.join(__dirname, 'raw', 'y' + y + '_meta.json');
  if (!fs.existsSync(f)) {
    console.error('no raw pull for ' + y + ' — run pull_season.js first');
    process.exit(1);
  }
  meta[y] = JSON.parse(fs.readFileSync(f, 'utf8')).meets;
  for (const [id, m] of Object.entries(meta[y])) {
    if (!m.date || m.date < y + '-08-15') continue;   // summer is not the season
    const k = norm(m.name);
    if (!k) continue;
    (byName[k] = byName[k] || {})[y] = (byName[k][y] || []).concat(id);
  }
}

const names = Object.keys(byName)
  .filter(k => YEARS.filter(y => byName[k][y]).length >= MIN).sort();

const out = { minSeasons: MIN, seasons: YEARS, names, meets: {} };
for (const y of YEARS) {
  const ids = new Set();
  for (const k of names) (byName[k][y] || []).forEach(id => ids.add(String(id)));
  // the championships are the truth, never the information set, and are always kept
  for (const id of [CFG[y].state, ...Object.values(CFG[y].districts)]) ids.add(String(id));
  out.meets[y] = [...ids].sort();
}

fs.writeFileSync(path.join(__dirname, 'common-meets.json'), JSON.stringify(out, null, 2) + '\n');

console.log(names.length + ' meets recur in at least ' + MIN + ' of the ' + YEARS.length + ' seasons');
for (const k of names) {
  console.log('  ' + k.slice(0, 44).padEnd(46)
    + YEARS.map(y => (byName[k][y] ? meta[y][byName[k][y][0]].date.slice(5) : '  -  ')).join('  '));
}
console.log('\nwritten to backtest/common-meets.json');
