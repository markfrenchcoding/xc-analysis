// node pull/test_whoswho.js
//
// No network, no Python. Reads the committed text in pull/whoswho/text/ and
// the committed CSVs beside it.
//
// The hard part of this parser is not the regex, it is deciding which printed
// COLUMN an entry came from, because the column is the only thing that says
// whether an athlete is a boy or a girl and a wrong answer is silent and
// permanent. So most of what follows is aimed there, and two of the checks are
// real cross-validations rather than assertions about synthetic strings:
// against athletic.net's recorded gender, and against the one Who's Who
// document that prints the two genders on separate pages and therefore needs
// no inference at all.
const fs = require('fs');
const path = require('path');
const W = require('./whoswho.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' — got ' + a + ', wanted ' + b);

const DIR = path.join(__dirname, 'whoswho');
const rd = (f) => {
  const L = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const h = L[0].split(',');
  return L.slice(1).map((l) => {
    const c = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { c.push(cur); cur = ''; continue; }
      cur += ch;
    }
    c.push(cur);
    return Object.fromEntries(h.map((k, i) => [k, c[i]]));
  });
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/* ---------- a classification, across sixty years of them ---------- */
for (const c of ['6A', '5A', '4A', '3A', '2A', '1A', '3/2/1A', '3A-2A-1A', 'AAA', 'AA', 'A-B', 'Switch']) {
  ok(W.CLASS_RE.test(c), 'reads "' + c + '" as a classification');
}
for (const c of ['Tualatin', '30', 'Grant', '', 'Santiam']) {
  ok(!W.CLASS_RE.test(c), '"' + c + '" is not a classification');
}

/* ---------- school names map one way ---------- */
eq(W.school('tualatin'), 'Tualatin', 'an alias maps Who\'s Who spelling to the board');
eq(W.school('  South  Eugene '), 'South Eugene', 'whitespace collapses');
eq(W.school('Klamath Union'), 'Klamath Union', 'an unaliased school passes through unchanged');

/* ---------- team rankings ---------- */
const pr = W.parsePowerRankings([
  '1 2216 Jesuit 6A 30 19 11 16 6 3 2',
  '6 1828 Union (inc.Union/Cove) 3/2/1A 34 14 14 6 12 7 3 7',
  '29 720 Tualatin 6A 23 12 11 0 1 0 2',
  '<<<PAGE 2>>>',
  '6A',
  'First',
].join('\n'), 'F');
eq(pr.length, 3, 'three teams, and the detached header block is not one of them');
eq(pr[1].school, 'Union (inc.Union/Cove)', 'a school name survives its parenthetical');
eq(pr[1].cls, '3/2/1A', 'and the classification after it is found, not the first number');
eq(pr[2].school, 'Tualatin', 'the alias is applied');
eq(pr[2].appearances, 23, 'trips to State come off the token after the classification');

/* ---------- four-year qualifiers ---------- */
const fy = W.parseFourYear([
  '1 4 4A Billy Harper, Junction City 1992-1995 1 4 5A Emily Wisniewski, Crescent Valley 2021-2024',
  '2 9 5A Evan Holland, Ashland 2016-2019 2 5 3-2-1A Ashley Baldovino, Lakview 2006-2009',
  '3 9 Switch Henry Coughlan, Enterprise/Cres.Val 2018-21 3 5 3-2-1A Iris Cripps, Glendale 1990-1993',
].join('\n'));
eq(fy.rows.length, 6, 'two athletes a line');
eq(fy.rows[0].gender, 'M', 'the left column is the boys');
eq(fy.rows[1].gender, 'F', 'the right column is the girls');
eq(fy.rows[0].name, 'Billy Harper', 'name splits on the comma');
eq(fy.rows[0].school, 'Junction City', 'school runs to the years');
eq(fy.rows[4].cls, 'Switch', 'Switch is kept as published rather than dropped');
eq(fy.rows[4].to, 2021, 'a two-digit end year takes the century of the start');
eq(fy.unsure.length, 0, 'nothing had to be inferred when both columns are present');

/* An equals sign for a hyphen. Three entries in the published list have one,
   and a regex insisting on a hyphen does not skip them - it reads straight
   through into the next entry and returns a rank of 2,024,519. */
const typo = W.parseFourYear(
  '519 252 3A Benjamin Robinson, Santiam Christian 2021=2024519 154 3-2-1A Megan Haueter, Bandon 2007-2010');
eq(typo.rows.length, 2, 'an "=" year separator still yields two athletes');
eq(typo.rows[0].to, 2024, 'the left entry ends in 2024');
eq(typo.rows[1].rank, 519, 'and the right entry keeps its own rank');
ok(typo.rows.every((r) => r.rank < 2000), 'no rank ran away into the next entry');

/* ---------- the column inference, which is the whole difficulty ---------- */
const split = W.columnSplitter();
split.assign([{ rank: 1, points: 10 }, { rank: 1, points: 12 }]);
split.assign([{ rank: 2, points: 11 }, { rank: 2, points: 13 }]);
let lone = split.assign([{ rank: 3, points: 14 }]);
eq(lone[0].gender, 'M', 'while the two lists are still level a lone entry goes left, '
  + 'because that is where a printed row starts');
ok(lone[0].inferred, 'and is marked as inferred rather than passed off as read');
eq(lone[0].margin, 0, 'with the margin recorded as nil, which is what level means');

/* Points are what break the tie once the columns diverge, and they are the
   sturdier signal: they only ever climb within a column, so a typo shows up as
   a step backwards rather than as a plausible number. */
const s2 = W.columnSplitter();
s2.assign([{ rank: 1, points: 10 }, { rank: 1, points: 12 }]);
s2.assign([{ rank: 2, points: 50 }, { rank: 2, points: 13 }]);
const pick = s2.assign([{ rank: 3, points: 14 }]);
eq(pick[0].gender, 'F', 'a lone entry goes to the column whose points it continues, '
  + 'not to the one that has already run past it');
ok(pick[0].margin > 0, 'and the margin says the call was not a coin toss');

/* A rank that goes backwards is a typo - the list runs 702, 7803, 704 - and
   must not be believed by the tracker, or every later inference is measured
   against a number that was never real. */
const s3 = W.columnSplitter();
s3.assign([{ rank: 702, points: 243 }, { rank: 702, points: 243 }]);
s3.assign([{ rank: 7803, points: 244 }, { rank: 7803, points: 244 }]);
eq(s3.assign([{ rank: 704, points: 244 }])[0].gender, 'M',
  'a wild rank does not poison the sequence behind it');

/* ---------- the committed parse ---------- */
const teams = rd('ww_team_rankings.csv');
const four = rd('ww_four_year.csv');
const best = rd('ww_state_best.csv');

// non-vacuous: nothing below means anything against an empty file
ok(teams.length > 300, 'the committed parse holds real team rankings — ' + teams.length);
ok(four.length > 1000, 'and real four-year qualifiers — ' + four.length);
ok(best.length > 120, 'and real all-time State marks — ' + best.length);
ok(four.every((r) => +r.rank > 0 && +r.rank < 2000), 'every rank is plausible');
ok(four.every((r) => +r.to >= +r.from && +r.to - +r.from <= 6), 'every span is a career');
ok(four.every((r) => +r.from >= 1960 && +r.to <= 2030), 'every year is in the record');

/* CROSS-VALIDATION ONE. The top-80 document prints boys and girls on separate
   pages, so its gender is read rather than inferred. Any athlete in both lists
   is a free check on the four-year column inference. */
const byBest = new Map(best.map((r) => [norm(r.name) + '|' + norm(r.school), r.gender]));
let agree = 0, disagree = 0;
for (const r of four) {
  const t = byBest.get(norm(r.name) + '|' + norm(r.school));
  if (!t) continue;
  if (t === r.gender) agree++; else disagree++;
}
ok(agree > 30, 'enough athletes appear in both lists to be worth checking — ' + agree);
eq(disagree, 0, 'the inferred column never contradicts the page-certain one');

/* CROSS-VALIDATION TWO. athletic.net knows the gender of everybody who has
   raced for Tualatin since 2004. Who's Who reaches back to 1963. Where they
   overlap they must agree. */
const RD = path.join(__dirname, 'roster', 't284_athletes.csv');
if (fs.existsSync(RD)) {
  const L = fs.readFileSync(RD, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const h = L[0].split(',');
  const truth = new Map();
  for (const line of L.slice(1)) {
    const c = line.split(',');
    const o = Object.fromEntries(h.map((k, i) => [k, c[i]]));
    truth.set(norm(o.first + ' ' + o.last), o.gender);
  }
  let a = 0, d = 0;
  for (const r of [...four, ...best]) {
    if (r.school !== 'Tualatin') continue;
    const t = truth.get(norm(r.name)) || truth.get(norm(r.alsoKnownAs));
    if (!t) continue;
    if (t === r.gender) a++; else d++;
  }
  ok(a >= 8, 'enough Tualatin athletes are in both databases to check — ' + a);
  eq(d, 0, 'Who\'s Who and athletic.net agree on every gender they share');
}

/* ---------- what it found, which is the reason any of this exists ---------- */
const mine = four.filter((r) => r.school === 'Tualatin');
eq(mine.length, 10, 'Tualatin has ten four-year State qualifiers on record');

const meghan = mine.find((r) => /armstrong/i.test(r.name));
ok(meghan, 'Meghan Armstrong is in the four-year list');
eq(meghan.gender, 'F', 'as a girl');
eq(meghan.from + '-' + meghan.to, '2000-2003', 'with all four of her years');
eq(meghan.rank, '31', 'ranked 31st all-time in Oregon');
eq(meghan.alsoKnownAs, 'Meghan Peyton', 'and carrying the name her coach knows her by');
ok(+meghan.to < 2004, 'her whole career sits before athletic.net\'s horizon, '
  + 'which is why the roster database cannot see any of it');

const lovos = mine.find((r) => /lovos/i.test(r.name));
eq(lovos.name, 'Matthew Lovos', 'a published typo is corrected toward the roster spelling');
eq(lovos.published, 'Matther Lovos', 'and the published spelling is kept as printed');
eq(lovos.alsoKnownAs, '', 'but a typo is not a name he ever went by');
eq(meghan.published, '', 'and a genuine name change is not a typo in the book');

const tt = teams.filter((r) => r.school === 'Tualatin');
eq(tt.length, 2, 'both Tualatin teams are ranked all-time');
const girls = tt.find((r) => r.gender === 'F');
eq(girls.rank, '29', 'the girls are 29th all-time in Oregon');
eq(girls.appearances, '23', 'off 23 trips to State');

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
