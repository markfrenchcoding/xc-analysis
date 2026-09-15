// node backtest/pull_season.js <year>
//
// Pulls one past 6A season off athletic.net into the two raw artifacts
// build_season.js turns into committed data:
//
//   backtest/raw/y<year>_raw.csv    every 5,000m result that season
//   backtest/raw/y<year>_meta.json  each meet's date, which is what makes a cutoff mean anything
//
// Needs seasons.json to already hold the year's district and state meet ids.
// Runs from a home connection only, for the reason set out in pull/crawl.js.
//
// TWO ENDPOINTS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS
//
// The marks database is "what had this team run by date X", and a team's whole
// season comes back in a single unauthenticated GET:
//
//   TeamHome/GetResultsGrid?teamId=N&seasonId=YYYY
//
// - every result, not just bests (Jesuit 2022: 793 rows, up to 11 an athlete)
// - each row carries the athlete id, grade, distance, seconds and meet id
// - a meets[] array gives every meet's date, which is the whole of the metadata
//
// That is one request per team. Crawling it the other way - every team's
// calendar, then every division of every meet - costs several hundred requests
// against the one endpoint that is rate limited, and takes about forty minutes a
// season instead of about one.
//
// The truth is a different question: "who was in the varsity race". The grid
// carries no division name, and the district varsity race has to be told apart
// from the junior varsity one, so the seven districts and the state meet are
// still read the slow way. That is eight meets rather than a hundred and twenty.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const YEAR = process.argv[2];
if (!/^\d{4}$/.test(YEAR || '')) {
  console.error('usage: node backtest/pull_season.js <year>');
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'))[YEAR];
if (!CFG) { console.error('no seasons.json entry for ' + YEAR); process.exit(1); }

const RAW = path.join(__dirname, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const API = 'https://www.athletic.net/api/v1/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
// GetResultsGrid is a plain GET on a different budget from the results POST,
// which is the one limited to about ten requests in ten seconds.
const GAP_GET = 700, GAP_POST = 2000, TRIES = 5;

const log = (...a) => console.log(...a);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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
  for (let i = 0; i < TRIES; i++) {
    let r;
    try { r = curl(url, post, token); }
    catch (e) { log('    curl: ' + String(e.message).slice(0, 60)); r = { status: 0, body: '' }; }
    if (r.status === 200) { try { return JSON.parse(r.body); } catch (e) { log('    bad json'); } }
    else if (r.status === 404) throw new Error('404');
    else if (r.status === 429) {
      const w = Math.max(r.retryAfter + 3, 20) * 1000;
      log('    429, waiting ' + Math.round(w / 1000) + 's');
      sleep(w); continue;
    } else if (/Just a moment|Enable JavaScript/i.test(r.body)) {
      throw new Error('Cloudflare challenge — this machine cannot reach athletic.net');
    } else log('    status ' + r.status + ', retrying');
    sleep(1500 * (i + 1));
  }
  throw new Error('gave up on ' + url.replace(API, '').slice(0, 50));
}

const metresOf = n => {
  const m = String(n || '').match(/([\d,]+)\s*Meters/i);
  return m ? +m[1].replace(/,/g, '') : 0;
};
const day = d => String(d || '').slice(0, 10);

/* ---------- the eight meets that are the truth ----------
   Read division by division, because separating the varsity race from the
   junior varsity one is the whole point and only the meet endpoint says which
   is which. These also hand over every 6A team's id, so nothing about the
   season's alignment has to be known in advance. */
function truthMeets() {
  const rows = [], meta = {}, ids = new Map();
  for (const [label, mid] of [['state', CFG.state],
    ...Object.entries(CFG.districts)]) {
    const isState = String(mid) === String(CFG.state);
    const md = ask(API + 'Meet/GetMeetData?meetId=' + mid + '&sport=xc');
    meta[mid] = {
      date: day((md.meet || {}).MeetDate || (md.meet || {}).StartDate),
      name: (md.meet || {}).Name || '',
      venue: ((md.meet || {}).Location || {}).Name || '',
    };
    let n = 0;
    /* The state meet is 6A only in some years and every classification in
       others - 2022 to 2024 list two divisions, 2025 lists nine. Taking them
       all pulled 145 schools into 2025 instead of 50 and doubled the season.
       It did no harm to the seeds, which are filtered to league members, but it
       is the wrong data and it made the seasons look unlike each other.
       build_season.js reads the state result through the same /6A/ filter. */
    for (const d of (md.xcDivisions || []).filter(x => metresOf(x.DivName) === 5000
      && (!isState || /6A/.test(x.DivName)))) {
      sleep(GAP_POST);
      const j = ask(API + 'Meet/GetResultsData3', { divId: d.IDMeetDiv, meetId: mid }, md.jwtMeet);
      for (const r of (j.resultsXC || [])) {
        if (r.Exhibition || !(+r.SortValue > 0)) continue;
        if (r.TeamID && r.SchoolName && !ids.has(r.SchoolName)) ids.set(r.SchoolName, r.TeamID);
        rows.push({ aid: r.AthleteID, first: (r.FirstName || '').trim(),
          last: (r.LastName || '').trim(), grade: r.Grade || r.AgeGrade || '',
          place: r.Place || '', school: r.SchoolName || '', g: r.Gender,
          dist: 5000, s: r.SortValue, mid: String(mid), divName: d.DivName });
        n++;
      }
    }
    log('  ' + label.padEnd(26) + meta[mid].date + '  ' + n + ' results');
    sleep(GAP_GET);
  }
  return { rows, meta, ids };
}

/* ---------- every team's whole season, one request each ----------
   The grid says nothing about divisions, which does not matter: a marks
   database does not care which race a time was run in, only when and how fast.
   School comes from the team being asked about rather than from the row. */
function teamSeason(school, id) {
  const j = ask(API + 'TeamHome/GetResultsGrid?teamId=' + id + '&seasonId=' + YEAR);
  const meta = {};
  for (const m of j.meets || []) meta[m.IDMeet] = { date: day(m.StartDate), name: m.MeetName || '' };
  const rows = [];
  for (const r of j.results || []) {
    if (+r.Distance !== 5000 || !(+r.SortValue > 0)) continue;
    rows.push({ aid: r.IDAthlete, first: (r.FirstName || '').trim(),
      last: (r.LastName || '').trim(), grade: r.ShortDesc || '', place: r.Place || '',
      school, g: r.GenderID || r.Gender, dist: 5000, s: r.SortValue,
      mid: String(r.MeetID), divName: '' });
  }
  return { rows, meta };
}

/* ---------- run ---------- */
function main() {
  const t0 = Date.now();
  log('pulling ' + YEAR);

  log('  the eight championship meets, division by division:');
  const T = truthMeets();
  log('  ' + T.ids.size + ' schools with team ids');

  const meta = { ...T.meta };
  const rows = [...T.rows];
  const seen = new Set(T.rows.map(r => r.aid + '|' + r.mid + '|' + r.s));

  let n = 0, kept = 0;
  for (const [school, id] of T.ids) {
    try {
      const g = teamSeason(school, id);
      for (const mid in g.meta) if (!meta[mid]) meta[mid] = g.meta[mid];
      for (const r of g.rows) {
        /* The championship meets are in the grid too. Keep the copy that came
           from the meet endpoint, which is the one carrying a division name. */
        const k = r.aid + '|' + r.mid + '|' + r.s;
        if (seen.has(k)) continue;
        seen.add(k); rows.push(r); kept++;
      }
    } catch (e) {
      log('  ' + school + ': ' + e.message.slice(0, 50));
      if (/cannot reach athletic\.net/.test(e.message)) throw e;
    }
    if (++n % 10 === 0) log('  ' + n + '/' + T.ids.size + ' teams, ' + rows.length + ' results');
    sleep(GAP_GET);
  }

  const esc = v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const head = 'athleteId,first,last,grade,place,school,gender,dist,seconds,meetId,meetName,divName';
  const lines = [head];
  for (const r of rows) lines.push([r.aid, r.first, r.last, r.grade, r.place, r.school,
    r.g, r.dist, r.s, r.mid, (meta[r.mid] || {}).name || '', r.divName].map(esc).join(','));

  fs.writeFileSync(path.join(RAW, 'y' + YEAR + '_raw.csv'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(RAW, 'y' + YEAR + '_meta.json'),
    JSON.stringify({ year: +YEAR, meets: meta }, null, 2));

  log('\n  ' + rows.length + ' results (' + T.rows.length + ' from the championship meets, '
    + kept + ' from team seasons), ' + Object.keys(meta).length + ' meets');
  log('  ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
}

try { main(); }
catch (e) { console.error('\n  ' + e.message); process.exitCode = 1; }
