// node pull/probe.js
//
// Can this machine reach athletic.net, and with what?
//
// Cloudflare answers Node's own fetch with a challenge page even when it is
// given perfect browser headers, so the block is on the TLS/HTTP2 fingerprint
// rather than on the headers or the address. curl presents a different
// fingerprint and is let through - from a home connection, at least. Whether
// that still holds from a CI runner's datacenter address is the question that
// decides if the pull can run unattended, and the only way to answer it is to
// ask from inside CI.
const { execFileSync } = require('child_process');
const fs = require('fs');

const B = 'https://www.athletic.net/api/v1/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const out = { when: new Date().toISOString(), node: process.version, tests: {} };
const looksChallenged = s => /Just a moment|cf-browser-verification|Enable JavaScript/i.test(s);

function viaCurl(label, url, post) {
  const args = ['-sS', '-m', '30', '-w', '\n%{http_code}', '-H', 'User-Agent: ' + UA,
    '-H', 'Accept: application/json, text/plain, */*'];
  if (post) args.push('-X', 'POST', '-H', 'Content-Type: application/json',
    '-H', 'anettokens: ' + post.jwt, '-d', JSON.stringify(post.body));
  args.push(url);
  const t = Date.now();
  try {
    const raw = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const i = raw.lastIndexOf('\n');
    const body = raw.slice(0, i), status = +raw.slice(i + 1);
    out.tests[label] = { via: 'curl', status, ms: Date.now() - t, bytes: body.length,
      challenged: looksChallenged(body), head: body.slice(0, 80).replace(/\s+/g, ' ') };
    return body;
  } catch (e) {
    out.tests[label] = { via: 'curl', threw: String(e.message).slice(0, 120), ms: Date.now() - t };
    return '';
  }
}

async function viaFetch(label, url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const body = await r.text();
    out.tests[label] = { via: 'fetch', status: r.status, ms: Date.now() - t,
      bytes: body.length, challenged: looksChallenged(body),
      head: body.slice(0, 80).replace(/\s+/g, ' ') };
  } catch (e) {
    out.tests[label] = { via: 'fetch', threw: String(e.cause || e).slice(0, 120), ms: Date.now() - t };
  }
}

(async () => {
  const TREE = B + 'DivisionHome/GetTree?sport=xc&divisionId=87377&depth=4&includeTeams=true';

  await viaFetch('tree_nodefetch', TREE);           // expected: challenged
  const tree = viaCurl('tree_curl', TREE);          // the seed of the whole crawl
  try { out.oregonTeams = (JSON.parse(tree).alignedTeams || []).length; } catch (e) { /* status says it */ }

  const md = viaCurl('meetdata_curl', B + 'Meet/GetMeetData?meetId=275793&sport=xc');
  let jwt = '', div = 0;
  try {
    const j = JSON.parse(md);
    jwt = j.jwtMeet || '';
    div = (j.xcDivisions || []).find(d => /5,000 Meters Varsity/.test(d.DivName)).IDMeetDiv;
  } catch (e) { out.jwtErr = String(e).slice(0, 80); }

  if (jwt) {
    const res = viaCurl('results_curl', B + 'Meet/GetResultsData3',
      { jwt, body: { divId: div, meetId: 275793 } });
    try { out.tests.results_curl.rows = (JSON.parse(res).resultsXC || []).length; } catch (e) { /* ditto */ }
  }

  const good = t => t && t.status === 200 && !t.challenged;
  out.verdict = good(out.tests.tree_curl) && good(out.tests.results_curl)
    ? 'REACHABLE via curl' : 'BLOCKED';
  const txt = JSON.stringify(out, null, 2);
  console.log(txt);
  fs.writeFileSync(__dirname + '/.probe.json', txt);
})();
