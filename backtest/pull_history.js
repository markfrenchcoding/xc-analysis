// node backtest/pull_history.js [year ...]        default: 2022 2023 2024 2025
//
// Every Oregon school's season, every classification, for the backtest.
//
// pull_season.js pulls one 6A season and needs its eight championship meet ids
// typed into seasons.json first. That does not scale to forty leagues across
// five classifications whose alignment changed in 2022 and whose meet ids
// nobody has written down. So this asks for everything and lets the data say
// which meets were the championships:
//
//   1. GetTree on Oregon: every school athletic.net has, with its id
//   2. every school's whole season, one GET each (GetResultsGrid)
//   3. the championships are found in what came back: the state meets are the
//      November meets named "state", and every meet in the three and a half
//      weeks before them that three or more schools ran is read division by
//      division, because only the meet endpoint says which race was varsity.
//      Reading a few invitationals too costs a minute and guesses nothing.
//   4. any school that turned up in a championship but is not in today's tree
//      (closed, merged, renamed) gets its season pulled as well
//
// Writes, per year, to backtest/hist/ - committed, so the per-classification
// builds can run anywhere, including where athletic.net cannot be reached:
//
//   <year>-results.csv.gz  every 5,000m and 3-mile result
//   <year>-meets.json      every meet's date and name, and the championship
//                          meets with their divisions
//   tree.json              today's alignment rows, for mapping names to boards
//
// Resumes from backtest/raw/hist-<year>.jsonl, so a run that dies at school 300
// starts again at school 300. Runs from a home connection only, for the reason
// in pull/crawl.js.
//
// Exit 0 wrote every year asked for; 2 refused at least one (too much missing);
// 1 could not run at all.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const API = 'https://www.athletic.net/api/v1/';
const OREGON_DIV = 87377;   // cross country only: division ids are per sport
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const GAP_GET = 700, GAP_POST = 2000, TRIES = 5;
const OUT = path.join(__dirname, 'hist');
const RAW = path.join(__dirname, 'raw');

const log = (...a) => console.log(...a);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const day = d => String(d || '').slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10); };

/* Distance is in the division's name and nowhere else. 3 Miles is kept for the
   same reason the live crawl reads it; nothing is converted here. */
function metresOf(name) {
  const s = String(name || '');
  const m = s.match(/([\d,]+)\s*Met(?:er|re)s?/i);
  if (m) return +m[1].replace(/,/g, '');
  if (/\b3\s*Miles?\b/i.test(s)) return 4828;
  return 0;
}
const keepDist = d => d === 5000 || (d >= 4820 && d <= 4830);

/* ---------- transport: curl, because it can read a 429 ---------- */
function curl(url, post, token) {
  const args = ['-sS', '-m', '60', '-D', '-', '-H', 'User-Agent: ' + UA,
    '-H', 'Accept: application/json, text/plain, */*'];
  if (token) args.push('-H', 'anettokens: ' + token);
  if (post) args.push('-X', 'POST', '-H', 'Content-Type: application/json',
    '-d', JSON.stringify(post));
  args.push(url);
  const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let rest = raw, status = 0, retryAfter = 0;
  for (;;) {
    const cut = rest.indexOf('\r\n\r\n') >= 0 ? rest.indexOf('\r\n\r\n') + 4
      : rest.indexOf('\n\n') >= 0 ? rest.indexOf('\n\n') + 2 : -1;
    if (cut < 0 || !/^HTTP\//.test(rest)) break;
    const head = rest.slice(0, cut);
    status = +(head.match(/^HTTP\/[\d.]+ (\d+)/) || [, 0])[1];
    retryAfter = +(head.match(/^retry-after:\s*(\d+)/im) || [, 0])[1];
    rest = rest.slice(cut);
  }
  return { status, retryAfter, body: rest };
}

function ask(url, post, token) {
  let waits = 0;
  for (let i = 0; i < TRIES; i++) {
    let r;
    try { r = curl(url, post, token); }
    catch (e) { log('    curl: ' + String(e.message).slice(0, 60)); r = { status: 0, body: '' }; }
    if (r.status === 200) { try { return JSON.parse(r.body); } catch (e) { log('    bad json'); } }
    else if (r.status === 404) throw new Error('404');
    // A 429 is an instruction, not a failure: wait and do not spend a try on it.
    else if (r.status === 429) {
      const w = Math.max(r.retryAfter + 3, 23) * 1000;
      log('    429, waiting ' + Math.round(w / 1000) + 's');
      sleep(w); if (++waits < 30) i--; continue;
    } else if (/Just a moment|Enable JavaScript/i.test(r.body)) {
      throw new Error('Cloudflare challenge - this machine cannot reach athletic.net');
    } else log('    status ' + r.status + ', retrying');
    sleep(1500 * (i + 1));
  }
  throw new Error('gave up on ' + url.replace(API, '').slice(0, 60));
}

/* ---------- reading the three payloads ---------- */
function gridRows(j, schoolId, school) {
  const meta = {};
  for (const m of j.meets || []) meta[m.IDMeet] = { date: day(m.StartDate), name: m.MeetName || '' };
  const rows = [];
  for (const r of j.results || []) {
    const d = +r.Distance;
    if (!keepDist(d) || !(+r.SortValue > 0)) continue;
    rows.push({ aid: r.IDAthlete, first: (r.FirstName || '').trim(), last: (r.LastName || '').trim(),
      grade: r.ShortDesc || '', place: r.Place || '', sid: schoolId, school,
      g: r.GenderID || r.Gender, dist: d, s: +r.SortValue, mid: String(r.MeetID), div: '' });
  }
  return { rows, meta };
}

function meetRows(md, divResults) {
  const rows = [];
  for (const { div, results } of divResults) for (const r of results) {
    if (r.Exhibition || !(+r.SortValue > 0)) continue;
    rows.push({ aid: r.AthleteID, first: (r.FirstName || '').trim(), last: (r.LastName || '').trim(),
      grade: r.Grade || r.AgeGrade || '', place: r.Place || '', sid: r.TeamID || '',
      school: r.SchoolName || '', g: r.Gender, dist: metresOf(div.DivName), s: +r.SortValue,
      mid: String(md.meet.IDMeet || md.meetId || ''), div: div.DivName || '' });
  }
  return rows;
}

/* ---------- which meets were the championships ----------
   Pure, so the tests can aim at it. `meets` is id -> {date, name}; `attend`
   is id -> number of schools whose grid carried the meet. */
function pickChamps(year, meets, attend) {
  const ids = Object.keys(meets);
  const inWin = (id, lo, hi) => meets[id].date >= lo && meets[id].date <= hi;
  let state = ids.filter(id => inWin(id, year + '-10-25', year + '-11-20')
    && /\bstate\b/i.test(meets[id].name) && !/\b(?:wa|washington|idaho|nike|nxr)\b/i.test(meets[id].name)
    && (attend[id] || 0) >= 5);
  // a season whose state meet is not called "state" still has one: the busiest
  // November meet. Said out loud in the report, never silently.
  let guessed = false;
  if (!state.length) {
    const nov = ids.filter(id => inWin(id, year + '-10-25', year + '-11-20'))
      .sort((a, b) => (attend[b] || 0) - (attend[a] || 0));
    if (nov.length) { state = [nov[0]]; guessed = true; }
  }
  const stateDate = state.map(id => meets[id].date).sort()[0] || (year + '-11-05');
  const lo = addDays(stateDate, -25);
  const districts = ids.filter(id => !state.includes(id)
    && meets[id].date >= lo && meets[id].date < stateDate && (attend[id] || 0) >= 3);
  return { state: state.sort(), stateDate, districts: districts.sort(), guessed };
}

/* ---------- one year ---------- */
function cacheFor(year) {
  const f = path.join(RAW, 'hist-' + year + '.jsonl');
  const have = { grid: new Map(), meet: new Map() };
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); have[o.kind].set(String(o.id), o); } catch (e) { /* torn last line */ }
  }
  return { have, put: o => { fs.appendFileSync(f, JSON.stringify(o) + '\n'); have[o.kind].set(String(o.id), o); } };
}

function pullYear(year, schools) {
  const t0 = Date.now();
  log('\n' + year);
  const C = cacheFor(year);
  const failed = [];

  const pullGrid = (id, name) => {
    if (C.have.grid.has(String(id))) return;
    try {
      const j = ask(API + 'TeamHome/GetResultsGrid?teamId=' + id + '&seasonId=' + year);
      const g = gridRows(j, id, name);
      C.put({ kind: 'grid', id: String(id), name, rows: g.rows, meta: g.meta });
    } catch (e) {
      if (/cannot reach athletic\.net/.test(e.message)) throw e;
      if (e.message === '404') C.put({ kind: 'grid', id: String(id), name, rows: [], meta: {} });
      else { failed.push('school ' + name); log('  ' + name + ': ' + e.message.slice(0, 50)); }
    }
    sleep(GAP_GET);
  };

  let n = 0;
  const todo = schools.filter(s => !C.have.grid.has(String(s.id)));
  log('  ' + schools.length + ' schools, ' + (schools.length - todo.length) + ' already in the cache');
  for (const s of todo) {
    pullGrid(s.id, s.name);
    if (++n % 25 === 0) log('  ' + n + '/' + todo.length + ' schools');
  }

  // what the grids say happened this season
  const meets = {}, attend = {};
  for (const o of C.have.grid.values()) {
    const seen = new Set();
    for (const [mid, m] of Object.entries(o.meta || {})) if (!meets[mid]) meets[mid] = m;
    for (const r of o.rows) if (!seen.has(r.mid)) { seen.add(r.mid); attend[r.mid] = (attend[r.mid] || 0) + 1; }
  }
  const P = pickChamps(year, meets, attend);
  log('  state: ' + P.state.map(id => id + ' ' + meets[id].name).join('; ')
    + (P.guessed ? '   (no meet named "state": took the busiest November meet)' : ''));
  log('  ' + P.districts.length + ' meets in the ' + addDays(P.stateDate, -25) + ' to '
    + P.stateDate + ' window, read division by division');

  /* The 6A meets already typed into seasons.json are read whatever the window
     says, and the report says if the window would have missed one. */
  let known6A = [];
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'))[year];
    if (sc) known6A = [sc.state, ...Object.values(sc.districts)].map(String);
  } catch (e) { /* no seasons.json entry is fine */ }
  const missed = known6A.filter(id => !P.state.includes(id) && !P.districts.includes(id));
  if (missed.length) log('  the window missed ' + missed.length + ' known 6A championship meet(s): '
    + missed.join(', ') + ' - reading them anyway');
  const champs = {};
  for (const mid of [...new Set([...P.state, ...P.districts, ...missed])]) {
    if (!meets[mid]) meets[mid] = { date: '', name: '' };
    let o = C.have.meet.get(mid);
    if (!o) {
      try {
        const md = ask(API + 'Meet/GetMeetData?meetId=' + mid + '&sport=xc');
        md.meet = md.meet || {}; md.meet.IDMeet = md.meet.IDMeet || mid;
        const divResults = [];
        for (const d of (md.xcDivisions || []).filter(x => keepDist(metresOf(x.DivName)))) {
          sleep(GAP_POST);
          const j = ask(API + 'Meet/GetResultsData3', { divId: d.IDMeetDiv, meetId: mid }, md.jwtMeet);
          divResults.push({ div: d, results: j.resultsXC || [] });
        }
        o = { kind: 'meet', id: mid,
          name: md.meet.Name || meets[mid].name, date: day(md.meet.MeetDate || md.meet.StartDate) || meets[mid].date,
          divisions: divResults.map(x => ({ id: x.div.IDMeetDiv, name: x.div.DivName, n: x.results.length })),
          rows: meetRows(md, divResults) };
        C.put(o);
      } catch (e) {
        if (/cannot reach athletic\.net/.test(e.message)) throw e;
        failed.push('meet ' + mid + ' ' + meets[mid].name);
        log('  meet ' + mid + ': ' + e.message.slice(0, 50));
        continue;
      }
      sleep(GAP_GET);
    }
    champs[mid] = { name: o.name, date: o.date, state: P.state.includes(mid), divisions: o.divisions };
    if (!meets[mid].date) meets[mid] = { date: o.date, name: o.name };
    log('    ' + o.date + '  ' + o.name.slice(0, 48).padEnd(48) + o.rows.length + ' results');
  }

  // schools that raced a championship but are not in today's tree
  const known = new Set([...C.have.grid.keys()]);
  const extra = new Map();
  for (const mid in champs) for (const r of C.have.meet.get(mid).rows)
    if (r.sid && !known.has(String(r.sid))) extra.set(String(r.sid), r.school);
  if (extra.size) log('  ' + extra.size + ' more schools from the championships: '
    + [...extra.values()].slice(0, 8).join(', ') + (extra.size > 8 ? ', ...' : ''));
  for (const [id, name] of extra) pullGrid(id, name);
  for (const o of C.have.grid.values()) for (const [mid, m] of Object.entries(o.meta || {}))
    if (!meets[mid]) meets[mid] = m;

  /* Assemble. A championship result is kept from the meet endpoint, which
     carries the division name; the grid's copy of the same row is dropped. */
  const rows = [], seen = new Set();
  const key = r => r.aid + '|' + r.mid + '|' + r.s;
  for (const mid in champs) for (const r of C.have.meet.get(mid).rows) {
    if (!keepDist(r.dist) || seen.has(key(r))) continue; seen.add(key(r)); rows.push(r);
  }
  const champRows = rows.length;
  for (const o of C.have.grid.values()) for (const r of o.rows) {
    if (seen.has(key(r))) continue; seen.add(key(r)); rows.push(r);
  }

  /* Refuse rather than write a quietly partial season. A missing state meet
     is the truth itself; a few missing invitationals are not. */
  const stateMissing = P.state.filter(id => !champs[id]);
  const schoolFails = failed.filter(f => f.startsWith('school')).length;
  const why = [];
  if (!P.state.length) why.push('no state meet found');
  if (stateMissing.length) why.push('state meet never answered');
  if (schoolFails > Math.max(3, 0.02 * schools.length)) why.push(schoolFails + ' schools failed');
  if (rows.length < 5000) why.push('only ' + rows.length + ' results');
  if (why.length) {
    log('  REFUSED ' + year + ': ' + why.join('; ') + '. Run it again - the cache keeps what worked.');
    return false;
  }

  const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const head = 'athleteId,first,last,grade,place,schoolId,school,gender,dist,seconds,meetId,divName';
  const lines = [head];
  rows.sort((a, b) => (a.mid < b.mid ? -1 : a.mid > b.mid ? 1 : 0) || a.s - b.s);
  for (const r of rows) lines.push([r.aid, r.first, r.last, r.grade, r.place, r.sid, r.school,
    r.g, r.dist, r.s, r.mid, r.div].map(esc).join(','));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, year + '-results.csv.gz'), zlib.gzipSync(lines.join('\n') + '\n', { level: 9 }));
  const usedMeets = {};
  for (const r of rows) if (!usedMeets[r.mid]) usedMeets[r.mid] = meets[r.mid] || champs[r.mid] || {};
  fs.writeFileSync(path.join(OUT, year + '-meets.json'), JSON.stringify({
    year: +year, pulled: new Date().toISOString().slice(0, 10), stateDate: P.stateDate,
    stateGuessed: P.guessed, state: P.state, champs,
    meets: Object.fromEntries(Object.entries(usedMeets).map(([k, v]) => [k, { date: v.date, name: v.name }])),
    failed,
  }, null, 1));
  log('  wrote ' + rows.length + ' results (' + champRows + ' from championship meets), '
    + Object.keys(usedMeets).length + ' meets' + (failed.length ? ', ' + failed.length + ' not answered' : '')
    + ', ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
  return true;
}

function main() {
  const years = process.argv.slice(2).filter(a => /^\d{4}$/.test(a));
  const YEARS = years.length ? years : ['2022', '2023', '2024', '2025'];
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  log('Oregon schools from athletic.net ...');
  const t = ask(API + 'DivisionHome/GetTree?sport=xc&divisionId=' + OREGON_DIV + '&depth=4&includeTeams=true');
  const aligned = t.alignedTeams || [];
  const byId = new Map();
  for (const r of aligned) if (r.SchoolID && !byId.has(String(r.SchoolID)))
    byId.set(String(r.SchoolID), { id: r.SchoolID, name: r.SchoolName });
  if (byId.size < 200) throw new Error('only ' + byId.size + ' schools in the tree - not writing anything');
  // today's alignment, kept whole apart from the crest urls
  fs.writeFileSync(path.join(OUT, 'tree.json'), JSON.stringify({
    pulled: new Date().toISOString().slice(0, 10),
    divisions: t.divisions || t.children || null,
    alignedTeams: aligned.map(r => { const o = { ...r }; delete o.MascotUrl; return o; }),
  }));
  log('  ' + byId.size + ' schools');
  sleep(GAP_GET);

  let ok = true;
  for (const y of YEARS) ok = pullYear(y, [...byId.values()]) && ok;
  return ok ? 0 : 2;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (e) { console.error('\n  ' + e.message); process.exitCode = 1; }
}
module.exports = { metresOf, pickChamps, gridRows, meetRows, keepDist };
