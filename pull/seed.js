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
     Trim to three marks an athlete and seven athletes a team, which is what the
     model uses and keeps the file a third of the size it would be raw. */
  const MARKS_PER_ATHLETE = 3;
  const ATHLETES_PER_TEAM = 7;

  /* Summer does not count. athletic.net carries July running-camp time trials
     under the same season - "5,000 Meters Week 1" at Steens Mountain - and they
     are training, run by whoever turned up, six weeks before anyone is in shape.
     OSAA practice opens in mid-August and the first real meets are the last week
     of the month, so mid-August is the line. */
  const SEASON_START = '08-15';

  function buildSeed(rows, board) {
    const keep = [];
    const dropped = { dist: 0, unparsed: 0, offBoard: 0, preseason: 0, duplicate: 0 };
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
      const b = (board[lookup(r.school)] || {})[r.g];
      // a blank school is an unattached entry, not a school we failed to match,
      // so it is dropped without being reported as one
      if (!b) { dropped.offBoard++; if (strip(r.school)) offBoardNames.add(strip(r.school)); continue; }
      if (r.date && r.date > latest) latest = r.date;
      keep.push({ g: r.g, name: String(r.name || '').replace(/,/g, ' ').trim(),
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
           patchIndex, patchLogos, SEASON_START,
           MARKS_PER_ATHLETE, ATHLETES_PER_TEAM };
}));
