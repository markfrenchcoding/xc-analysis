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

/* The shipped file already holds today's entry, so a plain run must refuse.
   Both line endings, because the bug was only ever visible in one of them. */
for (const [name, eol] of [['CRLF', '\r\n'], ['LF', '\n']]) {
  const dir = sandbox(eol);
  const before = decls(dir);
  ok(before === 1, name + ': fixture starts with exactly one SNAPSHOTS');

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
  ok(Array.isArray(list) && list.length === 1, name + ': one entry, not two');
  ok(list && list[0].forced && list[0].forced.why === 'test',
     name + ': the rewrite reason is stamped onto the entry');
  ok(list && list[0].runs === 200, name + ': the season count is the number, not the flag');
  ok(list && list[0].boards && Object.keys(list[0].boards).length === 10,
     name + ': all ten boards archived');
  const b = list && list[0].boards['6A|M'];
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
