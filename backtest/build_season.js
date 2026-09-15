// Turns a raw season pull into the two compact artifacts the backtest needs:
//   data/<year>-truth.json  league alignment, district results, state result, berth counts
//   data/<year>-seed.csv    the marks database as it stood on the cutoff date
//
// The raw pulls are large and are not kept in the repo; see CLAUDE.md for how to
// re-pull a season. Usage:  node build_season.js 2025 [rawDir]
const fs = require('fs');
const path = require('path');
const { fitCourses } = require('../fit_courses.js');

const YEAR = process.argv[2];
// argv[3] is an optional raw directory; flags must not be mistaken for one
const RAWARG = process.argv.slice(3).find(a => !a.startsWith('--'));
const RAW = RAWARG || path.join(__dirname, 'raw');
if (!YEAR) { console.error('usage: node build_season.js <year> [rawDir]'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'))[YEAR];

/* --common also writes a second set of seeds restricted to meets that recur
   across the seasons, so the years can be compared on a fixed information set
   rather than on whatever athletic.net happened to record that year. Generate
   the list with common_meets.js. Diagnostic only, and only from mid-October:
   see the note in that file for why September cannot be done this way. */
const COMMON = process.argv.includes('--common');

/* --xrule=NAME writes one more set of seeds with a named exclusion rule from
   exclusion_rules.js applied, so a reason for dropping meets can be measured
   rather than argued about. See exclusions.js. */
const XARG = (process.argv.find(a => a.startsWith('--xrule=')) || '').split('=')[1];
const XRULE = XARG ? require('./exclusion_rules.js')[XARG] : null;
if (XARG && !XRULE) { console.error('no exclusion rule called ' + XARG); process.exit(1); }
let COMMON_IDS = null;
if (COMMON) {
  const f = path.join(__dirname, 'common-meets.json');
  if (!fs.existsSync(f)) { console.error('run common_meets.js first'); process.exit(1); }
  COMMON_IDS = new Set(JSON.parse(fs.readFileSync(f, 'utf8')).meets[YEAR] || []);
}
if (!cfg) { console.error('no seasons.json entry for ' + YEAR); process.exit(1); }

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const fmt = s => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
const esc = v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'y' + YEAR + '_meta.json'), 'utf8'));
const SEASON_START = '-08-15';   // matches pull/seed.js
const rows = fs.readFileSync(path.join(RAW, 'y' + YEAR + '_raw.csv'), 'utf8').trim()
  .split(/\r?\n/).slice(1).map(split)
  .map(c => ({ aid: c[0], name: c[1] + ' ' + c[2], grade: c[3], school: c[5],
               g: c[6], dist: +c[7], s: +c[8], mid: c[9], divName: c[11] }))
  // 3,000m is not modelled: the state meet and every league championship are 5,000m
  .filter(r => r.dist === 5000)
  /* Summer is not the season, the same rule the live seed applies in
     pull/seed.js. athletic.net files the Steens Mountain camp's July uphill 5k
     under the season, and it is an uphill: 2022's 108 of them run from 21:19 to
     47:39. Twenty-six athletes had nothing else on their record at the
     September cutoff, so the model was asked to believe in a squad of
     twenty-five minute 6A runners - and September is the cutoff every published
     figure is quoted from. The backtest has to be fed by the same rule as the
     live board or it is not measuring the same model. */
  .filter(r => (meta.meets[r.mid] || {}).date >= YEAR + SEASON_START);

/* What a rule is allowed to know about a meet. Deliberately only things about
   the meet itself - never anything about how the model scores with it in. */
const meetStats = {};
for (const r of rows) {
  const s = meetStats[r.mid] = meetStats[r.mid]
    || { id: r.mid, name: (meta.meets[r.mid] || {}).name || '',
         date: (meta.meets[r.mid] || {}).date || '', finishers: 0, schools: new Set() };
  s.finishers++; s.schools.add(r.school);
}
for (const s of Object.values(meetStats)) s.schools = s.schools.size;

/* A district's varsity race, and not its junior varsity one.
   "Junior Varsity" contains "Varsity", and five of the seven districts spell it
   exactly that way, so the obvious /Varsity/i quietly folded the JV race into
   the district result. It did not look wrong: the winning score barely moves,
   because a team's five fastest are its varsity five either way. What moved was
   everything downstream - JV runners take places, so every score below the
   winner inflates, and a school that cannot field five varsity runners suddenly
   can. 2025 PIL was published as nine scoring teams when it had seven.
   Checked against athletic.net: with JV the committed result matched exactly,
   varsity-only differs from it, so every season built before this was wrong. */
const isVarsity = divName => /varsity/i.test(divName) && !/junior\s*varsity|\bjv\b/i.test(divName);

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

/* The state meet's own date, recorded so nothing downstream keeps a table of
   them. publish.js needs it to say how far out a cutoff was, and its hardcoded
   list produced NaN weeks the moment a fifth season was configured. */
const STATE_DATE = (meta.meets[cfg.state] || {}).date || '';

const truth = { year: +YEAR, stateDate: STATE_DATE, cutoffs: cfg.cutoffs, leagues: { M: {}, F: {} },
                districts: { M: {}, F: {} }, state: { M: [], F: [] }, berths: {} };

for (const [league, mid] of Object.entries(cfg.districts)) {
  for (const g of ['M', 'F']) {
    const varsity = rows.filter(r => r.mid === mid && r.g === g && isVarsity(r.divName));
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
    const d = rows.filter(r => r.mid === mid && r.g === g && isVarsity(r.divName))
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

// Course factors are fitted from the marks available AT THE CUTOFF and no
// later. Fitting them over the whole season would leak November into a
// September forecast and quietly flatter the backtest.
const courseCache = new Map();
function coursesAt(CUTOFF) {
  if (!courseCache.has(CUTOFF)) {
    const upto = rows.filter(r => !(cfg.exclude || []).includes(r.mid)
      && (meta.meets[r.mid] || {}).date <= CUTOFF);
    courseCache.set(CUTOFF, fitCourses(upto.map(r => ({ aid: r.aid, dist: r.dist, secs: r.s, mid: r.mid }))));
  }
  return courseCache.get(CUTOFF);
}

/* A rule may ask a meet's fitted difficulty. It is fitted from marks at the
   cutoff, like every other course number here, so no rule can see the future. */
let cfRule = null;
const cfForRule = mid => (cfRule ? cfRule.factorFor(mid, 5000) : 1);

// the marks database as of the cutoff, built exactly the way index.html builds its seed
function seedFor(g, CUTOFF, useCourse, onlyCommon, xrule) {
  const members = new Set();
  for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => members.add(t));
  const info = rows.filter(r => r.g === g && members.has(r.school)
    && !(cfg.exclude || []).includes(r.mid)
    && (meta.meets[r.mid] || {}).date <= CUTOFF
    && (!onlyCommon || COMMON_IDS.has(String(r.mid)))
    && !(xrule && xrule.test(Object.assign({ factor: cfForRule(r.mid) }, meetStats[r.mid]))));
  // with adjustment off every factor is 1, so ranking falls back to raw time
  // and the seed is byte-identical to the one built before this existed
  const cf = useCourse ? coursesAt(CUTOFF) : { factorFor: () => 1 };
  const ath = new Map(), seen = new Set();
  for (const r of info) {
    const pk = `${r.aid}|${r.mid}|${r.dist}|${r.s}`; if (seen.has(pk)) continue; seen.add(pk);
    const k = `${r.aid}|${r.dist}`;
    if (!ath.has(k)) ath.set(k, { name: r.name, grade: r.grade, school: r.school, dist: r.dist, marks: [] });
    const f = cf.factorFor(r.mid, r.dist);
    ath.get(k).marks.push({ raw: r.s, f, adj: r.s / f });
  }
  // rank and cut on the course-neutral value, which is what the model will use
  for (const a of ath.values()) {
    a.marks.sort((x, y) => x.adj - y.adj);
    a.marks = a.marks.slice(0, 3);
    a.sb = a.marks[0].adj;
  }
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
  // `course` carries the fitted difficulty of the race each mark came from.
  // Raw times stay in the file; the model divides. A seed without the column
  // still parses — every factor defaults to 1.
  const lines = ["gender,athlete,mark,grade,team,dist,course"];
  const plain = ["gender,athlete,mark,grade,team,dist"];
  let athletes = 0, multi = 0;
  for (const g of ["M", "F"]) {
    for (const a of seedFor(g, CUTOFF, true)) for (const m of a.marks)
      lines.push([g, a.name, fmt(m.raw), a.grade, a.school, a.dist, m.f.toFixed(3)].map(esc).join(","));
    const raw = seedFor(g, CUTOFF, false);
    athletes += raw.length;
    multi += raw.filter(a => a.marks.length > 1).length;
    for (const a of raw) for (const m of a.marks)
      plain.push([g, a.name, fmt(m.raw), a.grade, a.school, a.dist].map(esc).join(","));
  }
  fs.writeFileSync(path.join(outDir, YEAR + "-seed-" + CUTOFF + "-course.csv"), lines.join("\n") + "\n");
  fs.writeFileSync(path.join(outDir, YEAR + "-seed-" + CUTOFF + ".csv"), plain.join("\n") + "\n");

  /* The same cutoff restricted to meets that recur across the seasons. Named
     so lib.odds can read it by passing CUTOFF + "-common" as the cutoff, which
     needs no change there. */
  if (COMMON) {
    const c = ["gender,athlete,mark,grade,team,dist"];
    let n = 0, five = 0;
    for (const g of ["M", "F"]) {
      const rows = seedFor(g, CUTOFF, false, true);
      n += rows.length;
      const per = {};
      for (const a of rows) { (per[a.school] = per[a.school] || 0); per[a.school]++; }
      five += Object.values(per).filter(x => x >= 5).length;
      for (const a of rows) for (const m of a.marks)
        c.push([g, a.name, fmt(m.raw), a.grade, a.school, a.dist].map(esc).join(","));
    }
    fs.writeFileSync(path.join(outDir, YEAR + "-seed-" + CUTOFF + "-common.csv"), c.join("\n") + "\n");
    console.log("    common-meet only: " + n + " athletes, " + (c.length - 1) + " marks, "
      + five + " teams can field five");
  }
  /* The same cutoff with a named exclusion rule applied. Read back by passing
     CUTOFF + "-x" + rule as the cutoff to lib.odds, which needs no change. */
  if (XRULE) {
    cfRule = coursesAt(CUTOFF);
    const x = ["gender,athlete,mark,grade,team,dist"];
    let n = 0;
    for (const g of ["M", "F"]) {
      const rowsX = seedFor(g, CUTOFF, false, false, XRULE);
      n += rowsX.length;
      for (const a of rowsX) for (const m of a.marks)
        x.push([g, a.name, fmt(m.raw), a.grade, a.school, a.dist].map(esc).join(","));
    }
    cfRule = null;
    fs.writeFileSync(path.join(outDir, YEAR + "-seed-" + CUTOFF + "-x" + XARG + ".csv"),
      x.join("\n") + "\n");
    console.log("    " + XARG + ": " + n + " athletes, " + (x.length - 1) + " marks");
  }

  const cf = coursesAt(CUTOFF);
  console.log("  " + CUTOFF + ": " + athletes + " athletes, " + (lines.length - 1) + " marks, "
    + (100 * multi / athletes).toFixed(0) + "% with more than one"
    + "   courses " + cf.stats.placed + "/" + cf.stats.courses
    + ", spread " + cf.stats.spread.toFixed(3));
}
