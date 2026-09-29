// node pull/test_seed.js
//
// The crawl cannot be tested without the network, but the transformation can:
// feed the shipped seed back through the builder as if it had just come off
// athletic.net and the same rows have to come out. If a refresh ever silently
// drops half of 3A, this is what catches it.
const fs = require('fs');
const path = require('path');
const S = require('./seed.js');

const IDX = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(IDX, 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' — got ' + a + ', wanted ' + b);

/* ---------- the board, read out of the site's own CLASSES ---------- */
const { CLASSES, board } = S.parseClasses(html);
ok(Object.keys(CLASSES).length === 5, 'five classifications');
ok(Object.keys(board).length > 200, 'board covers the schools');

/* ---------- the shipped seed ---------- */
const raw = html.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/)[1].trim();
const lines = raw.split('\n');
const head = lines[0].split(',');
eq(head.join(','), 'gender,athlete,mark,grade,team,dist,class,race', 'header');

const rows = lines.slice(1).map(l => {
  const c = l.split(',');
  return { g: c[0], name: c[1], mark: c[2], grade: c[3], school: c[4], dist: +c[5], cls: c[6], race: +c[7] || 1 };
});
console.log(lines.length - 1 + ' rows in, ' + new Set(rows.map(r => r.school)).size + ' schools');

// every school on the seed resolves to a board — a miss here is a missing alias
const unresolved = [...new Set(rows.filter(r => !(board[S.key(r.school)] || {})[r.g])
  .map(r => r.school))];
ok(unresolved.length === 0, 'every seeded school is on a board; missing: ' + unresolved.join(', '));

/* ---------- fmt must round once ----------
   Flooring the minutes and then rounding the remainder lets the two halves
   disagree, and the seed shipped "20:60.00" for exactly that reason. The
   site's parseCSV refuses a seconds field of 60, so the athlete was dropped
   from the board without anything saying so. It is about one mark in six
   thousand, which is why it stayed latent until the seed passed eight
   thousand rows. Sweep the boundaries rather than pinning the one case that
   happened to bite. */
for (const s of [1259.9963, 1260, 599.999, 3599.999, 0, 963.95]) {
  const out = S.fmt(s);
  ok(!/:(\d{3}|60\.)/.test(out), 'fmt(' + s + ') carries into the minutes — got ' + out);
}
{
  let bad = 0;
  for (let c = 0; c <= 300000; c++) if (/:(\d{3}|60\.)/.test(S.fmt(c / 100))) bad++;
  eq(bad, 0, 'no seconds field of 60 across 50 minutes of hundredths');
}
/* Scoped to the seed block, not the file. The first version grepped the whole
   of index.html and failed the moment a snapshot's --why reason quoted the
   malformed mark it was written to explain. A test that reads more than the
   thing it is testing fails on prose. */
ok(!rows.some(r => /[0-9]:60\.[0-9][0-9]/.test(r.mark)),
  'the shipped seed carries no 60-second mark');

/* ---------- round trip ---------- */
const built = S.buildSeed(rows.map(r => ({ ...r, seconds: r.mark, date: '' })), board);
eq(built.dropped.dist, 0, 'nothing dropped for distance');
eq(built.dropped.unparsed, 0, 'every shipped mark parses');
eq(built.dropped.offBoard, 0, 'nothing falls off the board');
eq(built.rows, rows.length, 'row count survives the round trip');
eq(built.schools, new Set(rows.map(r => r.school)).size, 'school count survives');

// order is ours, so compare as sets: no row invented, none lost, none altered
const norm = a => a.map(x => [x.g, x.name, x.mark, x.grade, x.school, x.cls].join('|')).sort();
const after = built.csv.split('\n').slice(1).map(l => {
  const c = l.split(',');
  return { g: c[0], name: c[1], mark: c[2], grade: c[3], school: c[4], dist: +c[5], cls: c[6] };
});
const A = norm(rows), B = norm(after);
const missing = A.filter((x, i) => x !== B[i]);
ok(A.join('\n') === B.join('\n'), 'identical rows; first divergence: ' + (missing[0] || '-'));

/* ---------- the caps really cap ----------
   Per distance: a 3-mile mark never competes with a 5k one for a slot. */
const perAthlete = new Map(), perTeam = new Map();
for (const r of after) {
  const a = r.dist + '|' + r.cls + '|' + r.g + '|' + r.school + '|' + r.name;
  perAthlete.set(a, (perAthlete.get(a) || 0) + 1);
  const t = r.dist + '|' + r.cls + '|' + r.g + '|' + r.school;
  if (!perTeam.has(t)) perTeam.set(t, new Set());
  perTeam.get(t).add(r.name);
}
eq(Math.max(...perAthlete.values()), S.MARKS_PER_ATHLETE, 'at most three marks an athlete');
// the shipped seed was built under whatever cap was current, so this is a
// ceiling rather than an equality - raising the cap must not fail the round trip
ok(Math.max(...[...perTeam.values()].map(s => s.size)) <= S.ATHLETES_PER_TEAM,
   'no team is over the cap of ' + S.ATHLETES_PER_TEAM);
ok(after.every(r => !/[,"]/.test(r.name)), 'no commas or quotes in a name');

/* A stray quote is worse than a comma: the reader toggles quote mode on it, so
   one unmatched " swallows the rest of the line - mark, grade, team and class
   all folded into the name. athletic.net carries nicknames that way. */
const nick = S.buildSeed([
  { g:'M', name:'Benjamin "Finley" Crowell', school:'Jesuit', grade:'10', seconds:'16:00.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Stray " Quote', school:'Jesuit', grade:'10', seconds:'16:10.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:"Sean O'Brien", school:'Jesuit', grade:'11', seconds:'16:20.00', dist:5000, date:'2026-09-05' },
], board).csv.split('\n').slice(1).map(l => l.split(',')[1]);
eq(nick[0], 'Benjamin Finley Crowell', 'a nickname loses its quotes');
eq(nick[1], 'Stray Quote', 'an unmatched quote is removed too');
eq(nick[2], "Sean O'Brien", 'an apostrophe is left alone');

/* A name is the one piece of untrusted input in the whole system: it comes from
   athletic.net and ends up interpolated into innerHTML on five different
   boards. Nothing that can be read as markup may survive the pull. These are
   real payloads rather than a regex restated - the point is that the STRING
   coming out cannot open a tag or an entity, however it got in. */
const eviL = S.buildSeed([
  { g:'M', name:'<img src=x onerror=alert(1)>', school:'Jesuit', grade:'10', seconds:'16:00.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'</script><script>alert(1)</script>', school:'Jesuit', grade:'10', seconds:'16:01.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Amp &amp; Entity &#60;', school:'Jesuit', grade:'11', seconds:'16:02.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Tab\tand\u0000null', school:'Jesuit', grade:'11', seconds:'16:03.00', dist:5000, date:'2026-09-05' },
], board).csv.split('\n').slice(1).map(l => l.split(',')[1]);
ok(eviL.every(n => !/[<>&"]/.test(n)), 'no name can carry a markup character');
ok(eviL.every(n => !/[\u0000-\u001F\u007F]/.test(n)), 'and no control characters either');
eq(eviL[0], 'img src=x onerror=alert(1)', 'a tag is defanged, not deleted');
eq(eviL[3], 'Tab andnull', 'a tab collapses to a space and a null simply goes');

/* ---------- trimming actually happens ----------
   An eighth athlete and a fourth mark have to be discarded, or the round trip
   above is passing because nothing was ever over the cap. */
const OVER = S.ATHLETES_PER_TEAM + 2;
const fake = [];
for (let i = 0; i < OVER; i++) for (let m = 0; m < S.MARKS_PER_ATHLETE + 1; m++)
  fake.push({ g: 'M', name: 'Runner ' + i, school: 'Jesuit', grade: '11',
              seconds: (900 + i * 10 + m).toString(), dist: 5000, date: '2026-09-01' });
const cut = S.buildSeed(fake, board);
eq(cut.athletes, S.ATHLETES_PER_TEAM, 'the athlete past the cap is cut');
eq(cut.rows, S.ATHLETES_PER_TEAM * S.MARKS_PER_ATHLETE, 'the mark past the cap is cut');
eq(cut.latest, '2026-09-01', 'the latest date comes back for DATA_DATE');

/* ---------- summer is not the season ---------- */
const mixed = [
  { g:'M', name:'Camp Runner', school:'Bandon', grade:'11', seconds:'17:00.00', dist:5000, date:'2026-07-17' },
  { g:'M', name:'Camp Runner', school:'Bandon', grade:'11', seconds:'18:00.00', dist:5000, date:'2026-08-27' },
];
const ms = S.buildSeed(mixed, board);
eq(ms.dropped.preseason, 1, 'a July camp time trial is dropped');
eq(ms.rows, 1, 'the August race survives');
eq(ms.latest, '2026-08-27', 'the floor does not drag the date back');
// a database with no dates at all must not lose everything
eq(S.buildSeed(mixed.map(r => ({ ...r, date: '' })), board).rows, 2, 'no dates, no floor');

/* ---------- rubbish marks ---------- */
// 999999 is how athletic.net stores a scratch, and it parses as a valid time
const junk = [
  { g:'M', name:'Sentinel', school:'Jesuit', grade:'11', seconds:999999, dist:5000, date:'2026-09-05' },
  { g:'M', name:'Miskeyed', school:'Jesuit', grade:'11', seconds:'142:46.66', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Very Slow', school:'Jesuit', grade:'11', seconds:'51:09.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Too Fast', school:'Jesuit', grade:'11', seconds:'12:30.00', dist:5000, date:'2026-09-05' },
];
const jr = S.buildSeed(junk, board);
eq(jr.dropped.implausible, 3, 'sentinel, mis-entry and impossibly fast are all dropped');
eq(jr.rows, 1, 'the genuinely slow runner is kept');
eq(jr.csv.split('\n')[1].split(',')[1], 'Very Slow', 'and it is the right one');

/* ---------- a meet read twice ---------- */
// an interrupted crawl resumes on the meet it was halfway through
const twice = [
  { g:'M', name:'Dup Runner', school:'Jesuit', grade:'11', seconds:'16:00.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Dup Runner', school:'Jesuit', grade:'11', seconds:'16:00.00', dist:5000, date:'2026-09-05' },
  { g:'M', name:'Dup Runner', school:'Jesuit', grade:'11', seconds:'15:40.00', dist:5000, date:'2026-09-12' },
];
const dd = S.buildSeed(twice, board);
eq(dd.dropped.duplicate, 1, 'the repeated race is dropped');
eq(dd.rows, 2, 'two real marks survive');
// the same time on two different days is two real races, not a duplicate
const same = twice.slice(0,1).concat([{ ...twice[0], date:'2026-09-19' }]);
eq(S.buildSeed(same, board).rows, 2, 'the same time on another day is kept');

/* ---------- marks ---------- */
eq(S.toSeconds('15:01.01'), 901.01, 'mm:ss.xx');
eq(S.toSeconds('1:02:03'), 3723, 'h:mm:ss');
eq(S.toSeconds('DNF'), null, 'DNF is not a time');
eq(S.toSeconds(''), null, 'blank is not a time');
eq(S.fmt(901.01), '15:01.01', 'formats back');
eq(S.fmt(59.5), '0:59.50', 'pads the seconds');
eq(S.canonical('Cleveland (OR)'), 'Cleveland', 'strips the state suffix');
eq(S.canonical("Northwest Christian Academy"), "Northwest Christian", "aliases");

/* ---------- patching ---------- */
const patched = S.patchIndex(html, 'gender,athlete,mark,grade,team,dist,class\nM,A B,15:00.00,11,Jesuit,5000,6A',
  '2026-10-01');
ok(/const DATA_DATE="2026-10-01";/.test(patched), 'DATA_DATE moves');
eq(patched.match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/)[1].trim().split('\n').length, 2,
   'the seed block is replaced, not appended');
ok(Math.abs(patched.length - html.length + raw.length) < 200, 'nothing else is disturbed');

/* ---------- crests ---------- */
const logos = S.patchLogos(html, { Jesuit: 'https://example.com/x=s96', 'Brand New': 'https://e/y=s96' });
const LM = new Function('return (' + logos.match(/const LOGO=({.*?});/)[1] + ')')();
const LM0 = new Function('return (' + html.match(/const LOGO=({.*?});/)[1] + ')')();
eq(LM.Jesuit, 'https://example.com/x=s96', 'a crest is replaced');
eq(LM['Brand New'], 'https://e/y=s96', 'a new crest is added');
eq(Object.keys(LM).length, Object.keys(LM0).length + 1, 'nothing else is lost');
ok(Object.keys(LM).join('|') === Object.keys(LM).slice().sort().join('|'), 'crests come out sorted');
ok(logos.split('const LOGO=').length === 2, 'one LOGO map, not two');

/* ---------- the shapes both crawls read ---------- */
eq(S.OREGON_DIV, 87377, 'Oregon is division 87377');
eq(S.divMetres('5,000 Meters Varsity'), 5000, 'a 5k division');
eq(S.divMetres('3,000 Meters Novice'), 3000, 'a 3k division');
eq(S.divMetres('3 Miles Varsity Boys'), 4828, 'three miles is read, as metres');
eq(S.divMetres('3 Miles Race 62 - 9:34pm - Bob Day Sweeps (G)'), 4828, 'a Woodbridge race name');
eq(S.divMetres('2 Miles Varsity'), 0, 'any other imperial distance is not');
eq(S.divMetres('13 Miles'), 0, 'and a 13 is not a 3');
ok(S.wantDiv('5,000 Meters JV Boys Gold. (21mins-)'), 'every 5k race is read');
ok(S.wantDiv('3 Miles Race 63 - 9:54pm - D. Speck Sweeps (B'), 'a sweepstakes race is read');
ok(S.wantDiv('3 Miles Race 18 - 8:40pm - Red Varsity A (B)'), 'a varsity race is read');
ok(S.wantDiv('3 Miles Race 05 - 6:04pm - White Soph (B)'), 'and a sophomore race, since every 3-mile race counts');
ok(!S.wantDiv('3,000 Meters Varsity'), 'a 3k is still not read');

/* ---------- 3-mile rows ride on top of the 5k seed and never displace it ---------- */
{
  const one = (name, sec, dist, date) => ({ g: 'F', name, school: 'Jesuit', grade: '11',
                                            seconds: sec, dist, date });
  const five = [one('A Five', 1100, 5000, '2026-09-05'), one('A Five', 1110, 5000, '2026-09-12')];
  const base = S.buildSeed(five, board);
  const both = S.buildSeed([...five, one('A Five', 960, 4828, '2026-09-19'),
                            one('Miles Only', 958.7, 4828, '2026-09-19')], board);
  ok(both.csv.startsWith(base.csv + '\n'), 'the 5k rows are exactly what they were without 3-mile races');
  ok(/,Miles Only,15:58\.70,11,Jesuit,4828,/.test(both.csv), 'a 3-mile mark keeps the time actually run, marked 4828');
  eq(both.athletes, base.athletes, 'athlete counts are 5k counts');
  eq(both.miles.rows, 2, 'and the 3-mile rows are counted on their own');
  eq(both.miles.teams.join(), 'Jesuit girls', 'naming the teams they belong to');
  eq(S.buildSeed([one('Too Quick', 700, 4828, '2026-09-19')], board).rows, 0,
     'a 3-mile time is held to the 5k bounds, scaled');
}
eq(S.divMetres('5,000 Meters JV Boys Gold. (21mins-)'), 5000, 'a messy division name');
eq(S.divMetres(''), 0, 'no name, no distance');

const rawResult = { Gender:'M', FirstName:'Jaciah', LastName:'Lavier', SchoolName:'Jesuit',
              Grade:'11', SortValue:970.5, Result:'16:10.50' };
const rr = S.resultRow(rawResult, '2026-09-09');
eq(rr.name, 'Jaciah Lavier', 'first and last are joined');
eq(rr.seconds, 970.5, 'SortValue is preferred, being already seconds');
eq(rr.dist, 5000, 'rows are 5k by construction');
eq(rr.date, '2026-09-09', 'the meet date rides along');
eq(S.resultRow({ ...rawResult, Exhibition:true }, '2026-09-09'), null, 'exhibition is skipped');
eq(S.resultRow({ ...rawResult, SortValue:0 }, '').seconds, '16:10.50', 'no SortValue falls back to Result');
eq(S.resultRow({ ...rawResult, Grade:'', AgeGrade:'12' }, '').grade, '12', 'AgeGrade is the fallback');

// the tree hands the same school back under several divisions
const tree = [
  { SchoolID:220, SchoolName:'Jesuit', MascotUrl:'//x/a', ResultCount:0, DivisionID:1 },
  { SchoolID:220, SchoolName:'Jesuit', MascotUrl:'//x/a', ResultCount:7, DivisionID:2 },
  { SchoolID:999, SchoolName:'Battle Ground', MascotUrl:'//x/b', ResultCount:9, DivisionID:3 },
  { SchoolID:81056, SchoolName:'Adrienne Nelson', MascotUrl:'//x/c', ResultCount:3, DivisionID:4 },
];
const ft = S.teamsFromTree(tree, board);
const jes = ft.teams.find(x => x.name === 'Jesuit');
eq(jes.results, 7, 'the busiest row for a school wins');
eq(jes.id, 220, 'and carries its team id');
ok(!ft.teams.some(x => x.name === 'Battle Ground'), 'an out-of-state school is not a team');
eq(ft.logos.Jesuit, 'https://x/a=s96', 'the crest gets a scheme and a size');
ok(ft.absent.includes('Elgin'), 'a board school with no team is reported absent');
ok(ft.absent.length > 200, 'and so is everyone else not in this tiny tree');

/* ---------- same name, another state ----------
   Centennial of Meridian, Idaho shared meets with Oregon teams and, matched by
   name, was filed as Centennial of Gresham and picked to win 5A girls. */
eq(S.resultRow({ ...rawResult, TeamID: 220 }, '').teamId, 220, 'the team id rides along');
eq(S.resultRow(rawResult, '').teamId, 0, 'no id is 0, not undefined');
ok(ft.ids[220] === 'Jesuit', 'the tree maps an Oregon id to its board name');
ok(!(999 in ft.ids), 'an out-of-state school has no Oregon id');
{
  const mk = (name, school, teamId, sec) => ({ g: 'M', name, school, teamId, seconds: sec,
    dist: 5000, date: '2026-09-20' });
  const rows = [
    mk('Oregon Runner', 'Jesuit', 220, 960),
    mk('Idaho Runner', 'Jesuit', 4242, 900),     // same name, another state's number
    mk('Nobody', 'Battle Ground', 999, 950),
  ];
  const withIds = S.buildSeed(rows, board, ft.ids);
  ok(/Oregon Runner/.test(withIds.csv), 'the Oregon athlete is kept');
  ok(!/Idaho Runner/.test(withIds.csv), 'the same-named school from another state is dropped');
  eq(withIds.dropped.outOfState, 1, 'and counted as out of state');
  eq(withIds.outOfState.join(), 'Jesuit', 'and named, so the crawl can report it');
  eq(withIds.dropped.offBoard, 1, 'a school not on any board is still offBoard');
  const byName = S.buildSeed(rows, board);
  ok(/Idaho Runner/.test(byName.csv), 'without ids the name decides, as it always did');
  const aliased = S.buildSeed([mk('Jo Lee', 'Northwest Christian Academy', 77, 1100)],
    board, { 77: 'Northwest Christian' });
  eq(aliased.rows, 1, 'an id finds the board school whatever athletic.net calls it');
  const noId = S.buildSeed([mk('Old Row', 'Jesuit', 0, 970)], board, ft.ids);
  eq(noId.rows, 1, 'a row with no id falls back to its name');
}

/* ---------- race ratings ----------
   Eight runners race twice: a quick day, then a meet where everyone ran 4%
   slower. The slow race has to come out slow, the marks have to be trimmed on
   the rated value, and the time actually run is what gets written. */
{
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const base = 1100 + i * 10;
    rows.push({ g: 'F', name: 'Runner ' + i, school: 'Jesuit', grade: '11', dist: 5000,
                seconds: base, date: '2026-09-06', aid: 100 + i, mid: 'quick' });
    rows.push({ g: 'F', name: 'Runner ' + i, school: 'Jesuit', grade: '11', dist: 5000,
                seconds: base * 1.04, date: '2026-09-13', aid: 100 + i, mid: 'slow' });
  }
  const b = S.buildSeed(rows, board);
  const lines = b.csv.split('\n');
  eq(lines[0], 'gender,athlete,mark,grade,team,dist,class,race', 'the seed carries a race column');
  const f = mid => +lines.slice(1).find(l => l.includes(mid === 'slow' ? '19:04.00' : '18:20.00')).split(',')[7];
  // eight runners is a thin race, so each rating is shrunk halfway toward zero
  // (n / (n + 8)). The slow meet is a week later, when a runner should be 1%
  // quicker (RACE_TAU), so it is 5% slower than form says, not 4% - and halved,
  // 2.5%. The week is the point: without it the gap would read 2%.
  ok(f('slow') > 1.005, 'the slow race is rated slow — ' + f('slow'));
  ok(f('quick') < 0.995, 'and the quick one quick — ' + f('quick'));
  ok(Math.abs(f('slow') / f('quick') - 1.025) < 0.003, 'by the shrunk gap plus a week, about 2.5% — ' + (f('slow') / f('quick')).toFixed(4));
  ok(/,Runner 0,19:04\.00,/.test(b.csv), 'the time actually run is written, not the rated one');
  ok(b.races && b.races.races === 2, 'two races rated');
  // a lone mark in an unrated race, and a row with no id, keep factor 1
  const lone = S.buildSeed([{ g: 'F', name: 'Solo', school: 'Jesuit', grade: '9', dist: 5000,
    seconds: 1200, date: '2026-09-06' }], board);
  ok(/,1\.0000$/.test(lone.csv.split('\n')[1]), 'an unrateable mark keeps a factor of 1');
}

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
