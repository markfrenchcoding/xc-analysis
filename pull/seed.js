/* Seed building, shared by the browser harness and Node.
 *
 * The refresh runs in a browser because Cloudflare 403s Node against
 * athletic.net, but the part worth testing is this: turning a pile of result
 * rows into the CSV the site ships. Keeping it in one file means the thing that
 * runs is the thing that was tested.
 *
 * Loadable either way:
 *   <script src="seed.js">   ->  window.Seed
 *   require('./seed.js')     ->  the same object
 */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.Seed = make();
}(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- school names ----------
     CLASSES is the authority on what a school is called, and it already spells
     most of the awkward ones athletic.net's way - "Benson Tech", "McDaniel",
     "Adrienne Nelson", "Ida B. Wells", "Jefferson-Portland". Only three names
     genuinely differ, all of them athletic.net writing out a longer legal name.
     Map athletic.net -> the board, never the other way round.

     An unmapped name does not misfile, it drops: the class lookup misses and
     the school is simply absent, which the harness reports. Elgin has no
     athletic.net Oregon team at all and cannot be aliased into existence. */
  const ALIAS = {
    'livingstone adventist academy': 'Livingstone Adventist Acad.',
    'northwest christian academy': 'Northwest Christian',
    'valor christian international': 'Valor Christian',
  };

  // athletic.net suffixes ambiguous names; the board has always said "Cleveland"
  const strip = s => String(s || '').replace(/\s*\((?:OR|or)\)\s*$/, '').trim();
  const key = s => strip(s).toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();

  // the key a school should be looked up under, alias applied
  const canonical = name => ALIAS[key(name)] || strip(name);
  const lookup = name => key(canonical(name));

  /* ---------- what athletic.net's shapes mean ----------
     Two crawls call this file: the browser harness and the headless scheduled
     one. Their transports have nothing in common - fetch under CORS against
     curl through a child process - and their backoffs differ for a real reason,
     because only one of them can read a 429. But the *reading* of athletic.net
     is identical, so it lives here where both get it and the tests cover it.
     Left in the two crawlers it would drift the first time a field was renamed. */

  const OREGON_DIV = 87377;            // World > United States > High School > Oregon

  /* "5,000 Meters Varsity" -> 5000. The only place a division's distance is
     recorded; there is no distance field.

     Three miles is the one imperial distance read, as 4828 (metres, rounded).
     Crater's top three girls raced Woodbridge in California over 3 miles in
     September 2026 and nowhere else, so the board had never heard of them. The
     marks are kept at the distance they were run; converting them is the site's
     job and only when the reader asks, behind the "3-mile races" setting. Every
     other imperial distance still comes out as 0 and is dropped. */
  const MILES_3 = 4828;
  function divMetres(name) {
    const s = String(name || '');
    const m = s.match(/([\d,]+)\s*Meters?/i);
    if (m) return +m[1].replace(/,/g, '');
    return /(^|\D)3\s*Miles?\b/i.test(s) ? MILES_3 : 0;
  }

  /* Which divisions a crawl reads: every 5,000m race and every 3-mile race.
     The 3-mile grade races were skipped at first, on the guess that a
     frosh-soph race at Woodbridge would not reach anyone's top seven. That was
     a guess, and athletic.net's own Oregon list says 3 miles is not only
     Woodbridge: Crater's Sawyer Hutton ran his at the Bill Springhorn Classic,
     in Oregon, on Sep 4. The cost is Woodbridge's 67 divisions, about two
     minutes of requests a week. */
  function wantDiv(name) {
    const d = divMetres(name);
    return d === 5000 || d === MILES_3;
  }

  /* One athletic.net result -> one row for buildSeed, or null to skip it.
     SortValue is already seconds, which saves parsing Result, but it is also
     where the 999999 scratch sentinel lives - buildSeed's bounds catch that. */
  function resultRow(r, date, dist, meetId, divId) {
    if (!r || r.Exhibition) return null;     // unattached, not on anyone's roster
    return {
      g: r.Gender,
      name: ((r.FirstName || '') + ' ' + (r.LastName || '')).trim(),
      school: r.SchoolName,
      /* Which school, by number. The name is not enough: athletic.net does not
         suffix every shared name, and a meet on an Oregon team's calendar can
         hold an Idaho or Washington school spelled exactly like an Oregon one.
         Centennial of Meridian, Idaho raced under Centennial of Gresham's name
         for most of September 2026 and was picked to win 5A girls. */
      teamId: +(r.TeamID || r.SchoolID) || 0,
      grade: r.Grade || r.AgeGrade || '',
      seconds: r.SortValue || r.Result,
      dist: dist || 5000,
      /* who and where, so races can be rated: the athlete by id (a name is not
         an identity) and the meet the mark came from */
      aid: +r.AthleteID || 0,
      mid: meetId ? String(meetId) : '',
      /* which race at the meet: varsity and JV share a meet id, and head-to-head
         is only a meeting if the two teams were on the same start line */
      div: divId ? String(divId) : '',
      date: date || '',
    };
  }

  /* The Oregon division tree -> the teams worth crawling, and their crests.
     One school is aligned to several divisions (its league, its classification,
     a regional grouping), so it appears several times; keep the busiest row,
     which is the one whose ResultCount is real. */
  function teamsFromTree(alignedTeams, board) {
    const seen = new Map(), logos = {}, ids = {};
    for (const r of alignedTeams || []) {
      const b = board[lookup(r.SchoolName)];
      if (!b) continue;                      // not a school on an OSAA board
      const name = Object.values(b)[0].name;  // spell it the board's way
      // every Oregon id a board school goes by; buildSeed keeps only these
      if (r.SchoolID) ids[r.SchoolID] = name;
      if (r.MascotUrl && !logos[name]) logos[name] = 'https:' + r.MascotUrl + '=s96';
      const prev = seen.get(name);
      if (!prev || (r.ResultCount || 0) > prev.results)
        seen.set(name, { id: r.SchoolID, name, results: r.ResultCount || 0 });
    }
    const onBoard = new Set(Object.values(board).map(v => Object.values(v)[0].name));
    return {
      teams: [...seen.values()],
      logos, ids,
      absent: [...onBoard].filter(n => !seen.has(n)).sort(),
    };
  }

  /* ---------- reading the site's own config ---------- */
  function parseClasses(html) {
    const m = html.match(/const CLASSES=(\{[\s\S]*?\n\});/);
    if (!m) throw new Error('CLASSES block not found in index.html');
    // eslint-disable-next-line no-new-func
    const C = new Function('return (' + m[1] + ')')();
    // school -> which boards it is on, by gender
    const board = {};
    for (const cls of Object.keys(C)) {
      for (const g of ['M', 'F']) {
        const lg = (C[cls][g] || {}).lg || {};
        for (const league of Object.keys(lg)) {
          for (const school of lg[league]) {
            const k = key(school);
            (board[k] = board[k] || {})[g] = { cls, league, name: school };
          }
        }
      }
    }
    return { CLASSES: C, board };
  }

  /* ---------- marks ---------- */
  // "15:01.01", "15:01", "1:02:03.4" -> seconds; anything else -> null
  function toSeconds(v) {
    if (typeof v === 'number') return v > 0 ? v : null;
    const s = String(v || '').trim();
    if (!/^\d/.test(s)) return null;                 // DNF, DNS, NT, scratches
    const p = s.split(':').map(Number);
    if (p.some(x => !isFinite(x))) return null;
    let sec = 0;
    for (const x of p) sec = sec * 60 + x;
    return sec > 0 ? sec : null;
  }
  /* Round ONCE, to hundredths, and split the integer that comes out.
     Flooring the minutes first and rounding the remainder second lets the two
     halves disagree: 1259.9963s floors to 20 minutes and its remainder rounds
     to "60.00", so the seed carried "20:60.00". The site's own parseCSV
     refuses a seconds field of 60 and drops that row, so a mark leaves the
     database silently - which is how this surfaced, as parseCSV's bad count
     going to 1 on a seed of 8,893. It is about one mark in six thousand, so
     it was latent from the day this was written and simply had to wait for a
     big enough database. Same fault the dashboard's mmss had, one file over. */
  const fmt = s => {
    const c = Math.round(s * 100);
    const m = Math.floor(c / 6000);
    return m + ':' + ((c - m * 6000) / 100).toFixed(2).padStart(5, '0');
  };

  /* ---------- the build ----------
     rows: {g, name, school, grade, seconds, dist, date}
     Trim to three marks an athlete and a dozen athletes a team. Three is what
     the model samples; twelve is deeper than it scores, on purpose - see the
     cap below. */
  const MARKS_PER_ATHLETE = 3;
  /* Seven is what a team races and five is what scores, so seven was the
     obvious cap - and it is wrong for any question about a roster that is not
     this one. Next season is this season minus its seniors, and a squad losing
     four of its seven showed three returners when the real team has a dozen more
     runners nobody had recorded. Twelve gives the returning seven somewhere to
     come from.
     It changes nothing about this season: buildModel slices to the top seven
     anyway. The only cost is seed size. */
  const ATHLETES_PER_TEAM = 12;

  /* Summer does not count. athletic.net carries July running-camp time trials
     under the same season - "5,000 Meters Week 1" at Steens Mountain - and they
     are training, run by whoever turned up, six weeks before anyone is in shape.
     OSAA practice opens in mid-August and the first real meets are the last week
     of the month, so mid-August is the line. */
  const SEASON_START = '08-15';

  /* What a 5,000m schoolboy or schoolgirl race can actually be.
     athletic.net stores a scratch as SortValue 999999, which parses perfectly
     happily into a mark of 16666:39 and then sorts to the back of a roster -
     harmless on a deep team, quietly ruinous on a thin one, where it can reach
     the scoring five. Two more in the same pull were simple mis-entries at
     142:46 and 1368:48.

     The real distribution has a long smooth tail and then a cliff: the slowest
     genuine mark in the state is 51:09, and the next value above it is 142:46.
     An hour is well clear of anything a student can run and well below every
     piece of rubbish. The floor is the same argument from the other end - the
     state record is a shade over 14:00, so 13:00 is a mis-entry or a 3k. */
  const MIN_5K = 13 * 60, MAX_5K = 60 * 60;

  /* ---------- the one untrusted input ----------
     Athlete names come from athletic.net and end up interpolated into
     innerHTML on five different boards, so anything that could be read as
     markup is removed here, at ingest, rather than trusted to be escaped
     correctly at twenty render sites. One choke point the tests can aim at.

     Commas break the seed's columns and quotes break worse: the seed is
     written unquoted and the reader toggles quote mode on any " it meets, so
     a single stray one swallows the rest of the line - mark, grade, team and
     class all folded into the name, silently. athletic.net carries nicknames
     that way, so this is not hypothetical: Benjamin "Finley" Crowell and
     Abigail "Abbie" Hamilton both arrived with the deeper roster cap.

     Apostrophes stay. O'Brien and St Mary's are real, and an apostrophe
     cannot escape a double-quoted attribute or a text node.

     Exported because roster.js ingests the same names from the same site.
     Restated there it would drift the first time this one changed. */
  function cleanName(v) {
    return String(v || '').replace(/[",<>&]/g, ' ')
      /* tab, newline and return are whitespace and are left for the collapse
         below; only the unprintable rest is dropped. */
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ids: { athletic.net team id -> board name }, from teamsFromTree. With it,
     a result counts for an Oregon school only if it carries that school's id,
     and a same-named school from another state is dropped as outOfState.
     Without it (an old saved crawl, a test) the name alone decides, as before. */
  function buildSeed(rows, board, ids) {
    const keep = [];
    const dropped = { dist: 0, unparsed: 0, offBoard: 0, outOfState: 0, preseason: 0,
                      duplicate: 0, implausible: 0 };
    const offBoardNames = new Set(), outOfStateNames = new Set();
    const byId = ids && Object.keys(ids).length ? ids : null;
    const boardOf = (name, g) => (board[lookup(name)] || {})[g];
    let latest = '';

    // the floor moves with the season the results are actually from
    const year = rows.reduce((y, r) => (r.date && r.date > y ? r.date : y), '').slice(0, 4);
    const floor = year ? year + '-' + SEASON_START : '';

    for (const r of rows) {
      const dist = +r.dist;
      if (dist !== 5000 && dist !== MILES_3) { dropped.dist++; continue; }
      if (floor && r.date && r.date < floor) { dropped.preseason++; continue; }
      const sec = toSeconds(r.seconds != null ? r.seconds : r.mark);
      if (!sec) { dropped.unparsed++; continue; }
      // the same bounds, scaled to the distance actually run
      const k = dist / 5000;
      if (sec < MIN_5K * k || sec > MAX_5K * k) { dropped.implausible++; continue; }
      let b;
      if (byId && r.teamId) {
        const own = byId[r.teamId];
        if (!own) {
          // named like a board school but numbered like somebody else's
          if (boardOf(r.school, r.g)) { dropped.outOfState++; outOfStateNames.add(strip(r.school)); }
          else { dropped.offBoard++; if (strip(r.school)) offBoardNames.add(strip(r.school)); }
          continue;
        }
        b = boardOf(own, r.g);
      } else b = boardOf(r.school, r.g);
      // a blank school is an unattached entry, not a school we failed to match,
      // so it is dropped without being reported as one
      if (!b) { dropped.offBoard++; if (strip(r.school)) offBoardNames.add(strip(r.school)); continue; }
      if (r.date && r.date > latest) latest = r.date;
      /* Commas break the columns and quotes break worse. The seed is written
         unquoted, and the reader toggles quote mode on any " it meets: a name
         with a matched pair survives by luck, but a single stray one swallows
         the rest of the line - mark, grade, team and class all folded into the
         name, silently. athletic.net carries nicknames that way, so this is not
         hypothetical: Benjamin "Finley" Crowell and Abigail "Abbie" Hamilton
         both arrived with the deeper roster cap. */
      /* The one untrusted input in the whole system. Athlete names come from
         athletic.net and end up interpolated into innerHTML on five different
         boards, so anything that could be read as markup is removed here, at
         ingest, rather than trusted to be escaped correctly at twenty render
         sites. Quotes and commas would break the CSV; angle brackets and
         ampersands would break the page. Apostrophes stay - O'Brien and St
         Mary's are real, and an apostrophe cannot escape a double-quoted
         attribute or a text node. */
      keep.push({ g: r.g, name: cleanName(r.name), dist,
                  sec, date: r.date || '', grade: String(r.grade || '').replace(/\D/g, ''),
                  team: b.name, cls: b.cls, aid: r.aid || 0, mid: r.mid || '',
                  div: r.div || '', race: +r.race || 1 });
    }

    /* Rate every 5,000m race from every Oregon result read, not only the marks
       that will ship: the more runners who cross between races, the better each
       race is pinned. A mark with no athlete id, meet or date - an old saved
       crawl, the shipped seed read back in a test - keeps whatever factor it
       arrived with, which is 1 unless it came from a seed that had one. */
    const rateable = keep.filter(r => r.dist === 5000 && r.aid && r.mid && r.date);
    const races = rateable.length
      ? fitRaces(rateable.map(r => ({ aid: r.aid, g: r.g, mid: r.mid, secs: r.sec, date: r.date })),
                 { tauPct: RACE_TAU, seasonStart: year + '-' + SEASON_START })
      : null;
    for (const r of rateable) r.race = races.factorFor(r.mid + '|' + r.g);

    /* athlete -> their marks, on the board they belong to.
       Deduplicated on the day and the time: nobody runs two 5,000m races on one
       afternoon in the same hundredth of a second, so a repeat is a meet read
       twice - an interrupted crawl resuming, or a division listed twice - and
       counting it would fill a real mark slot with a copy. */
    /* A 3-mile mark and a 5,000m one are never compared here, so they are two
       separate athletes as far as the trimming goes: the 5,000m seed comes out
       exactly as it did before 3-mile races were read, and the 3-mile rows sit
       on top of it. The site decides whether to use them. */
    const byAthlete = new Map();
    for (const r of keep) {
      const k = r.dist + '|' + r.cls + '|' + r.g + '|' + r.team + '|' + r.name;
      if (!byAthlete.has(k)) byAthlete.set(k, { ...r, marks: [], seen: new Set() });
      const a = byAthlete.get(k);
      // with no date there is nothing to compare, so nothing is deduplicated
      const sig = r.date && r.date + '@' + r.sec;
      if (sig) { if (a.seen.has(sig)) { dropped.duplicate++; continue; } a.seen.add(sig); }
      a.marks.push({ sec: r.sec, race: r.race });
    }
    /* Ranked and trimmed on the race-rated value, which is what the model runs
       on: a 17:40 on a slow day can be the better of two marks than a 17:30 on a
       quick one. The time actually run is what is written. */
    for (const a of byAthlete.values()) {
      a.marks.sort((x, y) => x.sec / x.race - y.sec / y.race);
      a.marks = a.marks.slice(0, MARKS_PER_ATHLETE);
      a.best = a.marks[0].sec / a.marks[0].race;
    }

    // team -> its seven fastest
    const byTeam = new Map();
    for (const a of byAthlete.values()) {
      const k = a.dist + '|' + a.cls + '|' + a.g + '|' + a.team;
      if (!byTeam.has(k)) byTeam.set(k, []);
      byTeam.get(k).push(a);
    }
    const out = [];
    for (const [k, list] of byTeam) {
      list.sort((x, y) => x.best - y.best || (x.name < y.name ? -1 : 1));
      for (const a of list.slice(0, ATHLETES_PER_TEAM)) out.push(a);
    }

    // A stable order, so a refresh that changes nothing produces no diff. Board
    // order rather than alphabetical, or the file opens on 2A/1A.
    const rank = c => ['6A', '5A', '4A', '3A', '2A/1A'].indexOf(c);
    out.sort((a, b) =>
      b.dist - a.dist                       // every 5,000m row, then the 3-mile ones
      || rank(a.cls) - rank(b.cls)
      || (a.g < b.g ? -1 : a.g > b.g ? 1 : 0)
      || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0)
      || a.best - b.best
      || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const lines = ['gender,athlete,mark,grade,team,dist,class,race'];
    for (const a of out)
      for (const m of a.marks)
        lines.push([a.g, a.name, fmt(m.sec), a.grade, a.team, a.dist, a.cls, m.race.toFixed(4)].join(','));

    const five = out.filter(a => a.dist === 5000), miles = out.filter(a => a.dist === MILES_3);
    return {
      csv: lines.join('\n'),
      rows: lines.length - 1,
      athletes: five.length,
      teams: new Set(five.map(a => a.cls + '|' + a.g + '|' + a.team)).size,
      schools: new Set(five.map(a => a.team)).size,
      miles: {
        rows: miles.reduce((n, a) => n + a.marks.length, 0),
        athletes: miles.length,
        teams: [...new Set(miles.map(a => a.team + ' ' + (a.g === 'F' ? 'girls' : 'boys')))].sort(),
      },
      latest, dropped,
      races: races ? races.stats : null,
      /* Every rated race, for the site's race table: which meet, which field,
         how many runners informed the rating, how many of them were 6A (the
         page puts the ratings on the backtest's 6A basis before converting to
         Lane) and the factor itself. */
      raceTable: races ? races.races.map(x => {
        const [mid, g] = x.race.split('|');
        const inRace = rateable.filter(r => r.mid === mid && r.g === g);
        return { mid, g, n: x.n, runners: inRace.length,
                 n6A: inRace.filter(r => r.cls === '6A').length, f: Math.exp(x.effect) };
      }) : [],
      offBoard: [...offBoardNames].sort(),
      outOfState: [...outOfStateNames].sort(),
      h2h: headToHead(keep),
    };
  }

  /* ---------- head to head ----------
     OSAA's at-large committee weighs "head-to-head competition with more
     consideration given to meets later in the season" (the 2025 seeding
     criteria), so the page needs to know who has met whom. A meeting is two
     teams from one board on the same start line - same meet AND same division,
     because varsity and JV share a meet id - each with five finishers there.
     It is scored as the NFHS dual those two would have had: their runners
     alone, seven a side, five score, sixth breaks a tie, a team with no sixth
     loses one.

     Out: { "6A|M": { t: [team names], m: [[a, b, "MM-DD", scoreA, scoreB, res, meetId]] } }
     with res 1 when a won, 0 when b won, 0.5 for a tie nothing could break.
     Rows without a division are skipped rather than guessed at. */
  function dualScore(A, B) {
    const line = A.map(t => [t, 0]).concat(B.map(t => [t, 1])).sort((x, y) => x[0] - y[0]);
    const sum = [0, 0], cnt = [0, 0], sixth = [0, 0];
    line.forEach(([, s], i) => {
      cnt[s]++;
      if (cnt[s] <= 5) sum[s] += i + 1;
      else if (cnt[s] === 6) sixth[s] = i + 1;
    });
    let res = sum[0] < sum[1] ? 1 : sum[0] > sum[1] ? 0 : 0.5;
    if (res === 0.5) {
      if (sixth[0] && (!sixth[1] || sixth[0] < sixth[1])) res = 1;
      else if (sixth[1] && (!sixth[0] || sixth[1] < sixth[0])) res = 0;
    }
    return { a: sum[0], b: sum[1], res };
  }
  function headToHead(keep) {
    /* A team's race at a meet is the division where its own five ran fastest,
       among the divisions where it fielded five. A big invitational runs
       varsity, JV and open races, and two programmes deep enough to field five
       in each would otherwise "meet" three times in one afternoon - their JV
       squads counted as head to head. Only the race both teams sent their best
       five to is a meeting. (Not the division of the fastest runner: a star in
       an individual elite race would take the team's meeting with them.) */
    const byDiv = new Map();
    for (const r of keep) {
      if (r.dist !== 5000 || !r.mid || !r.div) continue;
      const k = r.mid + '|' + r.cls + '|' + r.g + '|' + r.team;
      if (!byDiv.has(k)) byDiv.set(k, new Map());
      const d = byDiv.get(k);
      if (!d.has(r.div)) d.set(r.div, []);
      d.get(r.div).push(r.sec);
    }
    const top = new Map();
    for (const [k, d] of byDiv) {
      let best = null, bestSum = Infinity;
      for (const [div, t] of d) {
        if (t.length < 5) continue;
        const sum = t.sort((x, y) => x - y).slice(0, 5).reduce((a, b) => a + b, 0);
        if (sum < bestSum) { bestSum = sum; best = div; }
      }
      top.set(k, best);
    }
    const races = new Map();
    for (const r of keep) {
      if (r.dist !== 5000 || !r.mid || !r.div) continue;
      if (top.get(r.mid + '|' + r.cls + '|' + r.g + '|' + r.team) !== r.div) continue;
      const k = r.mid + '|' + r.div + '|' + r.cls + '|' + r.g;
      if (!races.has(k)) races.set(k, { mid: r.mid, date: r.date, board: r.cls + '|' + r.g, teams: new Map() });
      const rc = races.get(k), tm = rc.teams.get(r.team) || new Map();
      // one time per athlete per race: a division read twice is not two runs
      if (!tm.has(r.name) || r.sec < tm.get(r.name)) tm.set(r.name, r.sec);
      rc.teams.set(r.team, tm);
    }
    const out = {};
    for (const rc of [...races.values()].sort((x, y) => (x.date < y.date ? -1 : 1))) {
      const five = [...rc.teams].filter(([, m]) => m.size >= 5)
        .map(([name, m]) => [name, [...m.values()].sort((x, y) => x - y).slice(0, 7)])
        .sort((x, y) => (x[0] < y[0] ? -1 : 1));
      if (five.length < 2) continue;
      const B = out[rc.board] || (out[rc.board] = { t: [], m: [], ix: new Map() });
      const id = n => { if (!B.ix.has(n)) { B.ix.set(n, B.t.length); B.t.push(n); } return B.ix.get(n); };
      for (let i = 0; i < five.length; i++) for (let j = i + 1; j < five.length; j++) {
        const d = dualScore(five[i][1], five[j][1]);
        B.m.push([id(five[i][0]), id(five[j][0]), (rc.date || '').slice(5), d.a, d.b, d.res, rc.mid]);
      }
    }
    for (const b of Object.values(out)) delete b.ix;
    return out;
  }

  /* ---------- race ratings ----------
     How fast each race was on its day, the Tully Runners way: a runner's mark is
     divided by it before anything else looks at the mark. Lives here, not in
     backtest/, because the weekly crawl, the browser harness and the backtest all
     have to run the same fit - see backtest/race_ratings.js for the reasoning and
     backtest/athlete_level.js for the evidence. RACE_TAU is the weekly
     improvement held fixed while the races are fitted; chosen leaving one season
     out, it came back -1 or -1.25 every time. */
  const RACE_TAU = -1;
  const median = a => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };

  /* rows: { aid, g, mid, secs, date }  (date as YYYY-MM-DD)
     opts: shrink (k in n/(n+k)), iters, seasonStart (YYYY-MM-DD, week zero),
           tauPct - the weekly improvement, FIXED, as a percentage (-1 = a runner
           gets 1% faster a week). Pass null to estimate it, which is kept only to
           show that it cannot be: on the four backtest seasons the estimate swings
           from +18% to -20% a week between cutoffs. The race terms are barely
           shrunk (a field of eighty gives n/(n+k) of 0.9), so "everyone got fitter"
           and "the later races were quicker" are the same equation and the slope
           wanders between them. Meylan resolves it by judgment and by rating
           against recent form. Here it is one number chosen the way the variance
           dial is: by which value forecasts best across every season. */
  function fitRaces(rows, opts) {
    const o = Object.assign({ shrink: 8, iters: 60, seasonStart: null, tauPct: -1 }, opts || {});
    const FIXED = o.tauPct !== null && o.tauPct !== undefined;
    const DAY = 864e5;
    const t0 = new Date((o.seasonStart || rows.reduce((m, r) => r.date < m ? r.date : m, '9999')) + 'T12:00:00');
    const week = d => (new Date(d + 'T12:00:00') - t0) / (7 * DAY);

    // one observation per athlete per race; a repeat is the same race read twice
    const seen = new Set(), obs = [];
    for (const r of rows) {
      // a race is a meet and a gender, or finer if the caller says so (r.race):
      // varsity and JV at one meet are different fields at different times
      const race = r.race || (r.mid + '|' + r.g), k = r.aid + '|' + race;
      if (seen.has(k) || !(r.secs > 0) || !r.date) continue;
      seen.add(k);
      obs.push({ a: r.aid + '|' + r.g, race, y: Math.log(r.secs), w: week(r.date) });
    }
    const per = new Map();
    for (const x of obs) per.set(x.a, (per.get(x.a) || 0) + 1);
    const fitObs = obs.filter(x => per.get(x.a) >= 2);

    const A = new Map(), R = new Map();
    const byA = new Map(), byR = new Map();
    for (const x of fitObs) {
      (byA.get(x.a) || byA.set(x.a, []).get(x.a)).push(x);
      (byR.get(x.race) || byR.set(x.race, []).get(x.race)).push(x);
      R.set(x.race, 0);
    }
    let tau = FIXED ? Math.log(1 + o.tauPct / 100) : 0;
    for (let it = 0; it < o.iters; it++) {
      for (const [a, xs] of byA) A.set(a, median(xs.map(x => x.y - tau * x.w - R.get(x.race))));
      for (const [race, xs] of byR) {
        const m = median(xs.map(x => x.y - A.get(x.a) - tau * x.w));
        R.set(race, m * xs.length / (xs.length + o.shrink));
      }
      // tau from within-athlete variation only: centre each athlete's weeks
      let num = 0, den = 0;
      if (!FIXED) {
      for (const xs of byA.values()) {
        const wb = xs.reduce((s, x) => s + x.w, 0) / xs.length;
        for (const x of xs) {
          const dw = x.w - wb;
          num += dw * (x.y - A.get(x.a) - R.get(x.race));
          den += dw * dw;
        }
      }
      // the least-squares slope of what the athlete and race terms leave
      tau = den ? num / den : 0;
      }
      // pin the level: races average zero, weighted by field size
      let s = 0, n = 0;
      for (const [race, xs] of byR) { s += R.get(race) * xs.length; n += xs.length; }
      const mu = n ? s / n : 0;
      for (const race of R.keys()) R.set(race, R.get(race) - mu);
      for (const a of A.keys()) A.set(a, A.get(a) + mu);
    }

    const races = [...byR.entries()].map(([race, xs]) => ({ race, n: xs.length, effect: R.get(race) }));
    return {
      tau,                                    // log-time per week; negative = getting faster
      races,
      /* The factor a mark is divided by. mode 'race' removes the race; 'trend'
         also moves the mark from its date to `toDate` at the fitted rate. A race
         the fit never saw (nobody in it raced twice) is left at 1. */
      factorFor(race, date, mode, toDate) {
        const e = R.has(race) ? R.get(race) : 0;
        if (mode !== 'trend' || !date || !toDate) return Math.exp(e);
        return Math.exp(e + tau * (week(date) - week(toDate)));
      },
      stats: { observations: obs.length, informative: fitObs.length, athletes: byA.size,
               races: byR.size, pctPerWeek: (Math.exp(tau) - 1) * 100 },
    };
  }

  /* ---------- writing it back ---------- */
  function patchIndex(html, csv, dataDate) {
    const a = html.match(/(<script id="seed"[^>]*>)[\s\S]*?(<\/script>)/);
    if (!a) throw new Error('seed block not found');
    let out = html.replace(/(<script id="seed"[^>]*>)[\s\S]*?(<\/script>)/,
      a[1] + '\n' + csv + '\n' + a[2]);
    if (dataDate) {
      if (!/const DATA_DATE="[\d-]+";/.test(out)) throw new Error('DATA_DATE not found');
      out = out.replace(/const DATA_DATE="[\d-]+";/, 'const DATA_DATE="' + dataDate + '";');
    }
    return out;
  }

  /* The crest map. Mascot urls ride along with the team list the crawl already
     fetches, so this costs nothing - it used to be a separate 167-request pass.
     They arrive protocol-relative and unsized; the map wants https and =s96.
     Merge rather than replace: a school with no team on athletic.net this
     season should keep the crest it already had. */
  /* The race table: one row per rated race, [meetId, name, date, gender,
     runners who informed it, of them 6A, factor]. Replaced whole on every
     refresh, inserted beside DATA_DATE the first time. */
  function patchRaces(html, rows) {
    const line = 'const RACES=' + JSON.stringify(rows) + ';';
    if (/const RACES=\[[\s\S]*?\];/.test(html)) return html.replace(/const RACES=\[[\s\S]*?\];/, () => line);
    if (!/const DATA_DATE="[\d-]+";/.test(html)) throw new Error('DATA_DATE not found');
    return html.replace(/(const DATA_DATE="[\d-]+";)/, (m) => m + '\n' + line);
  }

  /* The head-to-head table, replaced whole on every refresh, inserted beside
     DATA_DATE the first time - the same treatment as the race table. */
  function patchH2H(html, h2h) {
    const line = 'const H2H=' + JSON.stringify(h2h || {}) + ';';
    if (/const H2H=\{.*?\};/.test(html)) return html.replace(/const H2H=\{.*?\};/, () => line);
    if (!/const DATA_DATE="[\d-]+";/.test(html)) throw new Error('DATA_DATE not found');
    return html.replace(/(const DATA_DATE="[\d-]+";)/, (m) => m + '\n' + line);
  }

  function patchLogos(html, logos) {
    const m = html.match(/const LOGO=(\{.*?\});/);
    if (!m) throw new Error('LOGO map not found');
    // eslint-disable-next-line no-new-func
    const merged = Object.assign(new Function('return (' + m[1] + ')')(), logos);
    const keys = Object.keys(merged).sort();
    const json = '{' + keys.map(k => JSON.stringify(k) + ': ' + JSON.stringify(merged[k])).join(', ') + '}';
    return html.replace(/const LOGO=\{.*?\};/, 'const LOGO=' + json + ';');
  }

  return { ALIAS, canonical, lookup, key, strip, parseClasses, toSeconds, fmt, buildSeed,
           cleanName,
           patchIndex, patchLogos, patchRaces, patchH2H, dualScore, headToHead, SEASON_START, MIN_5K, MAX_5K,
           OREGON_DIV, MILES_3, divMetres, wantDiv, resultRow, teamsFromTree, fitRaces, RACE_TAU,
           MARKS_PER_ATHLETE, ATHLETES_PER_TEAM };
}));
