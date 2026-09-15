// node backtest/snapshot.js [seasons]
//
// Freezes what the board says today, before the races it is predicting.
//
// WHY THIS IS A DIFFERENT ARTIFACT FROM THE TRACK RECORD
// The Track record view is retrodictive: it rebuilds 2022-2025 as they stood in
// September and scores the model against a November everyone already knows. It
// is honest work, and it is also the kind of work nobody has to believe. Every
// choice in it - the cutoffs, the exclusions, the sigma - was made by someone
// who could see the answer.
//
// A forward archive cannot be argued with in the same way. It says what the
// model thinks before the season resolves, and it is committed and pushed the
// moment it is written, so git carries an external timestamp on every entry.
// Rewriting one means rewriting history in a public repository.
//
// That is the whole value, and it is why this file refuses to touch an entry
// that already exists. An append-only archive that can be quietly amended is
// just a slower way of tuning after the fact.
const fs = require('fs');
const path = require('path');
const M = require('../model.js');

const RUNS = +(process.argv[2] || 20000);
const FORCE = process.argv.includes('--force');
const IDX = path.join(__dirname, '..', 'index.html');

const html = fs.readFileSync(IDX, 'utf8');
const seed = (html.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1].trim();
const through = (html.match(/const DATA_DATE="([\d-]+)"/) || [, ''])[1];
if (!seed || !through) { console.error('could not read the seed or DATA_DATE'); process.exit(1); }

const parsed = M.parseCSV(seed);
M.setDATA(parsed.rows);
const marks = parsed.rows.length;

/* Today, not the data date. The two differ on purpose: `taken` is when the
   claim was made and `through` is what it was made from, and a reader checking
   the archive needs both to see that nothing after `taken` informed it. */
const taken = new Date().toISOString().slice(0, 10);

/* The class list comes from the file itself rather than a hardcoded five, via
   the parser pull/seed.js already owns and tests. model.js carries its own copy
   of CLASSES for setClass to read, so only the names are needed here. */
const classNames = Object.keys(require('../pull/seed.js').parseClasses(html).CLASSES);

/* Read the archive before simulating, not after. A collision used to cost ten
   boards of Monte Carlo before anything noticed. */
const RE = /\nconst SNAPSHOTS=(\[[\s\S]*?\]);\n/;
const found = html.match(RE);
const list = found ? JSON.parse(found[1]) : [];
const clash = list.findIndex(s => s.taken === taken);
if (clash >= 0 && !FORCE) {
  console.error(taken + ' is already in the archive. Refusing to overwrite it.');
  console.error('That refusal is the point: an archive that can be amended proves nothing.');
  console.error('--force exists for the case where today\'s entry came from a bad crawl and');
  console.error('has not been pushed. If it has been pushed, leave it — let the record show');
  console.error('what was actually claimed.');
  process.exit(2);
}
if (clash >= 0) { console.log('--force: replacing today\'s unpushed entry\n'); list.splice(clash, 1); }

console.log('snapshot ' + taken + ' — from results through ' + through
  + ', ' + marks.toLocaleString() + ' marks, ' + RUNS.toLocaleString() + ' seasons a board');

const boards = {};
for (const cls of classNames) {
  for (const g of ['M', 'F']) {
    M.setClass(cls, g);
    const model = M.buildModel(g, 5000);
    const scoring = model.teams.filter(t => !t.short);
    if (scoring.length < M.FIELD) {
      console.log('  ' + (cls + ' ' + g).padEnd(9) + 'only ' + scoring.length
        + ' teams can field ' + M.SC + ' — skipped');
      continue;
    }
    const t = M.blankTally(model);
    const worlds = [{ adj: null, byIdx: t.byIdx }];
    const times = new Float64Array(model.runners.length);
    const tmp = new Float64Array(model.runners.length);
    const shock = new Float64Array(model.teams.length);
    for (let i = 0; i < RUNS; i++) M.oneSeason(model, worlds, M.CAL.sd / 100, times, shock, tmp);

    /* Tenths of a percent as integers. Two numbers a team, because those are
       the two the board leads with and the two anyone would check; storing the
       whole tally would multiply the file for detail nobody audits. */
    const row = {};
    for (const x of t.list) row[x.name] = [Math.round(1000 * x.qual / RUNS),
                                          Math.round(1000 * x.win / RUNS)];
    boards[cls + '|' + g] = row;
    const fav = t.list.reduce((a, b) => (b.win > a.win ? b : a));
    console.log('  ' + (cls + ' ' + g).padEnd(9) + scoring.length + ' teams, favourite '
      + fav.name + ' ' + (100 * fav.win / RUNS).toFixed(0) + '%');
  }
}

/* ---------- append, never amend ---------- */
const entry = { taken, through, marks, sigma: M.CAL.sd, runs: RUNS, boards };

list.push(entry);
list.sort((a, b) => (a.taken < b.taken ? -1 : 1));

const line = '\nconst SNAPSHOTS=' + JSON.stringify(list) + ';\n';
let out;
if (found) out = html.replace(RE, line);
else {
  const anchor = 'const DATA_DATE=';
  const i = html.indexOf(anchor);
  if (i < 0) { console.error('cannot find an anchor for SNAPSHOTS'); process.exit(1); }
  out = html.slice(0, i) + line.slice(1) + html.slice(i);
}
fs.writeFileSync(IDX, out);

const kb = (JSON.stringify(entry).length / 1024).toFixed(1);
console.log('\n  archived ' + Object.keys(boards).length + ' boards, ' + kb + 'KB'
  + '  (' + list.length + ' snapshot' + (list.length === 1 ? '' : 's') + ' on file, '
  + (JSON.stringify(list).length / 1024).toFixed(0) + 'KB total)');
console.log('  commit and push it now — the commit date is the part that cannot be faked.');
