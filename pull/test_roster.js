// node pull/test_roster.js
//
// Two halves, and the second is the one that matters.
//
// The first is ordinary unit work on the pure functions: grade parsing, the
// school-year convention, the pace bounds, the class-year vote.
//
// The second replays the nineteen athletes whose four years were built by hand
// in TRUST Plan Data, years before any of this existed, and asks whether the
// inference lands on the same people and the same times. A grad-year inference
// that is quietly off by one produces a retention figure that looks completely
// reasonable and is wrong, so it needs checking against an answer somebody
// already knew.
//
// No network. It reads the committed pull/roster/t284_*.csv.
const fs = require('fs');
const path = require('path');
const R = require('./roster.js');
const Seed = require('./seed.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' — got ' + a + ', wanted ' + b);

/* ---------- grade ---------- */
eq(R.gradeOf('9'), 9, 'grade 9 parses');
eq(R.gradeOf(12), 12, 'a number parses');
eq(R.gradeOf('11th'), 11, 'an ordinal parses');
eq(R.gradeOf(''), null, 'a blank grade is null, not zero');
eq(R.gradeOf('8'), null, 'middle school is not a high school grade');
eq(R.gradeOf('Open'), null, 'an unparseable grade is null');

/* ---------- the school year, which is the off-by-one ----------
   A cross country season labelled 2015 is the autumn of 2015-16, so its
   seniors are the class of 2016. A track season labelled 2016 is the spring of
   the same school year and its seniors are also the class of 2016. */
eq(R.schoolYear(2015, 'xc'), 2016, 'an autumn season belongs to the following spring');
eq(R.schoolYear(2016, 'tfo'), 2016, 'a spring season belongs to its own year');
eq(R.classOf(2015, 'xc', 12), 2016, 'a senior in autumn 2015 graduates in 2016');
eq(R.classOf(2016, 'tfo', 12), 2016, 'and so does a senior in spring 2016');
eq(R.classOf(2013, 'xc', 10), 2016, 'a sophomore in autumn 2013 is the same class');
ok(R.classOf(2015, 'xc', 12) === R.classOf(2016, 'tfo', 12),
  'the two sports agree about who graduates together');

/* ---------- reading a grid row ---------- */
const row = (o) => R.gridRow(Object.assign({
  IDAthlete: 1, FirstName: 'A', LastName: 'B', GenderID: 'M',
  ShortDesc: '10', Place: 3, Distance: 5000, SortValue: 1000, MeetID: 7,
}, o), 2015, 'xc');
ok(row({}), 'a plain row survives');
eq(row({}).seconds, 1000, 'SortValue is already seconds');
ok(!row({ SortValue: 999999 }), 'the scratch sentinel is dropped');
ok(!row({ SortValue: 0 }), 'a zero time is dropped');
ok(!row({ Distance: 0 }), 'a row with no distance is dropped');
ok(row({ Distance: 3000, SortValue: 560 }), 'a 3,000m race is kept, not filtered away');
ok(!row({ Distance: 5000, SortValue: 600 }), 'a 5,000m in ten minutes is implausible');
ok(!row({ Distance: 5000, SortValue: 3700 }), 'and so is one in over an hour');

// one pace bound cannot serve both ends; the rec() cases are below, with rec
ok(R.paceBounds(100)[0] < R.paceBounds(5000)[0], 'a sprint is allowed to be faster per metre');
eq(row({ ShortDesc: '' }).grade, null, 'a blank grade survives as null');

/* The one untrusted input. roster.js must not restate the rule - it has to
   call the same function the seed does, or the two drift and only one of them
   is covered by a test firing payloads at it. */
eq(row({ FirstName: 'Ben <img src=x>', LastName: 'O"Neill' }).first, 'Ben img src=x',
  'markup is stripped out of a name at ingest');
eq(row({ FirstName: "Sean", LastName: "O'Brien" }).last, "O'Brien",
  'an apostrophe survives, because it is a real name');
const src = fs.readFileSync(path.join(__dirname, 'roster.js'), 'utf8');
ok(/Seed\.cleanName/.test(src), 'roster.js calls the shared sanitiser');
ok(!/\[",<>&\]/.test(src), 'and does not keep its own copy of the rule');
ok(typeof Seed.cleanName === 'function', 'which seed.js exports');

/* ---------- track ----------
   A different endpoint with a different shape: season bests per athlete per
   event, SortInt in milliseconds, and field marks in the same array. */
eq(R.eventMetres('1500 Meters'), 1500, 'a flat running event gives its distance');
eq(R.eventMetres('3,000 Meters'), 3000, 'and survives a thousands comma');
eq(R.eventMetres('300m Hurdles'), 0, 'hurdles are not on the same ruler as a flat run');
eq(R.eventMetres('Shot Put'), 0, 'and a throw is not a run at all');
eq(R.eventMetres('4x400 Relay'), 0, 'nor is a relay leg');

const rec = (o) => R.recordRow(Object.assign({
  IDAthlete: 5, FirstName: 'A', LastName: 'B', GenderID: 'M', GradeID: 10,
  Event: '1500 Meters', Type: 'T', SortInt: 259540, IDMeet: 9,
  MeetName: 'District', EndDate: '2014-05-16T00:00:00',
}, o), 2014);
ok(rec({}), 'a track mark survives');
eq(rec({}).seconds, 259.54, 'SortInt is milliseconds, not seconds');
eq(rec({}).dist, 1500, 'the distance comes out of the event name');
eq(rec({}).date, '2014-05-16', 'and the date off EndDate');
eq(rec({}).sport, 'tfo', 'tagged as outdoor track');
ok(!rec({ Type: 'F', Event: 'Shot Put', SortInt: 12000 }),
  'a field mark is dropped — SortInt there is a distance, and 12 metres would '
  + 'otherwise land on the board as a 12 second race');
ok(!rec({ Event: '300m Hurdles', SortInt: 42000 }), 'so are hurdles');
eq(rec({ GradeID: 99 }).grade, null, 'grade 99 means unknown, not year 99');
eq(rec({}).place, null, 'a season best has no finishing place');

/* Loose enough for a ten second 100m is loose enough for a nine minute
   5,000m, which is two minutes inside the world record - hence two regimes. */
ok(!rec({ Event: '5,000 Meters', SortInt: 600000 }), 'a nine minute 5,000m is refused');
ok(rec({ Event: '100 Meters', SortInt: 11200 }), 'while an 11.2 second 100m is fine');
ok(!rec({ Event: '100 Meters', SortInt: 8000 }), 'and an eight second one is not');

/* Both sports have to agree about who graduates together, or a track season
   and a cross country season file the same athlete in two cohorts. */
eq(R.classOf(2013, 'tfo', 9), 2016, 'a freshman in spring 2013 is class of 2016');
eq(R.classOf(2013, 'xc', 10), 2016, 'and so is a sophomore that autumn');

/* ---------- the class-year vote ---------- */
const mk = (id, season, grade, extra) => Object.assign({
  athleteId: id, first: 'A', last: 'B', gender: 'M', grade,
  dist: 5000, seconds: 1000, meetId: 'm' + season, season, sport: 'xc', place: 1,
}, extra);

let A = R.buildAthletes([mk(1, 2013, 10), mk(1, 2014, 11), mk(1, 2015, 12)]);
eq(A.get(1).classOf, 2016, 'three agreeing seasons give one class year');
eq(A.get(1).classOfConflict, false, 'and no conflict');

A = R.buildAthletes([mk(2, 2013, 10), mk(2, 2013, 10), mk(2, 2013, 10), mk(2, 2014, 9)]);
eq(A.get(2).classOf, 2016, 'the modal answer wins a disagreement');
eq(A.get(2).classOfConflict, true, 'but the disagreement is recorded, not hidden');

A = R.buildAthletes([mk(3, 2013, null)]);
eq(A.get(3).classOf, null, 'an athlete with no graded result has no class year');

/* ---------- where an athlete came in ----------
   The two branches look identical from one athlete's own rows, which is the
   whole reason this is reconciled against the team. */
const fresh = (season, n) => Array.from({ length: n }, (_, i) => mk(100 + i, season, 9));

let rows = [...fresh(2012, 12), mk(9, 2013, 10), mk(9, 2014, 11)];
let ath = R.entryOf(R.buildAthletes(rows), rows);
eq(ath.get(9).entry, 'late-entry',
  'first seen in grade 10 in a year the school did post freshmen is a real late entry');

rows = [mk(9, 2013, 10), mk(9, 2014, 11)];
ath = R.entryOf(R.buildAthletes(rows), rows);
eq(ath.get(9).entry, 'unknown-gap',
  'the same athlete where no freshmen were posted is unknown, not late');

rows = [...fresh(2012, 12), mk(9, 2012, 9), mk(9, 2013, 10)];
ath = R.entryOf(R.buildAthletes(rows), rows);
eq(ath.get(9).entry, 'observed', 'a freshman year that is there is simply observed');

/* A cohort counts freshman entries and nothing else. Anyone whose entry could
   not be established is out of both halves of the fraction rather than
   guessed into one of them. */
rows = [mk(1, 2012, 9), mk(1, 2015, 12), mk(2, 2012, 9), mk(3, 2013, 10), mk(3, 2015, 12)];
// filler so 2012 counts as a season the school posted freshmen in; a different
// gender so it lands in a different cohort than the one being asserted
rows.push(...fresh(2012, 12).map(r => ({ ...r, gender: 'F' })));
let ath2 = R.entryOf(R.buildAthletes(rows), rows);
let C = R.cohorts(ath2, R.buildSeasons(rows, ath2));
const c16 = C.get('2016|M');
eq(c16.entered, 2, 'a late entry is not in the freshman cohort');
eq(c16.g12, 1, 'one of the two was still there as a senior');
eq(Math.round(c16.completion * 100), 50, 'which is 50% completion');

/* The grade a cohort counts is the derived one, off the athlete-season, not
   the grade a result happened to carry. Somebody can race their whole senior
   autumn with the grade field left blank on every row, and counting the raw
   field would file them as having left. It is worth one athlete in Tualatin's
   boys, which is the difference between 42% and 43%. */
rows = [mk(1, 2012, 9), mk(1, 2015, null), mk(2, 2012, 9)];
rows.push(...fresh(2012, 12).map(r => ({ ...r, gender: 'F' })));
ath2 = R.entryOf(R.buildAthletes(rows), rows);
C = R.cohorts(ath2, R.buildSeasons(rows, ath2));
eq(C.get('2016|M').g12, 1, 'a senior season with no grade on it still counts as a senior season');

/* ---------- the committed pull ---------- */
const DIR = path.join(__dirname, 'roster');
const read = f => {
  const L = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const h = L[0].split(',');
  return L.slice(1).map(l => {
    const c = l.split(',');
    return Object.fromEntries(h.map((k, i) => [k, c[i]]));
  });
};
const athletes = read('t284_athletes.csv');
const seasons = read('t284_seasons.csv');
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 't284_meets.json'), 'utf8'));

// non-vacuous: none of what follows means anything against an empty file
ok(athletes.length > 1400, 'the committed pull holds a real roster — ' + athletes.length + ' athletes');
ok(seasons.length > 3000, 'and real athlete-seasons — ' + seasons.length);
ok(seasons.some(s => s.sport === 'xc') && seasons.some(s => s.sport === 'tfo'),
  'from both sports');
ok(seasons.some(s => s.best1500), 'with track distances of their own');
eq(meta.horizon, R.FIRST_SEASON, 'the horizon is recorded beside the data');

const disputed = athletes.filter(a => a.classOfConflict === '1');
ok(disputed.length / athletes.length < 0.02,
  'class year is unambiguous for almost everyone — ' + disputed.length
  + ' of ' + athletes.length + ' disputed');

const byName = new Map(athletes.map(a => [(a.first + ' ' + a.last).toLowerCase(), a]));
const best = new Map();                   // athleteId -> grade -> best cross country 5k
for (const s of seasons) {
  if (s.sport !== 'xc' || !s.best5000 || !s.grade) continue;
  if (!best.has(s.athleteId)) best.set(s.athleteId, {});
  best.get(s.athleteId)[s.grade] = +s.best5000;
}
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ---------- the nineteen ----------
   Boys carry times in the hand-built sheet, so those are checked to the
   second. Girls carry only VDOTs there, so they are checked for identity and
   class year rather than being given a number the sheet never held. */
const TRUST = [
  ['Caleb Lakeman', { 9: '17:38', 10: '16:27', 11: '16:00', 12: '14:50' }],
  ['Andrew Payton', { 9: '16:06', 10: '15:59', 11: '15:41', 12: '15:21' }],
  ['Adam Klein', { 9: '16:29', 10: '15:55', 11: '15:22', 12: '15:34' }],
  ['Aaron Lakeman', { 9: '16:55', 10: '15:48', 11: '15:26', 12: '16:12' }],
  ['Mark French', { 10: '16:49', 11: '15:50', 12: '15:29' }],
  ['Kevin Oliver', { 9: '17:57', 10: '17:29', 11: '16:23', 12: '15:43' }],
  ['Nathan Love', { 9: '18:13', 10: '16:37', 11: '16:08', 12: '16:04' }],
  ['Alex Ehrhart', { 9: '18:51', 10: '17:09', 11: '16:14', 12: '16:05' }],
  ['Matthew Lovos', { 9: '17:19', 10: '16:32', 11: '16:05', 12: '16:27' }],
  ['Kaitlyn Gearin', null], ['Kate Intile', null], ['Emily Wheeler', null],
  ['Mahathi Sridhar', null], ['Karys Gates', null], ['Melissa Arndorfer', null],
  ['Devon Frazier', null], ['Lauren Morris', null],
];
for (const [name, times] of TRUST) {
  const a = byName.get(name.toLowerCase());
  if (!ok(a, name + ' is in the pull')) continue;
  ok(a.classOfConflict === '0', name + ' has an undisputed class year');
  if (!times) continue;
  const b = best.get(a.athleteId) || {};
  for (const g of Object.keys(times)) {
    eq(b[g] ? mmss(b[g]) : 'missing', times[g], name + ', grade ' + g);
  }
}

/* The sheet spells her Arndofer. athletic.net spells her Arndorfer, and
   athletic.net is the one with the results, so the alias goes that way round -
   the same rule the poll and the seed both had to learn. */
ok(!byName.has('melissa arndofer'), 'the sheet\'s spelling is not what the database holds');

/* Meghan Peyton was the one athlete of the nineteen cross country could not
   find at all, and adding track found her: two marks in the spring of 2004,
   which is the first season athletic.net has for this school. She is
   unknown-gap rather than observed, correctly - 2004 carries almost no
   freshman results, so there is no evidence either way about how she started.

   This is the horizon working rather than a bug, and it is the argument for
   both sports in one sentence: a record built on autumns alone is missing
   every athlete whose season was a spring. */
const mp = byName.get('meghan peyton');
ok(mp, 'Meghan Peyton is in the pull once track is included');
eq(mp.classOf, '2004', 'class of 2004, at the very edge of coverage');
eq(mp.entry, 'unknown-gap', 'and her entry is unknown rather than guessed');

/* ---------- the two who looked like late entries, and were not ----------
   With cross country alone both first appear in grade 10, and the
   reconciliation correctly called them late entries: the school had posted
   freshmen in the season they would have been one.

   Adding track moved them. Both ran their freshman spring, so they entered in
   grade 9 after all and had simply skipped one autumn. The hand-built
   four-year table in TRUST Plan Data was right about them all along, and the
   freshman marks it carried came from track rather than from nowhere.

   Worth a test because it is the argument for pulling both sports stated as an
   assertion: a cohort built on one season a year gets entry wrong for anybody
   who starts in the other one. */
for (const n of ['Mark French', 'Kaitlyn Gearin']) {
  const a = byName.get(n.toLowerCase());
  eq(a.entryGrade, '9', n + ' entered in grade 9 once track is in');
  eq(a.entry, 'observed', n + ' was observed as a freshman, not inferred as a late entry');
}
const frTf = seasons.filter(s => s.athleteId === byName.get('mark french').athleteId
  && s.sport === 'tfo' && s.grade === '9');
eq(frTf.length, 1, 'and the freshman year that was missing is a track season');
ok(+frTf[0].best1500 > 0 && +frTf[0].best3000 > 0,
  'carrying a 1500 and a 3000 on a flat oval, which is the clean ruler');
eq(byName.get('caleb lakeman').classOf, '2022', 'a four-year athlete graduates when he did');
eq(byName.get('mark french').classOf, '2016', 'and a senior in autumn 2015 is class of 2016');

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
