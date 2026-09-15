// node pull/crawl.js [--dry]
//
// The refresh, with nobody watching. Same crawl as pull/refresh.html and the
// same transformation (pull/seed.js), but headless, so it can be put on a
// schedule and left alone. Rewrites index.html in place.
//
//   --dry    crawl and report, write nothing
//   --resume pick up a run that was interrupted (state in pull/.crawl-state.json)
//
// Why it runs here and not in the cloud: see WHERE THIS CAN RUN below.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Seed = require('./seed.js');

const ROOT = path.join(__dirname, '..');
const IDX = path.join(ROOT, 'index.html');
const STATE = path.join(__dirname, '.crawl-state.json');
const DRY = process.argv.includes('--dry');
const RESUME = process.argv.includes('--resume');

const API = 'https://www.athletic.net/api/v1/';
const SEASON = new Date().getFullYear();

/* WHERE THIS CAN RUN
   Only from an ordinary home connection. Cloudflare serves athletic.net, and it
   answers a datacenter address with a challenge page whatever asks: a GitHub
   Actions runner gets 403 from curl and from Node's fetch alike, which was
   measured rather than assumed. From a home connection curl is served normally.
   So this cannot be moved to CI or a serverless function, and it is not worth
   hunting for a cloud host that happens not to be blocked - the block is the
   site saying what it wants.

   WHY curl AND NOT fetch
   Node's own fetch is challenged even from here and even with perfect browser
   headers, because undici's TLS fingerprint is unusual. curl is served. Nothing
   is being worked around: from this address curl is simply allowed. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/* Pacing. The rate limit is per endpoint - GetResultsData3 429s while
   GetMeetData and GetTeamCore still answer 200 - and it allows about ten
   requests per ten seconds. At 1.0s spacing it trips on the eleventh; at 2.0s
   fourteen ran clean. Unlike the browser, curl can read the 429 and its
   Retry-After, so the backoff here is informed rather than blind. */
const GAP_GET = 900, GAP_POST = 2000, TRIES = 5;

const log = (...a) => console.log(...a);
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/* ---------- transport ---------- */
function curl(url, post) {
  const args = ['-sS', '-m', '45', '-D', '-', '-H', 'User-Agent: ' + UA,
    '-H', 'Accept: application/json, text/plain, */*'];
  if (post) args.push('-X', 'POST', '-H', 'Content-Type: application/json',
    '-H', 'anettokens: ' + post.jwt, '-d', JSON.stringify(post.body));
  args.push(url);
  const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  // headers and body come back together; split on the blank line after the last
  // header block (a redirect or a 100-continue can produce more than one)
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

function ask(url, post) {
  for (let i = 0; i < TRIES; i++) {
    let r;
    try { r = curl(url, post); }
    catch (e) { log('    curl failed: ' + String(e.message).slice(0, 70)); r = { status: 0, body: '' }; }

    if (r.status === 200) {
      try { return JSON.parse(r.body); }
      catch (e) { log('    unparseable body, retrying'); }
    } else if (r.status === 404) {
      throw new Error('404');
    } else if (r.status === 429) {
      // curl can read what the browser cannot; honour it, with headroom
      const wait = Math.max(r.retryAfter + 3, 20) * 1000;
      log('    429, waiting ' + Math.round(wait / 1000) + 's');
      sleepSync(wait);
      continue;
    } else if (/Just a moment|Enable JavaScript/i.test(r.body)) {
      throw new Error('Cloudflare challenge — this machine cannot reach athletic.net '
        + '(a datacenter address, a VPN, or a changed IP reputation)');
    } else {
      log('    status ' + r.status + ', retrying');
    }
    sleepSync(GAP_GET * (i + 2));
  }
  throw new Error('gave up on ' + url.replace(API, ''));
}

/* ---------- the crawl ---------- */
function findTeams(board) {
  log('asking for every Oregon high school');
  const t = ask(API + 'DivisionHome/GetTree?sport=xc&divisionId=' + Seed.OREGON_DIV
    + '&depth=4&includeTeams=true');
  const f = Seed.teamsFromTree(t.alignedTeams, board);
  log('  ' + f.teams.length + ' board schools have a team'
    + (f.absent.length ? '; none for ' + f.absent.join(', ') : ''));
  return f;
}

// the calendar needs the team's own token in a header, so it goes through curl
// with the same shape as a results POST but as a GET
function calendarFor(team) {
  const core = ask(API + 'TeamHome/GetTeamCore?teamId=' + team.id + '&sport=xc&year=' + SEASON);
  if (!core.jwtTeamHome) return [];
  sleepSync(GAP_GET);
  const args = ['-sS', '-m', '45', '-w', '\n%{http_code}', '-H', 'User-Agent: ' + UA,
    '-H', 'Accept: application/json', '-H', 'anettokens: ' + core.jwtTeamHome,
    API + 'TeamHomeCal/GetCalendar?seasonId=' + SEASON];
  const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const i = raw.lastIndexOf('\n');
  if (+raw.slice(i + 1) !== 200) return [];
  const cal = JSON.parse(raw.slice(0, i));
  return (Array.isArray(cal) ? cal : []).filter(m => m.MeetHasResults).map(m => m.MeetID);
}

function meetRows(meetId, counters) {
  const md = ask(API + 'Meet/GetMeetData?meetId=' + meetId + '&sport=xc');
  const date = ((md.meet && (md.meet.MeetDate || md.meet.StartDate)) || '').slice(0, 10);
  const divs = (md.xcDivisions || []).filter(d => Seed.divMetres(d.DivName) === 5000);
  const out = [];
  for (const d of divs) {
    sleepSync(GAP_POST);
    counters.read++;
    let rows = (ask(API + 'Meet/GetResultsData3',
      { jwt: md.jwtMeet, body: { divId: d.IDMeetDiv, meetId } }).resultsXC) || [];
    if (!rows.length) {                       // one cheap retry, then believe it
      sleepSync(GAP_POST);
      rows = (ask(API + 'Meet/GetResultsData3',
        { jwt: md.jwtMeet, body: { divId: d.IDMeetDiv, meetId } }).resultsXC) || [];
    }
    if (!rows.length) counters.empty++;
    for (const r of rows) {
      const row = Seed.resultRow(r, date);
      if (row) out.push(row);
    }
  }
  return { rows: out, name: (md.meet || {}).Name || ('meet ' + meetId), date };
}

/* ---------- run ---------- */
function main() {
  const t0 = Date.now();
  const html = fs.readFileSync(IDX, 'utf8');
  const { board } = Seed.parseClasses(html);

  /* Resuming is only ever right for a crawl that stopped minutes ago. A state
     file left behind by last week's failed run holds results from before the
     weekend's meets, and folding those into a fresh crawl produces a database
     that is part stale and a DATA_DATE that belongs to neither. The scheduled
     job never passes --resume for the same reason: a week-old partial is not
     worth having, and starting over costs a quarter of an hour. */
  const STALE_HOURS = 12;
  let S = null;
  if (RESUME && fs.existsSync(STATE)) {
    const age = (Date.now() - fs.statSync(STATE).mtimeMs) / 3600e3;
    if (age > STALE_HOURS) {
      log('ignoring a part-finished run from ' + age.toFixed(0) + ' hours ago; starting fresh');
      fs.unlinkSync(STATE);
    } else {
      S = JSON.parse(fs.readFileSync(STATE, 'utf8'));
      log('resuming: ' + S.mi + ' of ' + S.meets.length + ' meets, ' + S.rows.length + ' results');
    }
  }
  if (!S) {
    const f = findTeams(board);
    const live = f.teams.filter(t => t.results > 0);
    log('walking ' + live.length + ' calendars (' + (f.teams.length - live.length)
      + ' schools have no results yet)');
    const meets = new Set();
    let n = 0;
    for (const t of live) {
      try { for (const id of calendarFor(t)) meets.add(id); }
      catch (e) { log('  ' + t.name + ': ' + e.message.slice(0, 60)); }
      if (++n % 25 === 0) log('  ' + n + '/' + live.length);
      sleepSync(GAP_GET);
    }
    S = { logos: f.logos, meets: [...meets], mi: 0, rows: [], failed: [],
          read: 0, empty: 0 };
    log(S.meets.length + ' meets with results');
  }

  const counters = { read: S.read, empty: S.empty };
  while (S.mi < S.meets.length) {
    const id = S.meets[S.mi];
    try {
      const r = meetRows(id, counters);
      S.rows.push(...r.rows);
      log('  ' + (S.mi + 1) + '/' + S.meets.length + '  ' + r.date + '  '
        + r.name.slice(0, 42) + '  ' + r.rows.length);
    } catch (e) {
      log('  meet ' + id + ': ' + e.message.slice(0, 70));
      if (!S.failed.includes(id)) S.failed.push(id);
      if (/cannot reach athletic\.net/.test(e.message)) throw e;   // no point going on
    }
    // the index advances before the save: recording "done" on a half-read meet
    // re-pulls it on resume and doubles every mark in it
    S.mi++; S.read = counters.read; S.empty = counters.empty;
    fs.writeFileSync(STATE, JSON.stringify(S));
    sleepSync(GAP_GET);
  }

  if (S.failed.length) {
    log('retrying ' + S.failed.length + ' meets that would not answer');
    sleepSync(60000);
    for (const id of S.failed.slice()) {
      try {
        const r = meetRows(id, counters);
        S.rows.push(...r.rows);
        S.failed = S.failed.filter(x => x !== id);
        log('  recovered ' + r.name.slice(0, 40) + '  ' + r.rows.length);
      } catch (e) { log('  meet ' + id + ' still will not answer'); }
      fs.writeFileSync(STATE, JSON.stringify(S));
      sleepSync(GAP_GET);
    }
  }

  /* ---------- build and report ---------- */
  const b = Seed.buildSeed(S.rows, board);
  const date = b.latest || new Date().toISOString().slice(0, 10);
  const wasRows = (fs.readFileSync(IDX, 'utf8').match(/<script id="seed"[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1]
    .trim().split(/\r?\n/).length - 1;

  log('');
  log('  results read      ' + S.rows.length);
  log('  seed rows         ' + b.rows + '  (' + (b.rows >= wasRows ? '+' : '')
    + (b.rows - wasRows) + ')');
  log('  athletes          ' + b.athletes);
  log('  schools           ' + b.schools);
  log('  results through   ' + date);
  log('  dropped           ' + JSON.stringify(b.dropped));
  log('  empty races       ' + counters.empty + ' of ' + counters.read);
  log('  meets unanswered  ' + S.failed.length);

  // the same guards the page shows, as exit codes so a scheduler can act on them
  let bad = '';
  if (S.failed.length) bad = S.failed.length + ' meets never answered';
  else if (counters.read > 20 && counters.empty > counters.read * 0.4)
    bad = counters.empty + ' of ' + counters.read + ' races came back empty, which is '
      + 'the shape of being rate limited';
  else if (b.rows < wasRows * 0.9) bad = 'the seed shrank by more than a tenth';

  if (bad) { log('\n  NOT WRITING: ' + bad); process.exitCode = 2; return; }
  if (DRY) { log('\n  --dry, nothing written'); return; }
  if (b.rows === wasRows && date === (html.match(/const DATA_DATE="([\d-]+)"/) || [, ''])[1]) {
    log('\n  nothing changed'); process.exitCode = 3; return;
  }

  /* Re-read rather than patching the copy taken twenty minutes ago. The crawl
     holds index.html open for the length of a run, and anything edited in that
     window - by hand, or by a publish - would be silently reverted by writing
     the stale snapshot back. Only the seed and the crest map are ours to
     change; everything else in the file belongs to whoever touched it last. */
  const fresh = fs.readFileSync(IDX, 'utf8');
  let out = Seed.patchIndex(fresh, b.csv, date);
  out = Seed.patchLogos(out, S.logos);
  fs.writeFileSync(IDX, out);

  /* The commit message is written here rather than assembled in the .cmd.
     Batch quoting around a nested node -e is its own small horror, and the
     figures are already sitting in this scope. */
  fs.writeFileSync(path.join(__dirname, '.commit-msg'),
    'Refresh the database: ' + b.rows + ' marks through ' + date + '\n'
    + '\n'
    + b.athletes + ' athlete-boards across ' + b.schools + ' schools, from '
    + S.meets.length + ' meets and ' + S.rows.length + ' results read.\n'
    + '\n'
    + 'Written by the weekly scheduled crawl (pull/crawl.js).\n');

  fs.existsSync(STATE) && fs.unlinkSync(STATE);
  log('\n  index.html written, ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
}

try { main(); }
catch (e) { console.error('\n  ' + e.message); process.exitCode = 1; }
