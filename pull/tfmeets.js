// node pull/tfmeets.js [teamId]
//
// Track placings at championship meets, which pull/roster.js cannot see.
//
// roster.js takes track from TeamHome/GetTeamAthleteRecords, which serves each
// athlete's SEASON BEST per event. That is the right shape for a ruler - a
// best on a flat oval is the cleanest fitness number a season produces - but a
// season best has no finishing place attached, so the whole of an athlete's
// track honours were invisible. Mark French has four years of district and
// State track results and the page showed none of them.
//
// TWO CALLS A MEET, AND ONE OF THEM IS THE WHOLE MEET
//
//   Meet/GetMeetData?meetId=N&sport=tf     -> the meet, and a jwtMeet token
//   Meet/GetAllResultsData?rawResults=false&showTips=false   (with that token)
//
// The second returns every event of the meet in one response - 487KB for a
// district championship - under flatEvents[].results[]. That is a far better
// bargain than cross country's per-division POST, and it is not on the
// rate-limited endpoint, so this is about 140 requests for twenty-two years.
//
// NOTE the sport parameter is "tf" here. It is "tfo" for GetTeamCore and
// GetTree, and GetMeetData rejects "tfo" outright with a 400. Three spellings
// of the same sport in one API; there is no rule to infer, only the record of
// which endpoint wants which.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const API = 'https://www.athletic.net/api/v1/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const GAP = 1400, TRIES = 3;

// what counts as a championship. Everything else is a dual or an invitational
// and carries no honour worth recording.
const CHAMP = /district|state champ|league champ|conference champ|6A-|5A-|OSAA/i;

const teamId = +(process.argv[2] || 284);
const DIR = path.join(__dirname, 'roster');
const stem = path.join(DIR, 't' + teamId + '_');

const log = (...a) => console.log(...a);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function curl(url, token) {
  const a = ['-sS', '-m', '90', '-w', '\n%{http_code}', '-H', 'User-Agent: ' + UA,
    '-H', 'Accept: application/json, text/plain, */*'];
  if (token) a.push('-H', 'anettokens: ' + token);
  a.push(url);
  const out = execFileSync('curl', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const i = out.lastIndexOf('\n');
  return { code: out.slice(i + 1).trim(), body: out.slice(0, i) };
}

function ask(url, token) {
  for (let i = 0; i < TRIES; i++) {
    try {
      const r = curl(url, token);
      if (r.code === '200') return JSON.parse(r.body);
      log('      status ' + r.code + ', retrying');
    } catch (e) {
      log('      ' + String(e.message).slice(0, 60) + ', retrying');
    }
    sleep(GAP * (i + 2));
  }
  return null;
}

const readCsv = (f) => {
  const L = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
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

/* Result rows out of flatEvents.

   Three things the first pass got wrong and the shape of the data explains:

   THE EVENT NAME is ev.Event ("3000 Meters"), not ev.Name, which does not
   exist. Every row came out with a blank event.

   ONLY FINALS COUNT. ev.Round is "F" or "P", and a place in a preliminary
   heat is not a placing - somebody sixth in a prelim and first in the final
   would otherwise appear as both.

   A RELAY IS FOUR ATHLETES. Its row carries them all in one display string
   joined by literal "<BR>" and an AthleteID for only one of them, so the
   record read "Ryan Cavinta<BR>Davis Payton<BR>Joshua Chandler<BR>Mark
   French" as a single competitor. relayLegs maps a ResultID to each leg's own
   athlete id and name, so the row is expanded into one per leg and every
   runner gets credit for the place. */
function rowsOf(all, want) {
  const legs = new Map();
  for (const l of all.relayLegs || []) {
    if (!legs.has(l.ResultID)) legs.set(l.ResultID, []);
    legs.get(l.ResultID).push(l);
  }
  const mine = (id, team) => want.ids.has(String(id))
    || String(team || '').trim().toLowerCase() === want.school.toLowerCase();

  const out = [];
  for (const ev of all.flatEvents || []) {
    if (String(ev.Round || 'F').toUpperCase() !== 'F') continue;
    const evName = ev.Event || ev.EventShort || '';
    for (const r of ev.results || []) {
      if (r.Exhibition) continue;
      const place = parseInt(String(r.disPlace || r.Place || '').replace(/\D/g, ''), 10);
      if (!(place > 0)) continue;        // a scratch or a no-mark is not a placing
      const team = String(r.disTeam || '').trim();
      const base = {
        team, eventId: ev.EventId, event: evName, isField: ev.isField ? 1 : 0,
        gender: ev.Gender || '', place,
        mark: String(r.Result || '').trim(),
      };
      const rl = legs.get(r.IDResult);
      if (ev.isPersonal === false && rl && rl.length) {
        for (const l of rl) {
          if (!mine(l.AthleteID, team)) continue;
          out.push({ ...base, athleteId: +l.AthleteID || 0,
            athlete: String(l.Name || '').trim(),
            grade: String(l.ShortDesc || '').replace(/\D/g, ''), relay: 1 });
        }
        continue;
      }
      const id = +r.AthleteID || +r.IDAthlete || 0;
      if (!mine(id, team)) continue;
      out.push({ ...base, athleteId: id,
        athlete: String(r.disAthlete || '').replace(/<BR>/gi, ' / ').trim(),
        grade: String(r.disGrade || '').replace(/\D/g, ''), relay: 0 });
    }
  }
  return out;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(stem + 'meets.json', 'utf8'));
  const results = readCsv(stem + 'results.csv');
  const athletes = readCsv(stem + 'athletes.csv');
  const want = {
    school: meta.label || 'Tualatin',
    ids: new Set(athletes.map((a) => a.athleteId)),
  };

  const meets = new Map();
  for (const r of results) {
    if (r.sport !== 'tfo' || !r.meetId) continue;
    const m = meta.meets[r.meetId];
    if (!m || !CHAMP.test(m.name || '')) continue;
    meets.set(r.meetId, m);
  }
  const list = [...meets.entries()].sort((a, b) => (a[1].date || '').localeCompare(b[1].date || ''));
  log('track championship meets to read: ' + list.length);

  const rows = [], failed = [];
  let n = 0;
  for (const [mid, m] of list) {
    n++;
    const md = ask(API + 'Meet/GetMeetData?meetId=' + mid + '&sport=tf');
    sleep(GAP);
    if (!md || !md.jwtMeet) { failed.push(mid); log('  ' + mid + ' no meet data'); continue; }
    const all = ask(API + 'Meet/GetAllResultsData?rawResults=false&showTips=false', md.jwtMeet);
    sleep(GAP);
    if (!all) { failed.push(mid); log('  ' + mid + ' no results'); continue; }
    const got = rowsOf(all, want).map((r) => ({ ...r, meetId: mid, date: m.date || '', meet: m.name || '' }));
    rows.push(...got);
    log('  ' + String(n).padStart(2) + '/' + list.length + '  ' + (m.date || '') + '  '
      + String(got.length).padStart(3) + ' placings  ' + (m.name || '').slice(0, 44));
  }

  /* Refuse rather than write a thin file, the same posture as the rest of
     pull/. A run that suddenly finds a fraction of what it found last time has
     broken; the sport has not changed. */
  const prev = fs.existsSync(stem + 'tf_places.csv')
    ? fs.readFileSync(stem + 'tf_places.csv', 'utf8').split('\n').length - 2 : 0;
  if (!rows.length) { log('\nREFUSING: no placings at all'); process.exit(2); }
  if (prev && rows.length < prev * 0.9) {
    log('\nREFUSING: placings fell from ' + prev + ' to ' + rows.length);
    process.exit(2);
  }
  if (failed.length > list.length * 0.25) {
    log('\nREFUSING: ' + failed.length + ' of ' + list.length + ' meets never answered');
    process.exit(2);
  }

  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['athleteId', 'athlete', 'grade', 'meetId', 'date', 'meet', 'eventId', 'event',
    'isField', 'relay', 'place', 'mark'];
  fs.writeFileSync(stem + 'tf_places.csv',
    [head.join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n') + '\n');

  const ath = new Set(rows.map((r) => r.athleteId).filter(Boolean));
  log('\n  ' + rows.length + ' track placings over ' + ath.size + ' athletes, '
    + list.length + ' meets read' + (failed.length ? ', ' + failed.length + ' failed' : ''));
  log('  wrote ' + stem + 'tf_places.csv');
}

module.exports = { CHAMP, rowsOf };
if (require.main === module) main();
