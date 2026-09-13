// Runs the pure functions in model.js under Node. Regenerate model.js with
// extract_model.js if any signature changes.  Usage: node audit2.js
const fs = require('fs');
const path = require('path');
const M = require('./model.js');

let pass = 0, fail = 0, latent = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'got ' + got + ', want ' + want); }

// Build a scoreMeet input from a finish order: order[i] is the team letter of
// the runner finishing in place i+1. Times are the place numbers themselves.
function race(order) {
  const letters = [...new Set(order)];
  const idxOf = {}; letters.forEach((l, i) => idxOf[l] = i);
  const teams = letters.map(l => ({ idx: idxOf[l], rIdx: [] }));
  const times = [];
  order.forEach((l, p) => { times.push(p + 1); teams[idxOf[l]].rIdx.push(times.length - 1); });
  const res = M.scoreMeet(teams, times);
  const by = {}; res.forEach((r, rank) => { by[letters[r.idx]] = { total: r.total, sixth: r.sixth, rank: rank + 1 }; });
  return by;
}

console.log('\nNFHS scoring');
{
  // perfect dual, seven a side: the loser is 50, not 40, because 6 and 7 displace
  const r = race(['A','A','A','A','A','A','A','B','B','B','B','B','B','B']);
  eq('perfect dual 7v7 winner is 15', r.A.total, 15);
  eq('perfect dual 7v7 loser is 50', r.B.total, 50);

  // with only five a side there is nothing to displace with
  const r5 = race(['A','A','A','A','A','B','B','B','B','B']);
  eq('perfect dual 5v5 winner is 15', r5.A.total, 15);
  eq('perfect dual 5v5 loser is 40', r5.B.total, 40);

  // sixth and seventh take a place but score nothing
  const rd = race(['A','A','A','A','A','A','A','B','B','B','B','B']);
  eq('displacers do not score', rd.A.total, 15);
  eq('displaced team pushed to 50', rd.B.total, 50);
  eq('sixth runner recorded', rd.A.sixth, 6);

  // tie on five, broken by the sixth runner
  // A: 1,2,5,9,11 = 28 (6th = 12)   B: 3,4,6,7,8 = 28 (6th = 10)
  const order = [];
  const A = [1,2,5,9,11,12,13], B = [3,4,6,7,8,10,14];
  for (let p = 1; p <= 14; p++) order.push(A.includes(p) ? 'A' : 'B');
  const rt = race(order);
  eq('tie: both teams on 28', rt.A.total + ':' + rt.B.total, '28:28');
  eq('tie broken by sixth runner', rt.B.rank, 1);

  // a team with no sixth runner loses the tie
  const A2 = [1,2,5,9,11], B2 = [3,4,6,7,8,10];
  const order2 = [];
  for (let p = 1; p <= 11; p++) order2.push(A2.includes(p) ? 'A' : 'B');
  const rn = race(order2);
  eq('tie with no sixth: both on 28', rn.A.total + ':' + rn.B.total, '28:28');
  eq('team without a sixth loses the tie', rn.B.rank, 1);
}

console.log('\nseven-runner cap');
{
  // NFHS: runners past a team's seventh are removed and do NOT displace.
  // A brings 9, B brings 5. B should finish on 8+9+10+11+12 = 50, because
  // A's 8th and 9th are struck out rather than pushing B down the field.
  const r = race(['A','A','A','A','A','A','A','A','A','B','B','B','B','B']);
  const capped = r.B.total === 50;
  ok('eighth and ninth runners do not displace', capped, 'got ' + r.B.total + ', want 50');
  if (!capped) latent.push(
    'scoreMeet increments `place` before the n>7 check, so a team\'s 8th+ runners\n' +
    '    still push opponents down the field. Unreachable today - buildModel caps\n' +
    '    every roster at 7 - but wrong if that cap is ever raised or bypassed.');
}

console.log('\nmodel wiring (live seed)');
{
  // index.html normally sits next to this file in the repo; allow an override
  const candidates = [process.argv[2], path.join(__dirname, 'index.html'),
                      path.join(__dirname, 'index_current.html')].filter(Boolean);
  const idx = candidates.find(p => fs.existsSync(p));
  if (!idx) { console.log('  SKIP: no index.html found (looked in ' + candidates.join(', ') + ')'); fail++; }
  const html = fs.readFileSync(idx, 'utf8');
  const seed = /<script id="seed"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  const { rows, bad } = M.parseCSV(seed);
  eq('seed parses with no bad rows', bad, 0);
  ok('seed has rows', rows.length > 500, 'rows=' + rows.length);
  ok('seed is 5,000m only', rows.every(r => r.dist === 5000),
    (new Set(rows.map(r => r.dist))).size + ' distinct distances');
  M.setDATA(rows);

  // 3,000m was removed from the model; only the state-meet distance is built
  for (const g of ['M', 'F']) for (const dist of [5000]) {
    const tag = g + dist;
    const m = M.buildModel(g, dist);
    ok(tag + ': every team maps to a league', m.unassigned.length === 0, m.unassigned.join(','));
    ok(tag + ': no roster exceeds seven', m.teams.every(t => !t.roster || t.roster.length <= 7));
    ok(tag + ': no athlete keeps more than three marks', m.runners.every(r => r.marks.length <= 3));
    ok(tag + ': marks sorted fastest first', m.runners.every(r =>
      r.marks.every((v, i) => i === 0 || r.marks[i - 1] <= v)));
    ok(tag + ': sampling weights sum to one', m.runners.every(r =>
      Math.abs(r.w.reduce((a, b) => a + b, 0) - 1) < 1e-9));
    ok(tag + ': short teams excluded from their league', Object.values(m.byLeague)
      .every(list => list.every(t => !t.short)));
    ok(tag + ': scoring five average is finite for full teams', m.teams
      .filter(t => !t.short).every(t => isFinite(t.avg5)));
  }
}

console.log('\nsimulation invariants');
{
  const m = M.buildModel('M', 5000);
  const t = M.blankTally(m);
  const worlds = [{ adj: null, byIdx: t.byIdx }];
  const times = new Float64Array(m.runners.length);
  const tmp = new Float64Array(m.runners.length);
  const shock = new Float64Array(m.teams.length);
  const N = 300;
  for (let i = 0; i < N; i++) M.oneSeason(m, worlds, M.CAL.sd / 100, times, shock, tmp);
  const qualSum = t.list.reduce((s, x) => s + x.qual, 0);
  eq('exactly FIELD teams qualify each season', qualSum, N * M.FIELD);
  const winSum = t.list.reduce((s, x) => s + x.win, 0);
  eq('exactly one winner each season', winSum, N);
  ok('no team qualifies more often than seasons run', t.list.every(x => x.qual <= N));
  ok('auto + wild equals qual', t.list.every(x => x.auto + x.wild === x.qual));
  ok('top4 never exceeds top10', t.list.every(x => x.top4 <= x.top10));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (latent.length) {
  console.log('\nlatent issues (not reachable through the app today):');
  latent.forEach(l => console.log('  - ' + l));
}
process.exit(fail ? 1 : 0);
