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

/* The first non-flag argument, not argv[2]: `snapshot.js --force` put the flag
   where the count was expected, NaN-ed the season loop, and wrote an entry of
   zeroes that looked structurally perfect. A count that will not parse is a
   hard stop now - this file's only product is a number somebody is meant to
   trust later. */
const NUM = process.argv.slice(2).find(x => !x.startsWith('--'));
const RUNS = NUM === undefined ? 20000 : +NUM;
if (!Number.isFinite(RUNS) || RUNS < 1) {
  console.error('seasons must be a positive number, got ' + JSON.stringify(NUM));
  process.exit(1);
}
const FORCE = process.argv.includes('--force');
/* Forcing has to leave a mark. The rule this file exists to enforce is not
   "never rewrite" - it is "never rewrite QUIETLY", which is why --force now
   demands a reason and staples it to the entry for good. The site renders it
   beside the date, so a reader sees that a row was rewritten, when, and on
   whose account, without having to go and read the git history to find out. An
   archive that records its own amendments is still an archive. */
const WHY = (process.argv.find(a => a.startsWith('--why=')) || '').slice(6);
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
/* \r? on both sides: index.html is CRLF here, and without it this never
   matched, silently turning every replace into an append and leaving the
   duplicate guard below comparing against an empty list. */
const RE = /\r?\nconst SNAPSHOTS=(\[[\s\S]*?\]);\r?\n/;
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
if (clash >= 0 && !WHY) {
  console.error('--force needs --why="..." - the reason is written into the entry and');
  console.error('shown on the site. A rewrite nobody can see is the thing being guarded');
  console.error('against, not the rewrite itself.');
  process.exit(2);
}
let forced = null;
if (clash >= 0) {
  const old = list[clash];
  forced = { on: taken, why: WHY, was: (old.forced && old.forced.was || 0) + 1 };
  console.log('--force: rewriting ' + taken + ' — ' + WHY);
  console.log('  the entry will carry that reason permanently\n');
  list.splice(clash, 1);
}

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
    /* The runner tally rides along for free. oneSeason already draws a time for
       every athlete in every season and throws the finishing order away unless a
       world asks for it, so archiving the individual board costs one array. */
    const rt = M.runnerTally(model);
    const rtm = new Float64Array(model.runners.length);
    const worlds = [{ adj: null, byIdx: t.byIdx, rt, rtm }];
    const times = new Float64Array(model.runners.length);
    const tmp = new Float64Array(model.runners.length);
    const shock = new Float64Array(model.teams.length);
    for (let i = 0; i < RUNS; i++) M.oneSeason(model, worlds, M.CAL.sd / 100, times, shock, tmp);

    /* Tenths of a percent as integers, and only what one of the three boards
       actually leads with. A team is [qualify, auto-qualify, win, mean points]:
       at-large is not stored because auto + wild == qual is an invariant audit2
       asserts, so the Leagues reading derives from these two rather than taking
       a column of its own. Mean points is over the seasons that team qualified,
       the same conditional figure the card shows, and 0 where it never did.
       A runner is [mean place x10, all-state, win]. Thirty a board: the archive
       is a claim anyone can check, and nobody checks the eighty-first runner.
       The full tally would multiply the file for detail nobody audits. */
    const P3 = v => Math.round(1000 * v / RUNS);
    const tRow = {};
    for (const x of t.list) tRow[x.name] = [P3(x.qual), P3(x.auto), P3(x.win),
                                            x.ptsN ? Math.round(x.ptsSum / x.ptsN) : 0];
    const rRow = rt.filter(r => r && r.n)
      .sort((a, b) => a.placeSum / a.n - b.placeSum / b.n)
      .slice(0, 30)
      .map(r => [r.name, r.team, Math.round(10 * r.placeSum / r.n), P3(r.top21), P3(r.win)]);
    boards[cls + '|' + g] = { t: tRow, r: rRow };
    const fav = t.list.reduce((a, b) => (b.win > a.win ? b : a));
    console.log('  ' + (cls + ' ' + g).padEnd(9) + scoring.length + ' teams, '
      + rRow.length + ' runners, favourite '
      + fav.name + ' ' + (100 * fav.win / RUNS).toFixed(0) + '%'
      + (rRow.length ? ', ' + rRow[0][0] : ''));
  }
}

/* ---------- append, never amend ---------- */
const entry = { taken, through, marks, sigma: M.CAL.sd, runs: RUNS, boards };
if (forced) entry.forced = forced;

list.push(entry);
list.sort((a, b) => (a.taken < b.taken ? -1 : 1));

const NL = html.includes('\r\n') ? '\r\n' : '\n';
const line = NL + 'const SNAPSHOTS=' + JSON.stringify(list) + ';' + NL;
let out;
if (found) out = html.replace(RE, line);
else {
  const anchor = 'const DATA_DATE=';
  const i = html.indexOf(anchor);
  if (i < 0) { console.error('cannot find an anchor for SNAPSHOTS'); process.exit(1); }
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  out = html.slice(0, i) + line.slice(1).replace(/\n/g, nl) + html.slice(i);
}
fs.writeFileSync(IDX, out);

const kb = (JSON.stringify(entry).length / 1024).toFixed(1);
console.log('\n  archived ' + Object.keys(boards).length + ' boards, ' + kb + 'KB'
  + '  (' + list.length + ' snapshot' + (list.length === 1 ? '' : 's') + ' on file, '
  + (JSON.stringify(list).length / 1024).toFixed(0) + 'KB total)');
console.log('  commit and push it now — the commit date is the part that cannot be faked.');
