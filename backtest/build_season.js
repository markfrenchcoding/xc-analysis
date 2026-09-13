// Turns a raw season pull into the two compact artifacts the backtest needs:
//   data/<year>-truth.json  league alignment, district results, state result, berth counts
//   data/<year>-seed.csv    the marks database as it stood on the cutoff date
//
// The raw pulls are large and are not kept in the repo; see CLAUDE.md for how to
// re-pull a season. Usage:  node build_season.js 2025 [rawDir]
const fs = require('fs');
const path = require('path');

const YEAR = process.argv[2];
const RAW = process.argv[3] || path.join(__dirname, 'raw');
if (!YEAR) { console.error('usage: node build_season.js <year> [rawDir]'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'))[YEAR];
if (!cfg) { console.error('no seasons.json entry for ' + YEAR); process.exit(1); }

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const fmt = s => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
const esc = v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'y' + YEAR + '_meta.json'), 'utf8'));
const rows = fs.readFileSync(path.join(RAW, 'y' + YEAR + '_raw.csv'), 'utf8').trim()
  .split(/\r?\n/).slice(1).map(split)
  .map(c => ({ aid: c[0], name: c[1] + ' ' + c[2], grade: c[3], school: c[5],
               g: c[6], dist: +c[7], s: +c[8], mid: c[9], divName: c[11] }));

// NFHS scoring over a raw result list, mirroring scoreMeet: top five score,
// six and seven displace, a team that cannot field five is removed first.
function score(list) {
  const byTeam = {};
  list.slice().sort((a, b) => a.s - b.s).forEach(r => { (byTeam[r.school] = byTeam[r.school] || []).push(r); });
  const elig = new Set(Object.entries(byTeam).filter(([, v]) => v.length >= 5).map(([k]) => k));
  const field = list.filter(r => elig.has(r.school)).sort((a, b) => a.s - b.s);
  const seen = {}, res = {};
  let place = 0;
  for (const r of field) {
    seen[r.school] = (seen[r.school] || 0) + 1;
    if (seen[r.school] > 7) continue;
    place++;
    if (seen[r.school] <= 5) { res[r.school] = res[r.school] || { tot: 0, n: 0, sixth: null }; res[r.school].tot += place; res[r.school].n++; }
    else if (seen[r.school] === 6) res[r.school].sixth = place;
  }
  return Object.entries(res).filter(([, v]) => v.n === 5)
    .map(([k, v]) => ({ team: k, score: v.tot, sixth: v.sixth }))
    .sort((a, b) => a.score - b.score || ((a.sixth ?? 1e9) - (b.sixth ?? 1e9)));
}

const truth = { year: +YEAR, cutoffs: cfg.cutoffs, leagues: { M: {}, F: {} },
                districts: { M: {}, F: {} }, state: { M: [], F: [] }, berths: {} };

for (const [league, mid] of Object.entries(cfg.districts)) {
  for (const g of ['M', 'F']) {
    const varsity = rows.filter(r => r.mid === mid && r.g === g && /Varsity/i.test(r.divName));
    if (!varsity.length) continue;
    truth.leagues[g][league] = [...new Set(varsity.map(r => r.school))].sort();
    truth.districts[g][league] = score(varsity);
  }
}
for (const g of ['M', 'F']) {
  const st = rows.filter(r => r.mid === cfg.state && r.g === g && /6A/.test(r.divName));
  const cnt = {}; st.forEach(r => cnt[r.school] = (cnt[r.school] || 0) + 1);

  // Telling a qualifying team from a cluster of individual qualifiers.
  // OSAA advances any individual in the district's top 14 who is not on a
  // qualifying team, so a strong third-place squad can send five runners
  // without holding a team berth - 2024 Sprague did exactly that. Six or more
  // is always a team; exactly five is a team only if those five were not all
  // inside their own district's top 14.
  const leagueOf = {};
  for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => leagueOf[t] = cfg.districts[l]);
  const isTeam = school => {
    const n = cnt[school];
    if (n >= 6) return true;
    if (n < 5) return false;
    const mid = leagueOf[school];
    if (!mid) return true;                       // no district found; keep it
    const d = rows.filter(r => r.mid === mid && r.g === g && /Varsity/i.test(r.divName))
                  .sort((a, b) => a.s - b.s);
    const place = {}; d.forEach((r, i) => place[r.aid] = i + 1);
    const theirs = st.filter(r => r.school === school).map(r => place[r.aid]).filter(Boolean);
    if (theirs.length < 5) return true;
    return !theirs.every(p => p <= 14);
  };
  const full = new Set(Object.keys(cnt).filter(isTeam));
  truth.state[g] = score(st.filter(r => full.has(r.school)));
  const nLeagues = Object.keys(truth.leagues[g]).length;
  truth.berths[g] = { total: truth.state[g].length, leagues: nLeagues,
                      auto: 2, atLarge: truth.state[g].length - 2 * nLeagues };
}

// the marks database as of the cutoff, built exactly the way index.html builds its seed
function seedFor(g, CUTOFF) {
  const members = new Set();
  for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => members.add(t));
  const info = rows.filter(r => r.g === g && members.has(r.school)
    && !(cfg.exclude || []).includes(r.mid)
    && (meta.meets[r.mid] || {}).date <= CUTOFF);
  const ath = new Map(), seen = new Set();
  for (const r of info) {
    const pk = `${r.aid}|${r.mid}|${r.dist}|${r.s}`; if (seen.has(pk)) continue; seen.add(pk);
    const k = `${r.aid}|${r.dist}`;
    if (!ath.has(k)) ath.set(k, { name: r.name, grade: r.grade, school: r.school, dist: r.dist, marks: [] });
    ath.get(k).marks.push(r.s);
  }
  for (const a of ath.values()) { a.marks.sort((x, y) => x - y); a.marks = a.marks.slice(0, 3); a.sb = a.marks[0]; }
  const board = new Map();
  for (const a of ath.values()) { const b = `${a.school}|${a.dist}`; if (!board.has(b)) board.set(b, []); board.get(b).push(a); }
  const kept = [];
  for (const list of board.values()) { list.sort((p, q) => p.sb - q.sb); kept.push(...list.slice(0, 7)); }
  return kept;
}

const outDir = path.join(__dirname, "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, YEAR + "-truth.json"), JSON.stringify(truth, null, 1));

console.log(YEAR + ":");
for (const g of ["M", "F"]) {
  const b = truth.berths[g];
  console.log("  " + (g === "M" ? "boys " : "girls") + ": " + Object.keys(truth.leagues[g]).length
    + " leagues, " + b.total + " at state = " + (b.auto * b.leagues) + " auto + " + b.atLarge + " at-large");
}
for (const CUTOFF of cfg.cutoffs) {
  const lines = ["gender,athlete,mark,grade,team,dist"];
  let athletes = 0, multi = 0;
  for (const g of ["M", "F"]) {
    const kept = seedFor(g, CUTOFF);
    athletes += kept.length;
    multi += kept.filter(a => a.marks.length > 1).length;
    for (const a of kept) for (const m of a.marks)
      lines.push([g, a.name, fmt(m), a.grade, a.school, a.dist].map(esc).join(","));
  }
  fs.writeFileSync(path.join(outDir, YEAR + "-seed-" + CUTOFF + ".csv"), lines.join("\n") + "\n");
  console.log("  " + CUTOFF + ": " + athletes + " athletes, " + (lines.length - 1) + " marks, "
    + (100 * multi / athletes).toFixed(0) + "% with more than one");
}
