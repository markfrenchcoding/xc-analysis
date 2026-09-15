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
eq(head.join(','), 'gender,athlete,mark,grade,team,dist,class', 'header');

const rows = lines.slice(1).map(l => {
  const c = l.split(',');
  return { g: c[0], name: c[1], mark: c[2], grade: c[3], school: c[4], dist: +c[5], cls: c[6] };
});
console.log(lines.length - 1 + ' rows in, ' + new Set(rows.map(r => r.school)).size + ' schools');

// every school on the seed resolves to a board — a miss here is a missing alias
const unresolved = [...new Set(rows.filter(r => !(board[S.key(r.school)] || {})[r.g])
  .map(r => r.school))];
ok(unresolved.length === 0, 'every seeded school is on a board; missing: ' + unresolved.join(', '));

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
  return { g: c[0], name: c[1], mark: c[2], grade: c[3], school: c[4], cls: c[6] };
});
const A = norm(rows), B = norm(after);
const missing = A.filter((x, i) => x !== B[i]);
ok(A.join('\n') === B.join('\n'), 'identical rows; first divergence: ' + (missing[0] || '-'));

/* ---------- the caps really cap ---------- */
const perAthlete = new Map(), perTeam = new Map();
for (const r of after) {
  const a = r.cls + '|' + r.g + '|' + r.school + '|' + r.name;
  perAthlete.set(a, (perAthlete.get(a) || 0) + 1);
  const t = r.cls + '|' + r.g + '|' + r.school;
  if (!perTeam.has(t)) perTeam.set(t, new Set());
  perTeam.get(t).add(r.name);
}
eq(Math.max(...perAthlete.values()), S.MARKS_PER_ATHLETE, 'at most three marks an athlete');
eq(Math.max(...[...perTeam.values()].map(s => s.size)), S.ATHLETES_PER_TEAM, 'at most seven a team');
ok(after.every(r => !/[,"]/.test(r.name)), 'no commas or quotes in a name');

/* ---------- trimming actually happens ----------
   An eighth athlete and a fourth mark have to be discarded, or the round trip
   above is passing because nothing was ever over the cap. */
const fake = [];
for (let i = 0; i < 9; i++) for (let m = 0; m < 4; m++)
  fake.push({ g: 'M', name: 'Runner ' + i, school: 'Jesuit', grade: '11',
              seconds: (900 + i * 10 + m).toString(), dist: 5000, date: '2026-09-01' });
const cut = S.buildSeed(fake, board);
eq(cut.athletes, 7, 'an eighth athlete is cut');
eq(cut.rows, 21, 'a fourth mark is cut');
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

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
