// node backtest/test_build.js
//
// Guards the ground truth the whole backtest is scored against. These are the
// numbers every published figure is measured from, so an error here does not
// look like a bug — it looks like a model that is slightly worse or better than
// it really is, which is much harder to notice.
//
// No network: everything is checked against the committed data files.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' — got ' + a + ', wanted ' + b);

/* ---------- the classifier that got this wrong once ----------
   Lifted out of build_season.js by text rather than restated, so the test
   cannot drift away from the code it is guarding. */
const src = fs.readFileSync(path.join(__dirname, 'build_season.js'), 'utf8');
const line = src.split(/\r?\n/).find(l => l.startsWith('const isVarsity'));
ok(!!line, 'build_season.js still defines isVarsity');
// eslint-disable-next-line no-new-func
const isVarsity = line ? new Function('return ' + line.replace('const isVarsity = ', '').replace(/;$/, ''))() : () => false;

for (const [name, want] of [
  ['5,000 Meters Varsity', true],
  ['5,000 Meters Varsity Boys', true],
  ['5,000 Meters Varsity Girls', true],
  ['5,000 Meters Junior Varsity', false],   // the one that was wrong
  ['5,000 Meters JV', false],
  ['5,000 Meters JV Boys', false],
  ['5,000 Meters JV Heat 1', false],
  ['5,000 Meters 6A', false],
  ['3,000 Meters Novice', false],
]) eq(isVarsity(name), want, JSON.stringify(name));

/* ---------- every committed season ---------- */
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'));
const years = Object.keys(CFG).filter(k => /^\d{4}$/.test(k)).sort();
ok(years.length >= 2, 'at least two seasons are configured');

for (const y of years) {
  const tf = path.join(__dirname, 'data', y + '-truth.json');
  if (!fs.existsSync(tf)) { fail++; console.log('  FAIL  ' + y + ' has no truth.json'); continue; }
  const t = JSON.parse(fs.readFileSync(tf, 'utf8'));

  eq(Object.keys(CFG[y].districts).length, 7, y + ': seven districts configured');
  eq(CFG[y].cutoffs.length, 4, y + ': four cutoffs');

  for (const g of ['M', 'F']) {
    const leagues = Object.keys(t.leagues[g]);
    eq(leagues.length, 7, y + ' ' + g + ': seven leagues in the truth');

    // a 6A league is roughly 5-10 schools; 12+ means JV crept back in
    for (const l of leagues) {
      const n = t.districts[g][l].length;
      ok(n >= 3 && n <= 11, y + ' ' + g + ' ' + l + ': ' + n + ' scoring teams is plausible');
    }

    // the state field: 14 automatic plus a handful of at-large
    const b = t.berths[g];
    eq(b.leagues, 7, y + ' ' + g + ': berths counted over seven leagues');
    eq(b.auto, 2, y + ' ' + g + ': two automatic per league');
    ok(b.atLarge >= 0 && b.atLarge <= 6, y + ' ' + g + ': ' + b.atLarge + ' at-large is plausible');
    eq(t.state[g].length, b.total, y + ' ' + g + ': the state field matches the berth total');
    ok(t.state[g].length >= 14, y + ' ' + g + ': at least the automatic berths are filled');

    // every team that scored at state belongs to a league we know about
    const members = new Set();
    for (const l of leagues) t.leagues[g][l].forEach(s => members.add(s));
    const strays = t.state[g].map(r => r.team).filter(s => !members.has(s));
    ok(strays.length === 0, y + ' ' + g + ': every state team is in a league; stray: ' + strays.join(', '));

    // scores must be strictly ordered, and a winning score has to be possible
    const sc = t.state[g].map(r => r.score);
    ok(sc.every((v, i) => i === 0 || v >= sc[i - 1]), y + ' ' + g + ': state scores are ordered');
    ok(sc[0] >= 15, y + ' ' + g + ': the winning score is at least a perfect 15');
  }

  // every cutoff has a seed, and they grow as the season fills in
  const sizes = CFG[y].cutoffs.map(c => {
    const f = path.join(__dirname, 'data', y + '-seed-' + c + '.csv');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).length - 1 : -1;
  });
  ok(sizes.every(n => n > 0), y + ': a seed for every cutoff — ' + sizes.join(', '));
  ok(sizes.every((n, i) => i === 0 || n >= sizes[i - 1]),
    y + ': the database never shrinks as the season goes on — ' + sizes.join(', '));
}

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
