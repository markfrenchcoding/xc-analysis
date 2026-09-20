// node backtest/test_snapshot.js
//
// The archive's whole claim is that it cannot be quietly rewritten. That claim
// rests on one regex finding `const SNAPSHOTS=` in index.html — and for the
// first day of its life that regex did not match, because it asked for `];\n`
// against a CRLF file. Everything downstream failed silently and helpfully:
// the replace became an insert, three declarations piled up, and the clash
// check compared today against an empty list and waved every run through.
//
// A guard that cannot fail looks exactly like a guard that works. So these
// tests do not check that snapshot.js runs; they check that it REFUSES, on a
// real file, with the line endings this repo actually uses.
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const SNAP = path.join(__dirname, 'snapshot.js');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + m); } };

/* A throwaway copy of the repo layout: index.html and the two modules the
   script requires, so a refusal can be provoked without touching the real one. */
function sandbox(eol) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  fs.mkdirSync(path.join(dir, 'backtest'));
  fs.mkdirSync(path.join(dir, 'pull'));
  for (const f of ['model.js', 'index.html']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.copyFileSync(SNAP, path.join(dir, 'backtest', 'snapshot.js'));
  fs.copyFileSync(path.join(ROOT, 'pull', 'seed.js'), path.join(dir, 'pull', 'seed.js'));
  const p = path.join(dir, 'index.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, eol));
  return dir;
}
const run = (dir, args) => {
  const r = cp.spawnSync(process.execPath, [path.join(dir, 'backtest', 'snapshot.js')].concat(args),
    { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const decls = dir =>
  (fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/const SNAPSHOTS=/g) || []).length;
/* The same rule snapshot.js uses. Stated once here, checked against what the
   script actually wrote. */
const localToday = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
})();
const readList = dir => {
  const m = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
    .match(/\r?\nconst SNAPSHOTS=(\[[\s\S]*?\]);\r?\n/);
  try { return m ? JSON.parse(m[1]) : []; } catch (e) { return []; }
};

/* The shipped file already holds today's entry, so a plain run must refuse.
   Both line endings, because the bug was only ever visible in one of them. */
for (const [name, eol] of [['CRLF', '\r\n'], ['LF', '\n']]) {
  const dir = sandbox(eol);
  const before = decls(dir);
  ok(before === 1, name + ': fixture starts with exactly one SNAPSHOTS');
  const entriesBefore = readList(dir).length;
  ok(entriesBefore >= 1, name + ': and at least one archived entry');

  const plain = run(dir, ['200']);
  ok(plain.code === 2, name + ': a second entry for the same day exits 2');
  ok(/already in the archive/.test(plain.out), name + ': and says why');
  ok(decls(dir) === before, name + ': a refused run leaves the file alone');

  const noWhy = run(dir, ['200', '--force']);
  ok(noWhy.code === 2, name + ': --force without --why exits 2');
  ok(/needs --why/.test(noWhy.out), name + ': and asks for the reason');
  ok(decls(dir) === before, name + ': and writes nothing');

  /* The one path that may write must still write exactly one declaration -
     this is the assertion that would have caught the original bug, because
     the broken version produced two here and reported success. */
  const forced = run(dir, ['200', '--force', '--why=test']);
  ok(forced.code === 0, name + ': --force --why succeeds');
  ok(decls(dir) === 1, name + ': and still leaves exactly ONE declaration');

  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const m = html.match(/\r?\nconst SNAPSHOTS=(\[[\s\S]*?\]);\r?\n/);
  ok(!!m, name + ': the written archive is findable by the same regex');
  let list = null;
  try { list = JSON.parse(m[1]); } catch (e) { /* reported below */ }
  /* The entry THIS RUN wrote, found by its own stamp rather than by a date the
     test works out for itself. The first version computed today with
     toISOString, which is UTC, while snapshot.js stamps the local date - so on
     a Saturday evening in Oregon the test looked for an entry labelled Sunday
     and failed against perfectly good output. Two places deciding separately
     what day it is will disagree eventually; only one of them should decide. */
  const mine = list && list.find(s => s.forced && s.forced.why === 'test');
  ok(Array.isArray(list) && list.length === entriesBefore,
     name + ': a forced rewrite replaces an entry rather than adding one');
  ok(!!mine, name + ": today's entry is in the archive");
  ok(mine && mine.forced && mine.forced.why === 'test',
     name + ': the rewrite reason is stamped onto it');
  ok(mine && mine.runs === 200, name + ': the season count is the number, not the flag');
  ok(list && list.every((s, i) => i === 0 || list[i - 1].taken <= s.taken),
     name + ': entries stay in date order');
  /* And pin the local-date rule itself, so the UTC bug cannot come back
     quietly. Oregon is seven hours behind UTC, so for seventeen hours a day
     the two agree and a regression would hide. */
  ok(mine && mine.taken === localToday, name + ': stamped with the local date, not UTC');
  ok(list && list[0].boards && Object.keys(list[0].boards).length === 10,
     name + ': all ten boards archived');
  const b = mine && mine.boards['6A|M'];
  ok(b && b.t && Array.isArray(b.r), name + ': a board carries both teams and runners');
  ok(b && b.t && b.t['Grant'] && b.t['Grant'].length === 4, name + ': a team row is four numbers');
  ok(b && Array.isArray(b.r) && b.r.length > 0 && b.r[0].length === 5, name + ': a runner row is name, team and three');

  /* The file must still be one script the browser will accept. Two
     declarations is not a wrong number on the page - it is a blank page. */
  ok(!/const SNAPSHOTS=[\s\S]*const SNAPSHOTS=/.test(html),
     name + ': never two declarations (the blank-page failure)');

  fs.rmSync(dir, { recursive: true, force: true });
}

/* The flag-as-count bug, which is what put NaN through the season loop and
   wrote an entry of nulls that was structurally perfect and entirely empty. */
{
  const dir = sandbox('\r\n');
  const bad = run(dir, ['--why=x', 'nonsense']);
  ok(bad.code === 1, 'a season count that will not parse exits 1');
  ok(/positive number/.test(bad.out), 'and says so rather than running NaN seasons');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log((fail ? fail + ' failed, ' : '') + pass + ' passed');
process.exit(fail ? 1 : 0);
