// node pull/whoswho.js [--school Tualatin]
//
// Who's Who text -> committed CSV.
//
// athletic.net starts at 2004 and the dashboard says so in its own footer.
// Who's Who has been published continuously since 1965 and carries all-time
// team rankings back to 1960 and four-year state qualifiers back to 1963, so
// this is forty years the roster database has never seen - and it is the good
// forty years, because what Who's Who records is honours rather than results.
//
// pull/whoswho_extract.py does the PDF -> text step, which Node cannot, and
// commits the .txt. Everything here works on that text, in Node, where
// test_whoswho.js can aim at it without a network or a Python runtime.
//
// THREE DOCUMENTS, THREE SHAPES, ALL TWO-COLUMN
//
// Every one of these is a printed page with boys down the left and girls down
// the right, flattened by the extractor into one line per row. So a line
// usually holds two unrelated athletes and the parse has to split them, and
// the column an entry came from is the only thing that says which gender it
// is. Where a line holds only one entry - which happens wherever one list
// outlasts the other - the column has to be inferred from which rank sequence
// it continues. That is the whole difficulty and it has its own test.
const fs = require('fs');
const path = require('path');

const TEXT = path.join(__dirname, 'whoswho', 'text');
const OUT = path.join(__dirname, 'whoswho');

/* ---------- names ----------
   Map Who's Who spelling -> the board's spelling, never the reverse. The same
   rule the athletic.net and coaches-poll alias tables both had to learn, and
   here it matters more: these documents are typed by volunteers across sixty
   years and carry the typos you would expect of that. Correcting them in this
   direction keeps Who's Who quotable as published while still joining. */
const SCHOOL_ALIAS = {
  'tualatin': 'Tualatin',
};

/* Athlete names are corrected only where the person is identifiable beyond
   doubt from the school and the years. Two so far, both Tualatin:

   - "Matther Lovos" is Matthew Lovos, 6A, 2011-2014, who is in the roster
     database under that spelling and in TRUST Plan Data by hand.
   - Meghan Armstrong ran here 2000-2003 and is the athlete the coach knows as
     Meghan Peyton; she changed her surname after school. athletic.net has her
     only as Peyton, in a single 2004 track season, because its cross country
     record does not reach back far enough to hold any of this. Who's Who has
     all four of her years and ranks her 31st all-time in Oregon.

   Keyed on the published spelling plus the school, because a bare surname is
   not unique across sixty years of one state. */
const ATHLETE_ALIAS = {
  'matther lovos|tualatin': { name: 'Matthew Lovos' },
  'meghan armstrong|tualatin': { name: 'Meghan Armstrong', alsoKnownAs: 'Meghan Peyton' },
};

const school = (s) => {
  const k = String(s || '').trim().replace(/\s+/g, ' ');
  return SCHOOL_ALIAS[k.toLowerCase()] || k;
};

/* A classification token, across six decades of them: 6A, 3/2/1A, 3A-2A-1A,
   AAA, A-B. Anything built only from digits, A, B, slash and dash, carrying at
   least one letter. "Switch" is its own case - Who's Who uses it for an
   athlete who changed classification mid-career - and is kept as written,
   because losing it would silently reclassify somebody. */
const CLASS_RE = /^(?:Switch|(?=[0-9AB/\-]{1,9}$)[0-9AB/\-]*[AB][0-9AB/\-]*)$/;

const readDoc = (name) => {
  const p = path.join(TEXT, name + '.txt');
  if (!fs.existsSync(p)) throw new Error('missing ' + p + ' — run pull/whoswho_extract.py');
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

/* ---------- which column did this come from ----------
   Two matches on a line is the easy case: left is boys, right is girls. One
   match is not, and guessing wrong silently files an athlete under the wrong
   gender for good.

   So it is resolved by continuation. Each column's ranks climb by one down the
   page, independently, so a lone entry belongs to whichever column it
   continues. Where both could continue it - which happens only while the two
   lists are still level - the left column wins, because that is where a
   printed row starts. Where neither does, it is reported rather than filed. */
function columnSplitter() {
  const last = { M: { rank: 0, points: 0 }, F: { rank: 0, points: 0 } };

  /* Both signals, because neither survives alone.

     Rank is the obvious one and it is typed by hand: the published list runs
     702, 7803, 704, where 7803 is plainly 703 with a stray digit. Trusting it
     put a rank of 2,024,519 into the tracker once - from "2021=2024" with an
     equals sign for a hyphen - after which every later inference was measured
     against garbage and Devon Frazier, who is a girl, was filed as a boy.

     Points is the quiet one and much harder to break: it is a sum of State
     finishing places, so within a column it only ever climbs, and a typo in it
     shows up as a step backwards rather than as a plausible number. */
  const score = (g, m) => {
    const L = last[g];
    let s = 0;
    if (m.rank === L.rank + 1) s += 3;
    else if (m.rank > L.rank && m.rank - L.rank <= 3) s += 1;
    else if (m.rank <= L.rank) s -= 2;
    if (m.points >= L.points) s += 2; else s -= 3;
    if (m.points - L.points <= 4) s += 1;
    return s;
  };

  return {
    assign(matches) {
      if (matches.length >= 2) {
        const out = [];
        ['M', 'F'].forEach((g, i) => {
          if (!matches[i]) return;
          // a printed rank that goes backwards is a typo; keep counting forward
          last[g] = {
            rank: matches[i].rank > last[g].rank ? matches[i].rank : last[g].rank + 1,
            points: Math.max(matches[i].points, last[g].points),
          };
          out.push({ ...matches[i], gender: g });
        });
        return out;
      }
      if (!matches.length) return [];
      const m = matches[0];
      const sM = score('M', m), sF = score('F', m);
      const g = sM === sF ? 'M' : (sM > sF ? 'M' : 'F');
      last[g] = {
        rank: m.rank > last[g].rank ? m.rank : last[g].rank + 1,
        points: Math.max(m.points, last[g].points),
      };
      return [{ ...m, gender: g, inferred: true, margin: Math.abs(sM - sF) }];
    },
  };
}

/* ---------- all-time team rankings ----------
   "29 720 Tualatin 6A 23 12 11 0 1 0 2" - rank, points, school, the
   classification it is filed under, then how many times it has been to State
   and a run of per-era placing counts whose column headings sit in a detached
   block at the top of the page. The counts are not parsed: their meaning
   depends on a header this extraction cannot reliably attach to them, and a
   number whose meaning is a guess is worse than no number. Rank, points,
   school and appearances are unambiguous, and they are what a programme wants
   to know about itself. */
function parsePowerRankings(txt, gender) {
  const rows = [];
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('<<<PAGE')) continue;
    const tok = line.split(/\s+/);
    if (tok.length < 5) continue;
    if (!/^\d+$/.test(tok[0]) || !/^\d+$/.test(tok[1])) continue;
    let ci = -1;
    for (let i = 3; i < tok.length; i++) {
      if (CLASS_RE.test(tok[i])) { ci = i; break; }
    }
    if (ci < 3) continue;
    const name = tok.slice(2, ci).join(' ');
    if (!name || /^\d+$/.test(name)) continue;
    const appearances = /^\d+$/.test(tok[ci + 1] || '') ? +tok[ci + 1] : null;
    rows.push({
      gender, rank: +tok[0], points: +tok[1],
      school: school(name), cls: tok[ci], appearances,
    });
  }
  return rows;
}

/* ---------- four-year State qualifiers, since 1963 ----------
   "31 11 6A Meghan Armstrong, Tualatin 2000-2003". Rank, points, class, who,
   where, and the four years. Points are a sum of State finishing places, so
   LOW IS GOOD and the rank runs with it - worth knowing before anybody puts
   this on a page pointing the wrong way.

   The end year is written both ways, "2000-2003" and "2018-21", so a two-digit
   tail is completed from the century of the start year. */
/* The year separator is a hyphen except where it is not. Three entries in
   the published list use "=" - "2021=2024" - and a regex that insists on a
   hyphen does not skip those, it runs straight through them and reads the
   next entry's rank as part of this one's year. That is where 2,024,519 came
   from. An en or em dash is allowed for the same reason. */
const FOUR_YEAR_RE = /(\d+)\s+(\d+)\s+(Switch|[0-9AB/\-]{1,9})\s+([A-Z][^,]*?),\s*([A-Za-z][^0-9]*?)\s+(\d{4})[-\u2013\u2014=](\d{2,4})/g;

// the two lists run to about 700 each; anything past this is a mis-parse
const MAX_RANK = 2000;

function parseFourYear(txt) {
  const split = columnSplitter();
  const rows = [], unsure = [];
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('<<<PAGE')) continue;
    const found = [];
    let m;
    FOUR_YEAR_RE.lastIndex = 0;
    while ((m = FOUR_YEAR_RE.exec(line))) {
      if (!CLASS_RE.test(m[3])) continue;
      const from = +m[6];
      let to = +m[7];
      if (m[7].length === 2) to = Math.floor(from / 100) * 100 + to;
      if (to < from || to - from > 6) continue;
      if (+m[1] > MAX_RANK) continue;
      found.push({
        rank: +m[1], points: +m[2], cls: m[3],
        name: m[4].trim().replace(/\s+/g, ' '),
        school: school(m[5]), from, to,
      });
    }
    for (const r of split.assign(found)) {
      if (r.inferred) unsure.push(r);
      rows.push(r);
    }
  }
  return { rows, unsure };
}

/* ---------- all-time best at the State meet ----------
   "45 Lauren Gerlach, Tualatin 18:08 in 2025", girls on page one and boys on
   page two. The same document carries per-class-year sub-lists written as
   "JR 1 - Emily Wisniewski, ..."; the name is required to start with a capital
   so that the "- Emily" of those lines cannot be read as an athlete. */
const STATE_BEST_RE = /(?:^|\s)(\d+)\s+([A-Z][^,]*?),\s*([A-Za-z][^0-9]*?)\s+(\d+:\d+(?:\.\d+)?)\s+in\s+(\d{4})/g;

function parseStateBest(txt) {
  const rows = [];
  let gender = 'F';                      // page one is the girls' list
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<<<PAGE')) {
      if (/PAGE 2/.test(line)) gender = 'M';
      continue;
    }
    if (!line) continue;
    let m;
    STATE_BEST_RE.lastIndex = 0;
    while ((m = STATE_BEST_RE.exec(line))) {
      const [mm, ss] = m[4].split(':');
      rows.push({
        gender, rank: +m[1],
        name: m[2].trim().replace(/\s+/g, ' '),
        school: school(m[3]),
        mark: m[4], seconds: Math.round((+mm * 60 + parseFloat(ss)) * 10) / 10,
        year: +m[5],
      });
    }
  }
  return rows;
}

/* ---------- writing ---------- */
const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (head, rows) => [head.join(','),
  ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n') + '\n';

/* Two different things happen here and conflating them misrepresents both.

   A TYPO is the publication mistyping somebody: "Matther Lovos" for Matthew.
   The published spelling is worth keeping so Who's Who stays quotable as
   printed, but it is not a name the athlete ever had.

   A NAME CHANGE is real: Meghan Armstrong ran here 2000-2003 and is Meghan
   Peyton now. That one belongs on the page, because it is the name her coach
   will type.

   So they get separate columns. "now Meghan Peyton" is true. "now Matther
   Lovos" was on the page for an hour and is not. */
function applyAthleteAlias(rows) {
  let n = 0;
  for (const r of rows) {
    const a = ATHLETE_ALIAS[(r.name + '|' + r.school).toLowerCase()];
    if (!a) { r.alsoKnownAs = ''; r.published = ''; continue; }
    r.alsoKnownAs = a.alsoKnownAs || '';       // a later name, if there is one
    r.published = a.name !== r.name ? r.name : '';   // what the book actually printed
    r.name = a.name;
    n++;
  }
  return n;
}

function main() {
  const i = process.argv.indexOf('--school');
  const target = i > 0 ? process.argv[i + 1] : 'Tualatin';
  fs.mkdirSync(OUT, { recursive: true });
  const log = (...a) => console.log(...a);

  const teams = [
    ...parsePowerRankings(readDoc('WW_XC_Boys_Power_Rankings'), 'M'),
    ...parsePowerRankings(readDoc('WW_XC_Girls_Power_Rankings'), 'F'),
  ];
  const fy = parseFourYear(readDoc('WW_XC_4_Year'));
  const best = parseStateBest(readDoc('WW_XC_State_Stats_top_80'));
  const aliased = applyAthleteAlias(fy.rows);

  /* The guards, same posture as the rest of pull/: refuse rather than write a
     quietly thin file. These counts are what the documents held when this was
     built; a parse that suddenly finds half as much has broken, not the sport. */
  const refuse = [];
  if (teams.length < 150) refuse.push('only ' + teams.length + ' team rankings parsed');
  if (fy.rows.length < 800) refuse.push('only ' + fy.rows.length + ' four-year qualifiers parsed');
  if (best.length < 120) refuse.push('only ' + best.length + ' all-time State marks parsed');
  if (fy.unsure.length > fy.rows.length * 0.2) {
    refuse.push(fy.unsure.length + ' of ' + fy.rows.length + ' four-year rows had an inferred column');
  }
  if (refuse.length) {
    log('\nREFUSING TO WRITE:');
    for (const r of refuse) log('  - ' + r);
    process.exit(2);
  }

  fs.writeFileSync(path.join(OUT, 'ww_team_rankings.csv'),
    csv(['gender', 'rank', 'points', 'school', 'cls', 'appearances'], teams));
  fs.writeFileSync(path.join(OUT, 'ww_four_year.csv'),
    csv(['gender', 'rank', 'points', 'cls', 'name', 'alsoKnownAs', 'published',
      'school', 'from', 'to'], fy.rows));
  fs.writeFileSync(path.join(OUT, 'ww_state_best.csv'),
    csv(['gender', 'rank', 'name', 'school', 'mark', 'seconds', 'year'], best));

  log('  ' + teams.length + ' all-time team rankings');
  log('  ' + fy.rows.length + ' four-year State qualifiers, ' + fy.unsure.length
    + ' with an inferred column');
  log('  ' + best.length + ' all-time State marks');
  log('  ' + aliased + ' athlete names corrected from the published spelling');

  const mine = {
    teams: teams.filter((t) => t.school === target),
    fy: fy.rows.filter((r) => r.school === target).sort((a, b) => a.from - b.from),
    best: best.filter((r) => r.school === target).sort((a, b) => a.rank - b.rank),
  };
  log('\n  ' + target + ':');
  for (const t of mine.teams) {
    log('    all-time ' + (t.gender === 'M' ? 'boys ' : 'girls') + '  #' + t.rank
      + ' in Oregon, ' + t.points + ' pts, ' + t.appearances + ' trips to State');
  }
  log('    ' + mine.fy.length + ' four-year State qualifiers, '
    + mine.best.length + ' all-time State marks');
  for (const r of mine.fy) {
    log('      ' + r.from + '-' + r.to + '  ' + r.name.padEnd(20)
      + ' #' + r.rank + ' in Oregon' + (r.alsoKnownAs ? '  (' + r.alsoKnownAs + ')' : ''));
  }
  for (const r of mine.best) {
    log('      ' + r.year + '  ' + r.name.padEnd(20) + ' ' + r.mark
      + '  #' + r.rank + ' all-time in Oregon');
  }
  log('\n  wrote pull/whoswho/ww_{team_rankings,four_year,state_best}.csv');
}

module.exports = {
  CLASS_RE, SCHOOL_ALIAS, ATHLETE_ALIAS, school, columnSplitter,
  parsePowerRankings, parseFourYear, parseStateBest, applyAthleteAlias, csv,
};

if (require.main === module) main();
