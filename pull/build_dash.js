// node pull/build_dash.js [teamId]
//
// Fills roster.html's data blocks from pull/roster/t<id>_*.csv.
//
// Same shape as Seed.patchIndex: the page is the artifact and is editable by
// hand, the data is a block inside it that a script rewrites. One file, no
// build step, no fetch - which also means roster.html inherits the app's
// connect-src none rather than needing its own CSP entry.
//
// Ids are re-indexed on the way in. An athlete id is eight digits and a meet
// id six, repeated across 8,835 result rows; as indices into their own tables
// the results block drops by about a third. Nothing downstream ever needs the
// athletic.net id, and the athlete table keeps it if anything ever does.
const fs = require('fs');
const path = require('path');

const teamId = +(process.argv[2] || 284);
const DIR = path.join(__dirname, 'roster');
const PAGE = path.join(__dirname, '..', 'roster.html');
const stem = path.join(DIR, 't' + teamId + '_');

const readCsv = (f) => {
  const L = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const h = L[0].split(',');
  return L.slice(1).map((l) => {
    // the writer quotes anything with a comma; nothing here needs a full parser
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

const athletes = readCsv(stem + 'athletes.csv');
const seasons = readCsv(stem + 'seasons.csv');
const results = readCsv(stem + 'results.csv');
const meta = JSON.parse(fs.readFileSync(stem + 'meets.json', 'utf8'));

const ai = new Map(athletes.map((a, i) => [a.athleteId, i]));

// meets, ordered by date so the index is also a rough chronology
const meetIds = [...new Set(results.map((r) => r.meetId))]
  .filter((m) => meta.meets[m])
  .sort((x, y) => (meta.meets[x].date || '').localeCompare(meta.meets[y].date || ''));
const mi = new Map(meetIds.map((m, i) => [m, i]));

const ENTRY = ['observed', 'late-entry', 'unknown-gap', 'ungraded'];

const block = (rows) => '\n' + rows.join('\n') + '\n';

const aBlock = block(athletes.map((a) => [
  a.athleteId, a.first, a.last, a.alsoKnownAs, a.gender, a.classOf || '',
  a.classOfConflict, a.entryGrade || '', Math.max(0, ENTRY.indexOf(a.entry)),
].join(',')));

const sBlock = block(seasons
  .filter((s) => ai.has(s.athleteId))
  .map((s) => [ai.get(s.athleteId), s.schoolYear, s.grade || '', s.nRaces,
    s.best5k || ''].join(',')));

const rBlock = block(results
  .filter((r) => ai.has(r.athleteId) && mi.has(r.meetId))
  .map((r) => [ai.get(r.athleteId), mi.get(r.meetId), r.dist,
    Math.round(+r.seconds * 10) / 10, r.place || ''].join(',')));

const mBlock = block(meetIds.map((m) => [
  meta.meets[m].date || '', (meta.meets[m].name || '').replace(/[",<>&]/g, ' ').trim(),
].join(',')));

const info = {
  teamId, label: meta.label, from: meta.from, to: meta.to,
  horizon: meta.horizon, pulled: meta.pulled,
};

let html = fs.readFileSync(PAGE, 'utf8');
const put = (id, body) => {
  const re = new RegExp('(<script id="' + id + '"[^>]*>)[\\s\\S]*?(</script>)');
  if (!re.test(html)) throw new Error('no block for ' + id + ' in roster.html');
  html = html.replace(re, (_, a, b) => a + body + b);
};
put('d-athletes', aBlock);
put('d-seasons', sBlock);
put('d-results', rBlock);
put('d-meets', mBlock);

const ire = /const INFO=\{[\s\S]*?\};/;
if (!ire.test(html)) throw new Error('no INFO constant in roster.html');
html = html.replace(ire, 'const INFO=' + JSON.stringify(info) + ';');

fs.writeFileSync(PAGE, html);
const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log('roster.html: ' + athletes.length + ' athletes, ' + seasons.length
  + ' athlete-seasons, ' + (rBlock.split('\n').length - 2) + ' results, '
  + meetIds.length + ' meets');
console.log('  ' + kb(Buffer.byteLength(html)) + ' on disk');
