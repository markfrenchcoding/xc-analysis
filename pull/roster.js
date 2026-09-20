// node pull/roster.js [teamId] [--from YYYY] [--to YYYY] [--name "Tualatin"]
//
// One school's whole history, athlete by athlete, season by season.
//
// The seed answers "how fast is this team now". This answers "what happens to
// somebody who joins it", which needs the opposite shape: every athlete who
// ever appeared, including the ones who left, rather than each team's fastest
// twelve this year. Retention, four-year progression and the development
// residual are all group-bys on the seasons table this writes.
//
// ONE REQUEST A SEASON
//
//   TeamHome/GetResultsGrid?teamId=N&seasonId=YYYY
//
// returns a team's entire season - every result, not just bests - with the
// athlete id on each row and a meets[] array carrying the dates. Twenty-two
// seasons of Tualatin is twenty-two GETs and about twenty seconds. It is a
// plain GET on a different budget from the results POST that is limited to
// about ten requests in ten seconds, which is why this can be paced at
// GAP_GET rather than at two seconds.
//
// It goes through curl for the reason set out in pull/crawl.js: from this
// address Node's own fetch is challenged and curl is served.
//
// CROSS COUNTRY ONLY, FOR NOW
//
// The grid ignores its sport parameter - ?sport=tfo returns the identical
// cross country payload - so track needs a different route and is not here
// yet. Two things found while looking, worth not rediscovering:
//
//   - the valid codes are tfo and tfi, not tf or track
//   - division ids are PER SPORT. 87377 is Oregon in cross country and
//     Northern Ohio in track, so Seed.OREGON_DIV must not be reused across
//     sports. That fails silently, with a full plausible answer.
//
// The track roster does come back from TeamHome/GetAthletes?seasonId=YYYY
// given the team's jwtTeamHome for sport=tfo. Results appear to be per
// athlete rather than per team, which would be ~150 requests a season.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Seed = require('./seed.js');

const API = 'https://www.athletic.net/api/v1/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const GAP_GET = 700, TRIES = 4;

// athletic.net's Tualatin coverage thins out before this and stops entirely
// before 2004. An "all-time" board that is silently a "since 2005" board is
// the same failure as a stale DATA_DATE, so the horizon is recorded in the
// meets file and belongs on any page built from this.
const FIRST_SEASON = 2004;

/* Pace bounds as seconds per metre, so one rule covers 3,000m, 3,400m and
   5,000m alike. The 999999 scratch sentinel that lives in SortValue is what
   the upper bound is really for; the lower one would catch a mis-keyed
   distance. 0.140 s/m is 11:40 for 5,000m, comfortably under any high school
   result; 0.720 is 60:00. */
const MIN_PACE = 0.140, MAX_PACE = 0.720;

/* ---------- names ----------
   Keyed on the athlete id, never on the name, because names are not unique
   and do not hold still. Meghan Peyton ran here as Meghan Armstrong and
   changed her surname afterwards; a coach looking for her will type the name
   she uses now, and athletic.net will never have heard of it. She is not in
   this data at all - she predates 2004 - but the next one will be, and a
   name-keyed table would have quietly matched the wrong person or nobody.

   The value is the name to display. alsoKnownAs keeps whatever athletic.net
   said, so a search on either spelling finds the same athlete. */
const NAME_BY_ID = {
  // 0: { first: 'Meghan', last: 'Peyton' },
};

const log = (...a) => console.log(...a);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function curl(url) {
  const out = execFileSync('curl', ['-sS', '-m', '60', '-w', '\n%{http_code}',
    '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json, text/plain, */*', url],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  const i = out.lastIndexOf('\n');
  return { status: out.slice(i + 1).trim(), body: out.slice(0, i) };
}

function ask(url) {
  for (let i = 0; i < TRIES; i++) {
    try {
      const r = curl(url);
      if (r.status === '200') return JSON.parse(r.body);
      log('    status ' + r.status + ', retrying');
    } catch (e) {
      log('    ' + String(e.message).slice(0, 60) + ', retrying');
    }
    sleep(GAP_GET * (i + 2));
  }
  throw new Error('gave up on ' + url.replace(API, ''));
}

/* ---------- reading athletic.net ---------- */

// '9'..'12' -> 9..12, anything else -> null. The field arrives as ShortDesc on
// the grid and as Grade on the meet endpoint, and is blank often enough that
// it must never be assumed present.
function gradeOf(v) {
  const n = +String(v == null ? '' : v).replace(/\D/g, '');
  return n >= 9 && n <= 12 ? n : null;
}

/* A season year means different things in the two sports and getting it wrong
   is a silent off-by-one through every cohort.

   A cross country season labelled 2015 is the AUTUMN of the 2015-16 school
   year, so its seniors graduate in 2016. A track season labelled 2016 is the
   SPRING of that same school year, and its seniors also graduate in 2016.
   Both therefore belong to school year 2016, which is the year they can be
   joined on and the year a class is named after. */
const schoolYear = (year, sport) => +year + (sport === 'xc' ? 1 : 0);
const classOf = (year, sport, grade) => schoolYear(year, sport) + (12 - grade);

function gridRow(r, season, sport) {
  if (!(+r.SortValue > 0)) return null;
  const dist = +r.Distance || 0;
  if (!dist) return null;
  const sec = +r.SortValue;
  const pace = sec / dist;
  if (pace < MIN_PACE || pace > MAX_PACE) return null;
  return {
    athleteId: +r.IDAthlete || +r.AthleteID || 0,
    first: Seed.cleanName(r.FirstName),
    last: Seed.cleanName(r.LastName),
    gender: r.GenderID || r.Gender || '',
    grade: gradeOf(r.ShortDesc != null ? r.ShortDesc : r.Grade),
    place: +r.Place || null,
    dist, seconds: sec,
    meetId: String(r.MeetID || r.IDMeet || ''),
    season: +season, sport,
  };
}

/* ---------- the roster ---------- */

/* Every athlete who ever appeared, and what year they were in.

   classOf is INFERRED rather than read, because the per-result grade is
   patchy and a single odd row would otherwise move somebody into the wrong
   cohort. Every graded result votes; the modal answer wins; disagreement is
   recorded rather than resolved. On Tualatin's 22 seasons, 590 of 595
   athletes have one unambiguous answer and the other five are flagged.

   Never silently pick a winner here. A cohort quietly off by one is exactly
   the kind of wrong number that looks completely fine. */
function buildAthletes(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!r.athleteId) continue;
    let a = by.get(r.athleteId);
    if (!a) {
      a = {
        athleteId: r.athleteId, first: r.first, last: r.last, gender: r.gender,
        votes: new Map(), grades: new Set(), seasons: new Set(),
        firstSeason: r.season, lastSeason: r.season, n: 0,
      };
      by.set(r.athleteId, a);
    }
    a.n++;
    a.seasons.add(r.season);
    if (r.season < a.firstSeason) a.firstSeason = r.season;
    if (r.season > a.lastSeason) a.lastSeason = r.season;
    if (r.grade) {
      a.grades.add(r.grade);
      const c = classOf(r.season, r.sport, r.grade);
      a.votes.set(c, (a.votes.get(c) || 0) + 1);
    }
  }
  for (const a of by.values()) {
    const v = [...a.votes.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    a.classOf = v.length ? v[0][0] : null;
    a.classOfConflict = v.length > 1;
    a.classOfVotes = v.map(([c, n]) => c + ':' + n).join(' ');
    const alias = NAME_BY_ID[a.athleteId];
    a.alsoKnownAs = alias ? (a.first + ' ' + a.last).trim() : '';
    if (alias) { a.first = alias.first; a.last = alias.last; }
    a.name = (a.first + ' ' + a.last).trim();
  }
  return by;
}

/* ---------- where an athlete came in ----------

   The obvious rule - entry grade is the grade they first appear in - is wrong
   often enough to poison the denominator, because a missing freshman year and
   a genuine late entry look identical from one athlete's rows.

   So it is reconciled against the team: if somebody first appears in grade 10
   or later, ask whether the school posted ANY freshman results the season
   before. If it did, they really did join late. If it did not, that season's
   freshmen are simply not in the database and their entry grade is unknown,
   which is different from late and must not be counted as either.

   This is not hypothetical. Mark French and Kaitlyn Gearin both first appear
   in grade 10. Tualatin posted 79 freshman results in 2012 and 128 in 2016,
   so both are real late entries - which also means the freshman marks in the
   hand-built four-year table came from somewhere this data does not reach. */
function entryOf(athletes, rows) {
  const freshBySeason = new Map();       // season -> how many grade-9 results
  for (const r of rows) {
    if (r.grade === 9) freshBySeason.set(r.season, (freshBySeason.get(r.season) || 0) + 1);
  }
  // a season is only evidence of absence if the school posted freshmen in it
  const FRESH_MIN = 10;
  for (const a of athletes.values()) {
    const g = Math.min(...[...a.grades].filter(Boolean));
    if (!isFinite(g)) { a.entryGrade = null; a.entry = 'ungraded'; continue; }
    a.entryGrade = g;
    if (g === 9) { a.entry = 'observed'; continue; }
    // the season they would have been a freshman in
    const want = a.firstSeason - (g - 9);
    a.entry = (freshBySeason.get(want) || 0) >= FRESH_MIN ? 'late-entry' : 'unknown-gap';
  }
  return athletes;
}

/* ---------- athlete-seasons, which is where every statistic lives ----------
   Retention is a group-by on this. Development is a self-join year to year.
   The four-year curve is a pivot. Keeping bests per distance rather than one
   number is what lets a 3,000m season still say something. */
function buildSeasons(rows, athletes) {
  const by = new Map();
  for (const r of rows) {
    const a = athletes.get(r.athleteId);
    if (!a) continue;
    const sy = schoolYear(r.season, r.sport);
    const k = r.athleteId + '|' + sy + '|' + r.sport;
    let s = by.get(k);
    if (!s) {
      s = {
        athleteId: r.athleteId, schoolYear: sy, sport: r.sport,
        // the grade the cohort says they were in, not the grade a row claimed
        grade: a.classOf ? 12 - (a.classOf - sy) : null,
        nRaces: 0, best: {}, firstMeet: r.meetId, lastMeet: r.meetId,
      };
      by.set(k, s);
    }
    s.nRaces++;
    const b = s.best[r.dist];
    if (b == null || r.seconds < b) s.best[r.dist] = r.seconds;
  }
  for (const s of by.values()) {
    s.best5k = s.best[5000] == null ? null : s.best[5000];
    s.bestAny = Math.min(...Object.values(s.best));
  }
  return by;
}

/* Freshman-entry cohorts only. Somebody who joined in grade 11 is not a
   dropout from the class they graduate with, and folding them in is how a
   retention figure becomes meaningless. unknown-gap is excluded from both
   halves of the fraction rather than guessed at. */
function cohorts(athletes) {
  const out = new Map();
  for (const a of athletes.values()) {
    if (a.entry !== 'observed' || !a.classOf) continue;
    const k = a.classOf + '|' + a.gender;
    let c = out.get(k);
    if (!c) { c = { classOf: a.classOf, gender: a.gender, entered: 0, g10: 0, g11: 0, g12: 0 }; out.set(k, c); }
    c.entered++;
    if (a.grades.has(10)) c.g10++;
    if (a.grades.has(11)) c.g11++;
    if (a.grades.has(12)) c.g12++;
  }
  for (const c of out.values()) c.completion = c.entered ? c.g12 / c.entered : 0;
  return out;
}

/* ---------- writing ---------- */
const esc = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (head, rows) => [head.join(','),
  ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\n') + '\n';

function pull(teamId, from, to) {
  const rows = [], meets = {}, seen = new Set();
  const empty = [];
  for (let y = from; y <= to; y++) {
    let j;
    try { j = ask(API + 'TeamHome/GetResultsGrid?teamId=' + teamId + '&seasonId=' + y); }
    catch (e) { log('  ' + y + ': ' + e.message); empty.push(y); sleep(GAP_GET); continue; }
    for (const m of j.meets || []) {
      meets[m.IDMeet] = { date: String(m.StartDate || '').slice(0, 10), name: m.MeetName || '' };
    }
    let n = 0;
    for (const raw of j.results || []) {
      const r = gridRow(raw, y, 'xc');
      if (!r) continue;
      /* Nobody runs the same distance twice in one meet in the same hundredth
         of a second, so a repeat is the same race read twice. */
      const k = r.athleteId + '|' + r.meetId + '|' + r.dist + '|' + r.seconds;
      if (seen.has(k)) continue;
      seen.add(k);
      r.date = (meets[r.meetId] || {}).date || '';
      rows.push(r); n++;
    }
    log('  ' + y + '  ' + String(n).padStart(4) + ' results, ' + (j.meets || []).length + ' meets');
    if (!n) empty.push(y);
    sleep(GAP_GET);
  }
  return { rows, meets, empty };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
  const teamId = +(args.find(a => /^\d+$/.test(a)) || 284);      // 284 is Tualatin
  const from = +flag('--from', FIRST_SEASON);
  const to = +flag('--to', new Date().getFullYear());
  const label = flag('--name', 'team ' + teamId);

  const OUT = path.join(__dirname, 'roster');
  fs.mkdirSync(OUT, { recursive: true });
  const stem = path.join(OUT, 't' + teamId + '_');

  log('pulling ' + label + ' (team ' + teamId + '), ' + from + '-' + to);
  const { rows, meets, empty } = pull(teamId, from, to);

  const athletes = entryOf(buildAthletes(rows), rows);
  const seasons = buildSeasons(rows, athletes);
  const coh = cohorts(athletes);
  const conflict = [...athletes.values()].filter(a => a.classOfConflict);

  /* ---------- the guards ----------
     An unattended job that writes anyway is worse than one that fails, because
     the failure arrives as a quietly wrong dashboard rather than as an error.
     Same rule as crawl.js: exit 0 wrote, 2 refused, 3 nothing changed. */
  const prev = fs.existsSync(stem + 'results.csv')
    ? fs.readFileSync(stem + 'results.csv', 'utf8').split('\n').length - 2 : 0;
  const refuse = [];
  if (!rows.length) refuse.push('no results at all');
  if (prev && rows.length < prev * 0.9) {
    refuse.push('results fell from ' + prev + ' to ' + rows.length);
  }
  if (conflict.length > athletes.size * 0.05) {
    refuse.push(conflict.length + ' of ' + athletes.size + ' athletes have a disputed class year');
  }
  if (refuse.length) {
    log('\nREFUSING TO WRITE:');
    for (const r of refuse) log('  - ' + r);
    process.exit(2);
  }

  fs.writeFileSync(stem + 'results.csv', csv(
    ['athleteId', 'season', 'sport', 'date', 'dist', 'seconds', 'place', 'grade', 'meetId'],
    rows.map(r => ({ ...r, grade: r.grade || '' }))));

  fs.writeFileSync(stem + 'athletes.csv', csv(
    ['athleteId', 'first', 'last', 'alsoKnownAs', 'gender', 'classOf', 'classOfConflict',
      'classOfVotes', 'entryGrade', 'entry', 'firstSeason', 'lastSeason', 'nResults'],
    [...athletes.values()].sort((a, b) => a.classOf - b.classOf || a.last.localeCompare(b.last))
      .map(a => ({ ...a, classOfConflict: a.classOfConflict ? 1 : 0, nResults: a.n }))));

  fs.writeFileSync(stem + 'seasons.csv', csv(
    ['athleteId', 'schoolYear', 'sport', 'grade', 'nRaces', 'best5k', 'bestAny'],
    [...seasons.values()].sort((a, b) => a.athleteId - b.athleteId || a.schoolYear - b.schoolYear)));

  fs.writeFileSync(stem + 'meets.json', JSON.stringify({
    teamId, label, from, to, horizon: FIRST_SEASON,
    pulled: new Date().toISOString().slice(0, 10),
    emptySeasons: empty, meets,
  }, null, 2));

  const done = [...coh.values()].filter(c => c.classOf <= to);
  const sum = g => {
    const c = done.filter(x => x.gender === g);
    const e = c.reduce((s, x) => s + x.entered, 0), f = c.reduce((s, x) => s + x.g12, 0);
    return e ? f + '/' + e + ' = ' + Math.round(f / e * 100) + '%' : 'none';
  };
  log('\n  ' + rows.length + ' results, ' + athletes.size + ' athletes, '
    + seasons.size + ' athlete-seasons, ' + Object.keys(meets).length + ' meets');
  log('  class year disputed for ' + conflict.length + ' athlete'
    + (conflict.length === 1 ? '' : 's'));
  log('  entry: ' + ['observed', 'late-entry', 'unknown-gap', 'ungraded']
    .map(k => [...athletes.values()].filter(a => a.entry === k).length + ' ' + k).join(', '));
  log('  four-year completion   boys ' + sum('M') + '   girls ' + sum('F'));
  if (empty.length) log('  seasons with nothing: ' + empty.join(', '));
  log('\n  wrote ' + stem + '{results,athletes,seasons}.csv');
}

module.exports = {
  gradeOf, schoolYear, classOf, gridRow, buildAthletes, entryOf, buildSeasons,
  cohorts, csv, NAME_BY_ID, MIN_PACE, MAX_PACE, FIRST_SEASON,
};

if (require.main === module) main();
