// How does OSAA's at-large committee actually pick, and can head-to-head explain
// it better than the simulator's scoring-five average?
//
//   node backtest/atlarge_h2h.js
//
// For every 6A board 2022-2025: the real at-large pool (district 3rd and 4th),
// the real picks (state team field minus each district's top two), and how many
// of those picks each selection rule names, always respecting OSAA's first
// criterion - a district's 4th is only eligible once its 3rd has been taken.
//
// Rules compared:
//   a  avg5    scoring-five average time in the district race (what the simulator does)
//   b  margin  district score minus the 2nd-place (automatic) team's score
//   b2 margin  district score minus the mean of the two automatic teams
//   c  Borda   sum over the pool of pref(A,B) = (1-w)*T + w*H, where
//              T = logistic((avg5B - avg5A)/10s) and H is the time-weighted share
//              of NFHS duals A won against B in the same race before districts,
//              weight exp(-days/tau). Pairs that never met fall back to H = T.
//   d  Borda with the margin in place of avg5: T = logistic((marginB - marginA)/10 pts)
//
// Head-to-head comes from the per-team season grids in raw/. Those rows carry no
// division name, only a place that restarts in every race, so "were they in the
// same race" is inferred: two teams met if their runners, sorted by time, also
// come out in strictly increasing place order. Teams in different heats of one
// meet clash (a slower runner with a better place), so they do not count as met.
// Reads only what is on disk: raw/y<year>_raw.csv, raw/y<year>_meta.json,
// data/<year>-truth.json, seasons.json.
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SEASONS = JSON.parse(fs.readFileSync(path.join(DIR, 'seasons.json'), 'utf8'));
const YEARS = ['2022', '2023', '2024', '2025'];
const TAUS = [7, 14, 28, Infinity];
const BLENDS = [0, 0.25, 0.5, 0.75, 1];

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const isVarsity = d => /varsity/i.test(d) && !/junior\s*varsity|\bjv\b/i.test(d);
const logistic = x => 1 / (1 + Math.exp(-x));
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// NFHS dual of two teams' runners in one race: top five score, six and seven
// displace, a tie goes to the better sixth. Returns 1 / 0.5 / 0 for team A, or
// null if either cannot field five.
function dual(A, B) {
  if (A.length < 5 || B.length < 5) return null;
  const all = A.slice(0, 7).map(s => ({ s, t: 'A' })).concat(B.slice(0, 7).map(s => ({ s, t: 'B' })))
    .sort((x, y) => x.s - y.s);
  const sc = { A: 0, B: 0 }, n = { A: 0, B: 0 }, sixth = { A: 99, B: 99 };
  all.forEach((r, i) => { n[r.t]++; if (n[r.t] <= 5) sc[r.t] += i + 1; else if (n[r.t] === 6) sixth[r.t] = i + 1; });
  if (sc.A !== sc.B) return sc.A < sc.B ? 1 : 0;
  return sixth.A < sixth.B ? 1 : sixth.A > sixth.B ? 0 : 0.5;
}

// a team's runners in the race its fastest runner ran: by time, place must climb
function leadChain(list) {
  const out = []; let last = -1;
  for (const r of list.slice().sort((a, b) => a.s - b.s)) {
    if (!(r.place > 0)) continue;
    if (r.place > last) { out.push(r); last = r.place; }
  }
  return out;
}
function sameRace(A, B) {
  const all = A.slice(0, 7).concat(B.slice(0, 7)).sort((a, b) => a.s - b.s || a.place - b.place);
  for (let i = 1; i < all.length; i++) if (all[i].place <= all[i - 1].place && all[i].s > all[i - 1].s) return false;
  const seen = new Set(); for (const r of all) { if (seen.has(r.place)) return false; seen.add(r.place); }
  return true;
}

// greedy selection with the 3rd-before-4th rule; score: higher is better
function select(pool, k, score) {
  const chosen = new Set();
  for (let i = 0; i < k; i++) {
    const avail = pool.filter(t => !chosen.has(t.team) &&
      (t.place === 3 || pool.some(u => u.league === t.league && u.place === 3 && chosen.has(u.team))));
    if (!avail.length) break;
    avail.sort((x, y) => score(y) - score(x));
    chosen.add(avail[0].team);
  }
  return chosen;
}
// expected hits for a uniformly random committee under the same rule
function randomHits(pool, k, picks, n = 4000) {
  let tot = 0;
  for (let i = 0; i < n; i++) { const r = new Map(pool.map(t => [t.team, Math.random()]));
    const s = select(pool, k, t => r.get(t.team)); for (const t of s) if (picks.has(t)) tot++; }
  return tot / n;
}

const boards = [];
for (const Y of YEARS) {
  const cfg = SEASONS[Y];
  const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'data', Y + '-truth.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'raw', 'y' + Y + '_meta.json'), 'utf8'));
  const rows = fs.readFileSync(path.join(DIR, 'raw', 'y' + Y + '_raw.csv'), 'utf8').trim()
    .split(/\r?\n/).slice(1).map(split)
    .map(c => ({ aid: c[0], place: +c[4], school: c[5], g: c[6], dist: +c[7], s: +c[8], mid: c[9], div: c[11] }))
    .filter(r => r.dist === 5000 && r.s > 0);
  const districtIds = new Set(Object.values(cfg.districts));

  for (const g of ['M', 'F']) {
    const D = truth.districts[g];
    const auto = new Set(), pool = [];
    for (const [lg, res] of Object.entries(D)) {
      res.slice(0, 2).forEach(r => auto.add(r.team));
      const vars = rows.filter(r => r.mid === cfg.districts[lg] && r.g === g && isVarsity(r.div));
      const avg5 = team => { const t = vars.filter(r => r.school === team).map(r => r.s).sort((a, b) => a - b);
        return t.length >= 5 ? t.slice(0, 5).reduce((a, b) => a + b) / 5 : Infinity; };
      res.slice(2, 4).forEach((r, i) => pool.push({ team: r.team, league: lg, place: i + 3, score: r.score,
        margin: r.score - res[1].score, margin2: r.score - (res[0].score + res[1].score) / 2,
        avg5: avg5(r.team), ddate: (meta.meets[cfg.districts[lg]] || {}).date }));
    }
    const stateTeams = truth.state[g].map(r => r.team);
    const picks = new Set(stateTeams.filter(t => !auto.has(t)));
    const k = picks.size;
    const outside = [...picks].filter(t => !pool.some(p => p.team === t));

    // head-to-head before each team's district meet (the earlier of the pair's two)
    const byMeet = {};
    for (const r of rows) {
      if (r.g !== g || districtIds.has(r.mid) || r.mid === cfg.state) continue;
      const d = (meta.meets[r.mid] || {}).date; if (!d || d < Y + '-08-15') continue;
      if (r.div && !isVarsity(r.div) && !/^5,000 Meters$/.test(r.div)) continue;
      const m = byMeet[r.mid] = byMeet[r.mid] || { date: d, teams: {} };
      (m.teams[r.school] = m.teams[r.school] || []).push(r);
    }
    const meetings = {};   // "A|B" -> [{days, res}] from A's side
    let pairs = 0, met = 0, sameDayOnly = 0;
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i], B = pool[j];
      if (A.league === B.league) continue;            // decided at the district meet
      pairs++;
      const cut = A.ddate < B.ddate ? A.ddate : B.ddate;
      const list = []; let sameDay = false;
      for (const m of Object.values(byMeet)) {
        if (m.date >= cut || !m.teams[A.team] || !m.teams[B.team]) continue;
        const a = leadChain(m.teams[A.team]), b = leadChain(m.teams[B.team]);
        if (a.length < 5 || b.length < 5) continue;
        sameDay = true;
        if (!sameRace(a, b)) continue;
        const res = dual(a.map(r => r.s), b.map(r => r.s));
        if (res !== null) list.push({ days: days(m.date, cut), res });
      }
      if (list.length) met++; else if (sameDay) sameDayOnly++;
      meetings[A.team + '|' + B.team] = list;
      meetings[B.team + '|' + A.team] = list.map(x => ({ days: x.days, res: 1 - x.res }));
    }
    const H = (A, B, tau) => {
      const l = meetings[A.team + '|' + B.team]; if (!l || !l.length) return null;
      let w = 0, s = 0; for (const x of l) { const wt = tau === Infinity ? 1 : Math.exp(-x.days / tau); w += wt; s += wt * x.res; }
      return s / w;
    };
    boards.push({ Y, g, pool, picks, k, outside, H, pairs, met, sameDayOnly, rand: randomHits(pool, k, picks) });
  }
}

// ---- methods ----
function borda(b, Tfn, w, tau) {
  const sc = new Map();
  for (const A of b.pool) { let s = 0;
    for (const B of b.pool) { if (A === B) continue;
      const T = Tfn(A, B);
      const h = A.league === B.league ? null : b.H(A, B, tau);
      s += (1 - w) * T + w * (h === null ? T : h); }
    sc.set(A.team, s); }
  return t => sc.get(t.team);
}
const Tavg = (A, B) => logistic((B.avg5 - A.avg5) / 10);
const Tmar = (A, B) => logistic((B.margin - A.margin) / 10);

const methods = [
  ['a  avg5', () => t => -t.avg5],
  ['b  margin vs 2nd', () => t => -t.margin],
  ['b2 margin vs auto mean', () => t => -t.margin2],
];
for (const tau of TAUS) for (const w of BLENDS)
  methods.push([`c  avg5+h2h w=${w} tau=${tau === Infinity ? 'inf' : tau}`, b => borda(b, Tavg, w, tau)]);
for (const tau of [14, Infinity]) for (const w of [0, 0.5, 1])
  methods.push([`d  margin+h2h w=${w} tau=${tau === Infinity ? 'inf' : tau}`, b => borda(b, Tmar, w, tau)]);

const hits = methods.map(([name, mk]) => ({ name, per: boards.map(b => {
  const s = select(b.pool, b.k, mk(b)); return [...s].filter(t => b.picks.has(t)).length; }) }));

console.log('board    pool berths  pairs met sameDayOnly  random  actual picks');
for (const b of boards) console.log(`${b.Y} ${b.g}   ${String(b.pool.length).padStart(4)} ${String(b.k).padStart(6)}  ${String(b.pairs).padStart(5)} ${String(b.met).padStart(3)} ${String(b.sameDayOnly).padStart(11)}  ${b.rand.toFixed(2).padStart(6)}  ${[...b.picks].map(t => { const p = b.pool.find(x => x.team === t); return t + (p ? ' (' + p.place + ')' : ' (NOT IN POOL)'); }).join(', ')}`);
const K = boards.reduce((a, b) => a + b.k, 0);
console.log(`\ntotal at-large picks ${K}; random committee ${boards.reduce((a, b) => a + b.rand, 0).toFixed(1)}\n`);
const base = hits[0].per;
console.log('method'.padEnd(36) + boards.map(b => b.Y.slice(2) + b.g).join('  ') + '  total  vs a (+/-)');
for (const h of hits) {
  const tot = h.per.reduce((a, b) => a + b, 0);
  const better = h.per.filter((x, i) => x > base[i]).length, worse = h.per.filter((x, i) => x < base[i]).length;
  console.log(h.name.padEnd(36) + h.per.map(x => String(x).padStart(4)).join(' ') + '   ' + String(tot).padStart(3) + `    ${better}/${worse}`);
}
if (process.argv.includes('--detail')) for (const b of boards) {
  console.log(`\n${b.Y} ${b.g}`);
  for (const t of b.pool.slice().sort((x, y) => x.avg5 - y.avg5))
    console.log(`  ${(b.picks.has(t.team) ? '*' : ' ')} ${t.team.padEnd(22)} ${t.league.padEnd(26)} ${t.place}  avg5 ${t.avg5.toFixed(1)}  margin ${t.margin}`);
}
