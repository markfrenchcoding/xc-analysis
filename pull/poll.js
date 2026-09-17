// node pull/poll.js            rebuild the coaches poll from osaa.org
// node pull/poll.js --dry      parse and report, write nothing
//
// The OSAAtoday coaches poll is the only statewide human ranking of these teams,
// and it is a genuinely different opinion from the board's: coaches weigh
// head-to-head, course, injuries and who is peaking, none of which the model can
// see. Putting the two side by side is the point - where they disagree is the
// interesting part of the page.
//
// It is published as an article, one per gender, covering all five
// classifications, and it is REWRITTEN WEEKLY on Thursdays during the season.
// The article ids change each week, so the two URLs below are the current ones
// and will go stale; pass new ones as arguments when they do.
//
//   node pull/poll.js 5100 5101      (boys id, girls id)
//
// Like the rest of pull/, this cannot run from a datacenter: osaa.org answers
// a cloud address with 403. It is curl from a home connection or nothing.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const IDX = path.join(__dirname, '..', 'index.html');
const DRY = process.argv.includes('--dry');
const ids = process.argv.slice(2).filter(a => /^\d+$/.test(a));
const BOYS = ids[0] || '5062';
const GIRLS = ids[1] || '5061';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function get(id) {
  const url = 'https://www.osaa.org/today/article/' + id + '/view';
  const r = cp.spawnSync('curl', ['-s', '--max-time', '40', '-A', UA, url],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('curl failed for ' + url);
  return r.stdout;
}

/* The article is a run of <p> tags: a classification on its own line, then
   "1." then the school then the vote count. Stripping tags and walking the
   lines is more robust than any selector, because the markup around the poll
   changes and the shape of the poll itself does not. */
function toLines(html) {
  const i = html.indexOf('First-place votes in parentheses');
  const j = html.indexOf('Staff Writer', i);
  if (i < 0) throw new Error('could not find the start of the poll');
  return html.slice(i, j > i ? j : undefined)
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|’/g, "'")
    .split('\n').map(s => s.trim()).filter(Boolean);
}

/* When the poll was PUBLISHED, not when we pulled it. Those are different
   facts and only the first one is any use to a reader: on the day this was
   written the site was showing results through September 17 next to a poll
   voted in preseason, three weeks earlier, and said nothing about the gap.
   The byline line reads "August 26, 2026    by John Tawa, OSAAtoday". */
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
function published(html) {
  const txt = html.replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  const m = txt.match(new RegExp('(' + MONTHS.join('|') + ')\\s+(\\d{1,2}),\\s*(\\d{4})'));
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0');
  return m[3] + '-' + mm + '-' + String(m[2]).padStart(2, '0');
}
/* "Preseason" is part of the headline when it is one, and it matters: a
   preseason poll is a guess about a season nobody has raced yet. */
function label(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m && /preseason/i.test(m[1]) ? 'preseason' : '';
}

const CLASS_LINE = /^(6A|5A|4A|3A|2A\/1A)$/;
const RANK_LINE = /^(\d{1,2})\.$/;

/* Poll spelling on the left, the board's spelling on the right. Most of these
   are co-ops - two or three schools running as one team - which OSAA writes out
   in full and the board carries under the host school. A few are just longer
   forms of the same name. Anything not listed and not already matching is
   reported as unmatched rather than guessed at. */
const ALIAS = {
  'Milwaukie / Milwaukie Acad. of the Arts': 'Milwaukie',
  'The Dalles / Dufur': 'The Dalles',
  'Marist Catholic': 'Marist',
  'Oregon Episcopal School': 'Oregon Episcopal',
  'Enterprise / Joseph / Wallowa': 'Enterprise',
  'Harrisburg / Monroe': 'Harrisburg',
  'St. Stephens Acad.': "St. Stephen's Academy",
  'Trinity Acad.': 'Trinity Academy',
  'Heppner / Ione': 'Heppner',
  'Heppner / Ionie': 'Heppner',
  "St. Mary's, Medford": "St Mary's",
  'St Marys, Medford': "St Mary's",
};

function parse(html) {
  const lines = toLines(html);
  const out = {};
  let cls = null;
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k];
    if (CLASS_LINE.test(L)) { cls = L; out[cls] = out[cls] || {}; continue; }
    if (!cls) continue;

    /* "Others receiving significant votes" is a real part of the poll and the
       teams in it are ranked ahead of every unranked team, so they are kept as
       rank 0 and shown as RV rather than thrown away. */
    if (/^Others receiving significant votes/i.test(L)) {
      for (let m = k + 1; m < lines.length && !CLASS_LINE.test(lines[m]); m++) {
        const s = lines[m].replace(/[;,]\s*$/, '').trim();
        if (!s || RANK_LINE.test(s) || /^\d+$/.test(s)) continue;
        if (/^Others receiving/i.test(s)) continue;
        /* Every real entry is a school followed by its vote count on the next
           line. Requiring that count is what keeps the author's byline, which
           sits just past the last classification, out of the poll. */
        if (!/^\d+[;,]?$/.test((lines[m + 1] || '').trim())) continue;
        const nm = s.replace(/\s*\(\d+\)\s*\d*$/, '').replace(/\s+\d+$/, '').trim();
        if (nm && !(nm in out[cls])) out[cls][nm] = 0;
      }
      continue;
    }
    const r = L.match(RANK_LINE);
    if (r && lines[k + 1] && !RANK_LINE.test(lines[k + 1])) {
      const name = lines[k + 1].replace(/\s*\(\d+\)\s*\d*$/, '').replace(/\s+\d+$/, '').trim();
      if (name && !CLASS_LINE.test(name)) out[cls][name] = +r[1];
    }
  }
  return out;
}

/* ---------- match against the board ---------- */
const html = fs.readFileSync(IDX, 'utf8');
const { CLASSES } = require('./seed.js').parseClasses(html);
const boardTeams = {};
for (const cls of Object.keys(CLASSES)) {
  const set = new Set();
  for (const g of ['M', 'F']) {
    const L = CLASSES[cls][g] && CLASSES[cls][g].lg;
    if (L) for (const lg of Object.keys(L)) for (const t of L[lg]) set.add(t);
  }
  boardTeams[cls] = set;
}

const POLL = {};
const missed = [];
let matched = 0, rv = 0;
const meta = { date: null, label: '' };
for (const [g, id] of [['M', BOYS], ['F', GIRLS]]) {
  const html = get(id);
  const d = published(html);
  /* Take the older of the two if they ever differ: the pair is published
     together, and claiming the newer would overstate the poll's freshness. */
  if (d && (!meta.date || d < meta.date)) meta.date = d;
  if (!meta.label) meta.label = label(html);
  const raw = parse(html);
  for (const cls of Object.keys(raw)) {
    const key = cls + '|' + g;
    POLL[key] = {};
    for (const [name, rank] of Object.entries(raw[cls])) {
      const board = ALIAS[name] || name;
      if (boardTeams[cls] && boardTeams[cls].has(board)) {
        POLL[key][board] = rank;
        matched++; if (!rank) rv++;
      } else {
        missed.push((g === 'M' ? 'boys' : 'girls') + ' ' + cls + ': ' + name
          + (ALIAS[name] ? ' -> ' + board : '') + ' (no such team on the board)');
      }
    }
  }
}

console.log('matched ' + matched + ' ranked teams (' + rv + ' receiving votes) across '
  + Object.keys(POLL).length + ' boards');
for (const k of Object.keys(POLL).sort()) {
  const e = Object.entries(POLL[k]).sort((a, b) => (a[1] || 99) - (b[1] || 99));
  console.log('  ' + k.padEnd(9) + e.map(([n, r]) => (r || 'RV') + ' ' + n).join(', '));
}
if (missed.length) {
  console.log('\nnot on the board (' + missed.length + ') - co-ops and out-of-state schools '
    + 'mostly, but check before ignoring:');
  for (const m of missed) console.log('  ' + m);
}
if (DRY) { console.log('\n--dry: nothing written'); process.exit(0); }

const NL = html.includes('\r\n') ? '\r\n' : '\n';
const line = NL + 'const POLL=' + JSON.stringify(POLL) + ';'
  + NL + 'const POLL_DATE="' + (meta.date || '') + '";'
  + NL + 'const POLL_KIND="' + meta.label + '";' + NL;
const RE = /\r?\nconst POLL=\{[\s\S]*?\};\r?\nconst POLL_DATE="[\d-]*";(\r?\nconst POLL_KIND="[^"]*";)?\r?\n/;
let out;
if (RE.test(html)) out = html.replace(RE, line);
else {
  const anchor = 'const DATA_DATE=';
  const i = html.indexOf(anchor);
  if (i < 0) { console.error('cannot find an anchor for POLL'); process.exit(1); }
  out = html.slice(0, i) + line.slice(NL.length) + html.slice(i);
}
fs.writeFileSync(IDX, out);
console.log('\npoll published ' + (meta.date || 'date not found')
  + (meta.label ? ' (' + meta.label + ')' : ''));
console.log('wrote POLL into index.html ('
  + (JSON.stringify(POLL).length / 1024).toFixed(1) + 'KB)');
