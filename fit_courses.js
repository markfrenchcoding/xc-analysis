// Fits a difficulty factor for every course from athletes who raced more than
// one of them.
//
// A mark is roughly  fitness x course x luck.  In logs that is additive:
//
//     log(time_ij) = athlete_i + course_j + noise
//
// which is an ordinary least-squares problem — one parameter per athlete, one
// per course, thousands of observations tying them together. It is solved here
// by alternating means, which converges fine and is fifteen lines.
//
// Three things matter beyond the loop:
//
//   Only differences are identifiable. Slowing every course by 2% and speeding
//   every athlete up by 2% predicts exactly the same times, so the level is
//   arbitrary and is pinned by centring. That is also why the state meet needs
//   no factor of its own: a uniform multiplier cannot change finishing order.
//
//   A course seen by six athletes gets a noisy estimate. Each factor is pulled
//   toward 1.0 by n/(n+k) so thin meets cannot shout.
//
//   Courses are only comparable if shared athletes connect them. Anything
//   outside the main connected component is left at 1.0 and reported, rather
//   than given a fabricated number.
//
// A "course" is a meet AND a distance — a meet's 3k and 5k are different loops.
//
// Usage as a module:  const {fitCourses} = require('./fit_courses.js');
// Usage as a CLI:     node fit_courses.js <raw.csv> <meta.json> [cutoff]
'use strict';

function fitCourses(rows, opts) {
  const o = Object.assign({ shrink: 20, iters: 250, minPerCourse: 4 }, opts || {});
  // Distances are separate universes: an athlete's 3k and 5k marks never share a
  // board, so 3k courses can never connect to 5k ones. Fit each distance on its
  // own, or the smaller board gets discarded as a stray component.
  const dists = [...new Set(rows.map(r => r.dist))];
  if (dists.length > 1) {
    const factors = new Map(), detail = [], unplaced = [];
    let comparable = 0;
    for (const d of dists) {
      const part = fitOne(rows.filter(r => r.dist === d), o);
      for (const [k, v] of part.factors) factors.set(k, v);
      detail.push(...part.detail);
      unplaced.push(...part.unplaced);
      comparable += part.stats.comparableMarks;
    }
    detail.sort((a, b) => b.factor - a.factor);
    const all = new Set(rows.map(r => r.mid + '|' + r.dist));
    return {
      factors, detail, unplaced,
      stats: { courses: all.size, placed: factors.size, unplaced: unplaced.length,
               comparableMarks: comparable, totalMarks: rows.length,
               spread: detail.length ? detail[0].factor / detail[detail.length - 1].factor : 1 },
      factorFor(mid, dist) { return factors.get(mid + '|' + dist) || 1; },
    };
  }
  return fitOne(rows, o);
}

function fitOne(rows, o) {
  const key = r => r.mid + '|' + r.dist;
  const ath = r => r.aid + '|' + r.dist;

  // only athletes with two or more marks on a board can compare courses
  const count = new Map();
  for (const r of rows) count.set(ath(r), (count.get(ath(r)) || 0) + 1);
  const use = rows.filter(r => count.get(ath(r)) >= 2);

  // connectivity: union courses that share an athlete
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  for (const r of use) if (!parent.has(key(r))) parent.set(key(r), key(r));
  const seenBy = new Map();
  for (const r of use) {
    const a = ath(r);
    if (seenBy.has(a)) union(seenBy.get(a), key(r)); else seenBy.set(a, key(r));
  }
  const compSize = new Map();
  for (const r of use) { const c = find(key(r)); compSize.set(c, (compSize.get(c) || 0) + 1); }
  let main = null, biggest = -1;
  for (const [c, n] of compSize) if (n > biggest) { biggest = n; main = c; }

  const fit = use.filter(r => find(key(r)) === main);
  const n = new Map();
  for (const r of fit) n.set(key(r), (n.get(key(r)) || 0) + 1);

  // alternating least squares in log space
  const A = new Map(), C = new Map();
  for (const r of fit) { C.set(key(r), 0); r._y = Math.log(r.secs); }
  for (let it = 0; it < o.iters; it++) {
    const as = new Map(), an = new Map();
    for (const r of fit) {
      const k = ath(r);
      as.set(k, (as.get(k) || 0) + (r._y - C.get(key(r))));
      an.set(k, (an.get(k) || 0) + 1);
    }
    for (const [k, s] of as) A.set(k, s / an.get(k));
    const cs = new Map(), cn = new Map();
    for (const r of fit) {
      const k = key(r);
      cs.set(k, (cs.get(k) || 0) + (r._y - A.get(ath(r))));
      cn.set(k, (cn.get(k) || 0) + 1);
    }
    for (const [k, s] of cs) C.set(k, s / cn.get(k));
    // centre, weighted by how many marks each course carries
    let tot = 0, wsum = 0;
    for (const [k, v] of C) { tot += v * n.get(k); wsum += n.get(k); }
    const mu = tot / wsum;
    for (const [k, v] of C) C.set(k, v - mu);
  }

  const factors = new Map(), detail = [];
  for (const [k, logf] of C) {
    const cnt = n.get(k);
    const shrunk = logf * (cnt / (cnt + o.shrink));
    const f = cnt >= o.minPerCourse ? Math.exp(shrunk) : 1;
    factors.set(k, f);
    detail.push({ course: k, n: cnt, raw: Math.exp(logf), factor: f });
  }
  const allCourses = new Set(rows.map(key));
  const unplaced = [...allCourses].filter(k => !factors.has(k));
  detail.sort((a, b) => b.factor - a.factor);
  return {
    factors,
    detail,
    stats: {
      courses: allCourses.size, placed: factors.size, unplaced: unplaced.length,
      comparableMarks: fit.length, totalMarks: rows.length,
      spread: detail.length ? detail[0].factor / detail[detail.length - 1].factor : 1,
    },
    unplaced,
    factorFor(mid, dist) { return factors.get(mid + '|' + dist) || 1; },
  };
}

module.exports = { fitCourses };

if (require.main === module) {
  const fs = require('fs');
  const [, , rawPath, metaPath, cutoff] = process.argv;
  if (!rawPath) { console.error('usage: node fit_courses.js <raw.csv> <meta.json> [cutoff]'); process.exit(1); }
  const split = l => { const out = []; let c = '', q = false;
    for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(c); c = ''; } else c += ch; }
    out.push(c); return out; };
  const lines = fs.readFileSync(rawPath, 'utf8').trim().split(/\r?\n/);
  const head = split(lines[0]).map(h => h.toLowerCase());
  const at = nm => head.indexOf(nm);
  const iA = at('aid'), iD = at('dist'), iS = at('secs'), iM = at('meetid');
  const meta = metaPath ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  const meets = meta ? (meta.meets || meta) : {};
  let rows = lines.slice(1).map(split)
    .map(c => ({ aid: c[iA], dist: +c[iD], secs: +c[iS], mid: c[iM] }))
    .filter(r => r.secs > 0);
  if (cutoff) rows = rows.filter(r => (meets[r.mid] || {}).date <= cutoff);
  const res = fitCourses(rows);
  console.log(JSON.stringify(res.stats, null, 1));
  console.log('\nfactor    n   course');
  for (const d of res.detail) {
    const [mid, dist] = d.course.split('|');
    const nm = (meets[mid] || {}).name || mid;
    console.log('  ' + d.factor.toFixed(3) + String(d.n).padStart(6) + '   ' + dist + 'm  ' + nm);
  }
  if (res.unplaced.length) console.log('\nnot connected to the main component, left at 1.000:\n  ' + res.unplaced.join('\n  '));
}
