// node pull/test_cards.js - the share cards, no network.
//
// The page builds a share link from teamSlug in index.html and pull/cards.js
// writes the file under slugOf. Two copies of one rule, so the test holds them
// together: every school on every board, both spellings, one answer, and a
// card on disk for each.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const { slugOf, drawCard, page, rankOf } = require('./cards.js');
const CLASSES = require('./seed.js').parseClasses(html).CLASSES;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

// lift the page's own function by text rather than restating it
const m = html.match(/const teamSlug=([\s\S]*?\);)\n/);
ok(!!m, 'index.html has teamSlug');
const teamSlug = m ? eval('(' + m[1].replace(/;$/, '') + ')') : () => null;

const all = [];
for (const cls of Object.keys(CLASSES)) for (const g of ['M', 'F']) {
  const cfg = CLASSES[cls][g]; if (!cfg) continue;
  for (const teams of Object.values(cfg.lg)) for (const name of teams) all.push({ cls, g, name });
}
ok(all.length > 400, 'school-boards found: ' + all.length);
const seen = new Set();
let same = 0, files = 0, pngs = 0, hashes = 0;
for (const t of all) {
  const a = slugOf(t.cls, t.g, t.name), b = teamSlug(t.cls, t.g, t.name);
  if (a === b) same++; else console.log('  differs: ' + t.name + ' ' + a + ' / ' + b);
  ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a), 'slug is clean: ' + a);
  ok(!seen.has(a), 'slug is unique: ' + a); seen.add(a);
  const f = path.join(ROOT, 't', a + '.html'), p = path.join(ROOT, 't', 'img', a + '.png');
  if (fs.existsSync(f)) {
    files++;
    const s = fs.readFileSync(f, 'utf8');
    const h = (s.match(/location\.replace\("([^"]+)"\)/) || [])[1] || '';
    // the hash the stub sends people to must read back as this school on this board
    const seg = h.replace(/^\/#/, '').split('/').map(decodeURIComponent);
    if (seg[0] === t.cls && seg[1] === (t.g === 'M' ? 'boys' : 'girls') && seg[2] === t.name && seg[3] === 'team'
        && s.includes('/t/img/' + a + '.png')) hashes++;
    else console.log('  stub wrong: ' + a + ' -> ' + h);
  }
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    if (buf.slice(1, 4).toString() === 'PNG' && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630) pngs++;
    else console.log('  bad png: ' + a);
  }
}
ok(same === all.length, 'page and builder agree on every slug (' + same + '/' + all.length + ')');
ok(files === all.length, 'a page for every school (' + files + '/' + all.length + ')');
ok(pngs === all.length, 'a 1200x630 card for every school (' + pngs + '/' + all.length + ')');
ok(hashes === all.length, 'every page sends people to its own school (' + hashes + '/' + all.length + ')');

// accents and punctuation fold the same way in both
for (const n of ['Jefferson-Portland', "St. Mary's Academy", 'Oregon School for the Deaf', 'Café High'])
  ok(slugOf('2A/1A', 'F', n) === teamSlug('2A/1A', 'F', n), 'same slug for ' + n);
ok(slugOf('2A/1A', 'M', 'Union') === '2a-1a-boys-union', '2A/1A folds to 2a-1a');

// a card renders from nothing but the font, and the page escapes what it is given
const png = drawCard({ name: 'Test & <School>', cls: '6A', g: 'F', league: 'Metro League', odds: [998, 990, 455, 61], through: '2026-09-26' });
ok(png.slice(1, 4).toString() === 'PNG', 'drawCard writes a PNG');
const pg = page({ name: 'A "B" <C>', cls: '6A', g: 'M', slug: 'x', odds: null, through: '2026-09-26' });
ok(!/<C>/.test(pg) && pg.includes('&lt;C&gt;'), 'page escapes the name');
ok(pg.includes('noindex'), 'pages stay out of search');

// the rank: by chance of winning, ties on reaching Lane, out of every team, and only with a real chance
const bd = { A: [1000, 1000, 500, 40], B: [1000, 900, 300, 60], C: [990, 800, 300, 70], D: [500, 0, 5, 200], E: [0, 0, 0, 0] };
ok(JSON.stringify(rankOf(bd, 'A')) === '{"r":1,"of":5}', 'rank 1 of 5');
ok(rankOf(bd, 'C').r === 3 && rankOf(bd, 'B').r === 2, 'a tie on winning breaks on reaching Lane');
ok(rankOf(bd, 'D') === null && rankOf(bd, 'E') === null && rankOf(bd, 'Z') === null, 'no rank under 1% to win');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
