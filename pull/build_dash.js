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
// id six, repeated across fourteen thousand result rows; as indices into their
// own tables the results block drops by about a third. Nothing downstream ever
// needs the athletic.net id, and the athlete table keeps it if anything ever
// does.
//
// Event names are indexed the same way. There are about twenty of them across
// five thousand track rows, so spelling "1500 Meters" out every time is most
// of what a track row would otherwise cost.
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

const allAthletes = readCsv(stem + 'athletes.csv');
const allSeasons = readCsv(stem + 'seasons.csv');
const allResults = readCsv(stem + 'results.csv');
const meta = JSON.parse(fs.readFileSync(stem + 'meets.json', 'utf8'));

/* ---------- the page is about distance running ----------
   roster.js archives the whole programme, sprinters and all, because a roster
   that quietly drops people is the thing this project keeps arguing against.
   The dashboard is narrower on purpose: a distance athlete is anybody with a
   mark at 800m or longer, and everybody else is left in the CSVs.

   The reason is that nothing on the page reads a sprinter usefully. VDOT does
   not take a 100m, so a development curve over that group is noise wearing a
   number, and a retention figure that mixes two programmes describes neither.
   Their own marks stay in - a distance runner's 400m is worth seeing - it is
   the sprint-ONLY athletes who are out.

   It is 749 athletes of 1,566, and about a fifth of the bytes. The bytes are
   not the reason. */
const DIST_FLOOR = 800;
const distIds = new Set(allResults.filter((r) => +r.dist >= DIST_FLOOR).map((r) => r.athleteId));
const athletes = allAthletes.filter((a) => distIds.has(a.athleteId));
const seasons = allSeasons.filter((s) => distIds.has(s.athleteId));
const results = allResults.filter((r) => distIds.has(r.athleteId));

const ai = new Map(athletes.map((a, i) => [a.athleteId, i]));

// meets, ordered by date so the index is also a rough chronology
const meetIds = [...new Set(results.map((r) => r.meetId))].filter(Boolean);
const meetInfo = new Map();
for (const r of results) {
  if (r.meetId && !meetInfo.has(r.meetId)) {
    meetInfo.set(r.meetId, (meta.meets[r.meetId] || { date: r.date, name: '' }));
  }
}
meetIds.sort((x, y) => ((meetInfo.get(x) || {}).date || '')
  .localeCompare((meetInfo.get(y) || {}).date || ''));
const mi = new Map(meetIds.map((m, i) => [m, i]));

const events = [...new Set(results.map((r) => r.event).filter(Boolean))].sort();
const ei = new Map(events.map((e, i) => [e, i]));

const ENTRY = ['observed', 'late-entry', 'unknown-gap', 'ungraded'];
const SPORT = ['xc', 'tfo'];

const block = (rows) => '\n' + rows.join('\n') + '\n';

const aBlock = block(athletes.map((a) => [
  a.athleteId, a.first, a.last, a.alsoKnownAs, a.gender, a.classOf || '',
  a.classOfConflict, a.entryGrade || '', Math.max(0, ENTRY.indexOf(a.entry)),
].join(',')));

const sBlock = block(seasons
  .filter((s) => ai.has(s.athleteId))
  .map((s) => [ai.get(s.athleteId), s.schoolYear, Math.max(0, SPORT.indexOf(s.sport)),
    s.grade || '', s.nRaces, s.best800 || '', s.best1500 || '', s.best3000 || '',
    s.best5000 || ''].join(',')));

const rBlock = block(results
  .filter((r) => ai.has(r.athleteId) && mi.has(r.meetId))
  .map((r) => [ai.get(r.athleteId), mi.get(r.meetId), Math.max(0, SPORT.indexOf(r.sport)),
    r.event ? ei.get(r.event) : '', r.dist, Math.round(+r.seconds * 100) / 100,
    r.place || ''].join(',')));

const mBlock = block(meetIds.map((m) => {
  const o = meetInfo.get(m) || {};
  return [o.date || '', (o.name || '').replace(/[",<>&]/g, ' ').trim()].join(',');
}));

const eBlock = block(events);

const info = {
  teamId, label: meta.label, from: meta.from, to: meta.to,
  horizon: meta.horizon, pulled: meta.pulled,
  sports: { xc: results.filter((r) => r.sport === 'xc').length,
    tfo: results.filter((r) => r.sport === 'tfo').length },
  fieldMarksSkipped: meta.fieldMarksSkipped || 0,
  distFloor: DIST_FLOOR,
  archived: { athletes: allAthletes.length, results: allResults.length },
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
put('d-events', eBlock);

const ire = /const INFO=\{[\s\S]*?\};/;
if (!ire.test(html)) throw new Error('no INFO constant in roster.html');
html = html.replace(ire, 'const INFO=' + JSON.stringify(info) + ';');

fs.writeFileSync(PAGE, html);
const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log('  ' + (allAthletes.length - athletes.length) + ' sprint-only athletes left in '
  + 'the CSVs and out of the page');
console.log('roster.html: ' + athletes.length + ' athletes, ' + seasons.length
  + ' athlete-seasons, ' + (rBlock.split('\n').length - 2) + ' results, '
  + meetIds.length + ' meets, ' + events.length + ' track events');
console.log('  ' + kb(Buffer.byteLength(html)) + ' on disk');
