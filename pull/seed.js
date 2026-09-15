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
     recorded; there is no distance field. The imperial divisions ("3 Miles
     Varsity Boys") are meant to come out as 0 and be dropped - the board is
     5,000m and nothing is ever converted - so a meet of nothing but 3-mile
     races contributing no rows is right rather than broken. */
  function divMetres(name) {
    const m = String(name || '').match(/([\d,]+)\s*Meters/i);
    return m ? +m[1].replace(/,/g, '') : 0;
  }

  /* One athletic.net result -> one row for buildSeed, or null to skip it.
     SortValue is already seconds, which saves parsing Result, but it is also
     where the 999999 scratch sentinel lives - buildSeed's bounds catch that. */
  function resultRow(r, date) {
    if (!r || r.Exhibition) return null;     // unattached, not on anyone's roster
    return {
      g: r.Gender,
      name: ((r.FirstName || '') + ' ' + (r.LastName || '')).trim(),
      school: r.SchoolName,
      grade: r.Grade || r.AgeGrade || '',
      seconds: r.SortValue || r.Result,
      dist: 5000,
      date: date || '',
    };
  }

  /* The Oregon division tree -> the teams worth crawling, and their crests.
     One school is aligned to several divisions (its league, its classification,
     a regional grouping), so it appears several times; keep the busiest row,
     which is the one whose ResultCount is real. */
  function teamsFromTree(alignedTeams, board) {
    const seen = new Map(), logos = {};
    for (const r of alignedTeams || []) {
      const b = board[lookup(r.SchoolName)];
      if (!b) continue;                      // not a school on an OSAA board
      const name = Object.values(b)[0].name;  // spell it the board's way
      if (r.MascotUrl && !logos[name]) logos[name] = 'https:' + r.MascotUrl + '=s96';
      const prev = seen.get(name);
      if (!prev || (r.ResultCount || 0) > prev.results)
        seen.set(name, { id: r.SchoolID, name, results: r.ResultCount || 0 });
    }
    const onBoard = new Set(Object.values(board).map(v => Object.values(v)[0].name));
    return {
      teams: [...seen.values()],
      logos,
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
  const fmt = s => {
    const m = Math.floor(s / 60);
    return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0');
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

  function buildSeed(rows, board) {
    const keep = [];
    const dropped = { dist: 0, unparsed: 0, offBoard: 0, preseason: 0, duplicate: 0, implausible: 0 };
    const offBoardNames = new Set();
    let latest = '';

    // the floor moves with the season the results are actually from
    const year = rows.reduce((y, r) => (r.date && r.date > y ? r.date : y), '').slice(0, 4);
    const floor = year ? year + '-' + SEASON_START : '';

    for (const r of rows) {
      if (+r.dist !== 5000) { dropped.dist++; continue; }
      if (floor && r.date && r.date < floor) { dropped.preseason++; continue; }
      const sec = toSeconds(r.seconds != null ? r.seconds : r.mark);
      if (!sec) { dropped.unparsed++; continue; }
      if (sec < MIN_5K || sec > MAX_5K) { dropped.implausible++; continue; }
      const b = (board[lookup(r.school)] || {})[r.g];
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
      keep.push({ g: r.g, name: String(r.name || '').replace(/[",<>&]/g, ' ')
                    /* tab, newline and return are whitespace and are left for the
                       collapse below; only the unprintable rest is dropped. */
                    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
                    .replace(/\s+/g, ' ').trim(),
                  sec, date: r.date || '', grade: String(r.grade || '').replace(/\D/g, ''),
                  team: b.name, cls: b.cls });
    }

    /* athlete -> their marks, on the board they belong to.
       Deduplicated on the day and the time: nobody runs two 5,000m races on one
       afternoon in the same hundredth of a second, so a repeat is a meet read
       twice - an interrupted crawl resuming, or a division listed twice - and
       counting it would fill a real mark slot with a copy. */
    const byAthlete = new Map();
    for (const r of keep) {
      const k = r.cls + '|' + r.g + '|' + r.team + '|' + r.name;
      if (!byAthlete.has(k)) byAthlete.set(k, { ...r, marks: [], seen: new Set() });
      const a = byAthlete.get(k);
      // with no date there is nothing to compare, so nothing is deduplicated
      const sig = r.date && r.date + '@' + r.sec;
      if (sig) { if (a.seen.has(sig)) { dropped.duplicate++; continue; } a.seen.add(sig); }
      a.marks.push(r.sec);
    }
    for (const a of byAthlete.values()) {
      a.marks.sort((x, y) => x - y);
      a.marks = a.marks.slice(0, MARKS_PER_ATHLETE);
      a.best = a.marks[0];
    }

    // team -> its seven fastest
    const byTeam = new Map();
    for (const a of byAthlete.values()) {
      const k = a.cls + '|' + a.g + '|' + a.team;
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
      rank(a.cls) - rank(b.cls)
      || (a.g < b.g ? -1 : a.g > b.g ? 1 : 0)
      || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0)
      || a.best - b.best
      || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const lines = ['gender,athlete,mark,grade,team,dist,class'];
    for (const a of out)
      for (const sec of a.marks)
        lines.push([a.g, a.name, fmt(sec), a.grade, a.team, 5000, a.cls].join(','));

    return {
      csv: lines.join('\n'),
      rows: lines.length - 1,
      athletes: out.length,
      teams: byTeam.size,
      schools: new Set(out.map(a => a.team)).size,
      latest, dropped,
      offBoard: [...offBoardNames].sort(),
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
           patchIndex, patchLogos, SEASON_START, MIN_5K, MAX_5K,
           OREGON_DIV, divMetres, resultRow, teamsFromTree,
           MARKS_PER_ATHLETE, ATHLETES_PER_TEAM };
}));
