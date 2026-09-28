#!/usr/bin/env node
/* One school's mascot, baked into its own page.
   ------------------------------------------------------------------------
   The app already carries all 230 Oregon crests: `LOGO` in index.html maps a
   display name to athletic.net's MascotUrl, rebuilt free on every crawl from
   the same GetTree call that finds the team ids. A school page needs exactly
   one of them, and the awkward part is not finding it.

   IT IS EMBEDDED, NOT LINKED. The dashboard's CSP is `img-src 'self' data:`
   with no googleusercontent in it - deliberately, because until now there
   were no crests here - and the page is one self-contained file that fetches
   nothing. Linking the image would mean widening the policy AND making the
   page depend on somebody else's CDN being up. A data URI keeps both
   promises: no request, no policy change, no second file.

   s96 rather than s128 or the unsized original. A 32px crest on a 3x phone
   wants 96 real pixels, and the base64 of a 96px PNG is about 15KB against
   23KB for the 128 - which is real money on a page that gzips to 130.

   It writes a committed artifact, so `build_dash.js` stays offline like the
   rest of the build. Re-run it only when a school changes its mascot.

     node pull/crest.js 284 Tualatin
     node pull/crest.js 159 Sherwood
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const teamId = process.argv[2];
const school = process.argv[3];
if (!teamId || !school) {
  console.error('usage: node pull/crest.js <teamId> <School name as the board spells it>');
  process.exit(1);
}

const APP = path.join(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, 'roster', 't' + teamId + '_crest.txt');

const m = fs.readFileSync(APP, 'utf8').match(/const LOGO=(\{[\s\S]*?\});/);
if (!m) { console.error('no LOGO map in index.html'); process.exit(2); }
const LOGO = JSON.parse(m[1]);
const url = LOGO[school];
if (!url) {
  console.error(school + ' is not in the app\'s crest map. It spells schools the way '
    + 'CLASSES does - check there before adding an alias.');
  process.exit(2);
}

/* =s96 whatever the map happens to carry: the url comes back from
   athletic.net unsized and patchLogos appends a size, so do not assume. */
const at96 = url.replace(/=s\d+$/, '') + '=s96';

/* curl for the same reason the crawl uses it, and because Node's fetch has no
   business being the thing that breaks a build step. */
const buf = execFileSync('curl', ['-sL', '--max-time', '30', at96],
  { maxBuffer: 8 << 20, encoding: 'buffer' });

/* A CDN that has decided to say no returns a perfectly valid 60-byte HTML
   page, and a 60-byte crest is not a crest. Check the magic number and the
   size, because "it wrote a file" is not the same as "it worked". */
const png = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
const jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
if ((!png && !jpg) || buf.length < 900) {
  console.error('that did not come back as an image: ' + buf.length + ' bytes, starting '
    + buf.slice(0, 12).toString('hex'));
  process.exit(3);
}

const uri = 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + buf.toString('base64');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, uri);
console.log(school + ' crest: ' + buf.length + ' bytes of '
  + (png ? 'PNG' : 'JPEG') + ', ' + (uri.length / 1024).toFixed(1)
  + 'KB as a data URI -> ' + path.relative(path.join(__dirname, '..'), OUT));
