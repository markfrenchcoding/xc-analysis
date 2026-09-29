// Athlete-level backtest: how well do the marks at a cutoff predict what each
// athlete actually ran at the championships?
//
// The team backtest scores a yes/no - did the team qualify - over 144 outcomes
// in four seasons, most of them never in doubt. It cannot see a 2% effect:
// MARK_W, course adjustment and race ratings all came back "better in about
// two thirds of bootstrap draws". Every one of those is really a claim about
// predicting an athlete's time, and there are thousands of those.
//
// For each season and each horizon (8, 6, 4, 2 and 1 week before state):
//   targets  every varsity finisher at a league championship still to come, and
//            every finisher at state. At 1 week the leagues are already run, so
//            only state is a target - and the league races become marks.
//   methods  several ways of turning an athlete's marks into one predicted time
//   score    log(actual) - log(predicted), centred per race by its median.
//            Only order within a race matters to the simulator, and centring
//            removes the course and the weather of the championship itself.
//
// Then the error floor: athletes who ran BOTH their league championship and
// state, nine days apart. The centred difference between those two races is
// race-day noise (twice over) plus nine days of fitness, which is as close to
// pure race-day noise as this data gets. Whatever a method leaves above that
// floor is drift - change between the cutoff and the race - plus method error.
//
//   node backtest/athlete_level.js [draws]
'use strict';
const fs = require('fs');
const path = require('path');
const { fitRaces } = require('./race_ratings.js');

const DRAWS = +(process.argv[2] || 1000);
const RAW = path.join(__dirname, 'raw');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'seasons.json'), 'utf8'));
const YEARS = Object.keys(CFG).filter(k => /^\d{4}$/.test(k)).sort();
const WEEKS = [8, 6, 4, 2, 1];
const MARK_W = [[1], [0.67, 0.33], [0.50, 0.30, 0.20]];
const LONE = 0.006;
const CLIP = 0.20;         // a residual past 20% is a fall, a DNF-shaped walk, or a mis-keyed time

const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10); };
const isVarsity = n => /varsity/i.test(n) && !/junior\s*varsity|\bjv\b/i.test(n);

/* The ways to turn marks into one number. Each takes the athlete's marks as
   [{secs, date, race}] and a context, and returns predicted seconds. */
const weighted = xs => {
  const s = xs.slice().sort((a, b) => a - b).slice(0, 3);
  const v = s.length === 1 ? [s[0] * (1 + LONE)] : s;
  const w = MARK_W[v.length - 1];
  return v.reduce((t, x, i) => t + w[i] * x, 0);
};
const METHODS = {
  best:      (m) => Math.min(...m.map(x => x.secs)),
  shipped:   (m) => weighted(m.map(x => x.secs)),                     // what the board runs on
  race0:     (m, c) => weighted(m.map(x => x.secs / c.fit0.factorFor(x.race, x.date, 'race'))),
  race1:     (m, c) => weighted(m.map(x => x.secs / c.fit1.factorFor(x.race, x.date, 'race'))),
  race1trend:(m, c) => weighted(m.map(x => x.secs / c.fit1.factorFor(x.race, x.date, 'trend', c.target))),
};
/* --taus=0,-0.5,-1 adds one race-rated method per weekly improvement rate, and
   a leave-one-season-out section that picks the rate on three seasons and
   scores it on the fourth. Choosing the rate by looking at every season and
   then quoting the result would measure the choice, not the method. */
const TAUS = ((process.argv.find(a => a.startsWith('--taus=')) || '').split('=')[1] || '')
  .split(',').filter(Boolean).map(Number);
for (const t of TAUS) METHODS['r' + t] = (m, c) => weighted(m.map(x => x.secs / c.fits[t].factorFor(x.race, x.date, 'race')));
const NAMES = Object.keys(METHODS);

const results = {};                // week -> method -> [{cluster, r}]
const coverage = {};               // week -> {finishers, marked, scorers, scorersMarked}
const floor = [];                  // centred league-to-state differences
const NOISE = {};                  // week -> [{cluster, team, r}] unclipped, race-rated

for (const y of YEARS) {
  const cfg = CFG[y];
  const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'y' + y + '_meta.json'), 'utf8')).meets;
  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', y + '-truth.json'), 'utf8'));
  const dateOf = mid => (meta[mid] || {}).date || '';
  const rows = fs.readFileSync(path.join(RAW, 'y' + y + '_raw.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(split).map(c => ({ aid: c[0], grade: c[3], school: c[5], g: c[6], dist: +c[7], s: +c[8],
                            mid: c[9], div: c[11] }))
    .filter(r => r.dist === 5000 && r.s > 0 && dateOf(r.mid) >= y + '-08-15');

  // the championship races, as {key, mid, g, date, finishers: [{aid, school, s}]}
  const members = { M: new Set(), F: new Set() };
  for (const g of ['M', 'F']) for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => members[g].add(t));
  const champs = [];
  for (const [lg, mid] of Object.entries(cfg.districts)) for (const g of ['M', 'F']) {
    const f = rows.filter(r => r.mid === mid && r.g === g && isVarsity(r.div) && members[g].has(r.school));
    if (f.length) champs.push({ key: y + '|' + lg + '|' + g, mid, g, date: dateOf(mid), level: 'league', finishers: f });
  }
  for (const g of ['M', 'F']) {
    let f = rows.filter(r => r.mid === cfg.state && r.g === g);
    if (f.some(r => /6A/.test(r.div))) f = f.filter(r => /6A/.test(r.div));
    if (f.length) champs.push({ key: y + '|state|' + g, mid: cfg.state, g, date: dateOf(cfg.state), level: 'state', finishers: f });
  }
  const champIds = new Set(champs.map(c => c.mid));

  // the floor: league champ and state for the same athlete, centred within each race
  const byRace = new Map();
  for (const c of champs) {
    const med = median(c.finishers.map(r => Math.log(r.s)));
    byRace.set(c.key, new Map(c.finishers.map(r => [r.aid, Math.log(r.s) - med])));
  }
  for (const g of ['M', 'F']) {
    const st = byRace.get(y + '|state|' + g); if (!st) continue;
    for (const c of champs.filter(c => c.level === 'league' && c.g === g))
      for (const [aid, v] of byRace.get(c.key)) if (st.has(aid)) {
        const d = st.get(aid) - v; if (Math.abs(d) < CLIP) floor.push(d);
      }
  }

  for (const wk of WEEKS) {
    const cut = addDays(truth.stateDate, -7 * wk);
    const marks = rows.filter(r => dateOf(r.mid) <= cut && !(cfg.exclude || []).includes(r.mid));
    // race ratings fitted from what was known at the cutoff, nothing later
    const fitRows = marks.map(r => ({ aid: r.aid, g: r.g, mid: r.mid, secs: r.s, date: dateOf(r.mid) }));
    const fit0 = fitRaces(fitRows, { tauPct: 0, seasonStart: y + '-08-15' });
    const fit1 = fitRaces(fitRows, { tauPct: -1, seasonStart: y + '-08-15' });
    const fits = {}; for (const t of TAUS) fits[t] = fitRaces(fitRows, { tauPct: t, seasonStart: y + '-08-15' });
    const byAth = new Map();
    for (const r of marks) {
      const k = r.aid + '|' + r.g;
      if (!byAth.has(k)) byAth.set(k, []);
      byAth.get(k).push({ secs: r.s, date: dateOf(r.mid), race: r.mid + '|' + r.g });
    }
    const R = results[wk] = results[wk] || Object.fromEntries(NAMES.map(n => [n, []]));
    const C = coverage[wk] = coverage[wk] || { finishers: 0, marked: 0, scorers: 0, scorersMarked: 0 };
    for (const c of champs) {
      if (c.date <= cut) continue;                         // already run: it is a mark, not a target
      // who scored: a team's first five across the line
      const seen = {}; const scorer = new Set();
      for (const r of c.finishers.slice().sort((a, b) => a.s - b.s)) {
        seen[r.school] = (seen[r.school] || 0) + 1; if (seen[r.school] <= 5) scorer.add(r.aid);
      }
      const ctx = { fit0, fit1, fits, target: c.date };
      const pred = {}; NAMES.forEach(n => pred[n] = []);
      for (const r of c.finishers) {
        C.finishers++; if (scorer.has(r.aid)) C.scorers++;
        const m = byAth.get(r.aid + '|' + c.g);
        if (!m) continue;
        C.marked++; if (scorer.has(r.aid)) C.scorersMarked++;
        for (const n of NAMES) pred[n].push({ aid: r.aid, team: r.school, r: Math.log(r.s) - Math.log(METHODS[n](m, ctx)) });
      }
      // centre each method within the race, then keep the clipped residuals -
      // clipped on the SHIPPED method, so every method is scored on the same athletes
      const cen = {};
      for (const n of NAMES) { const md = median(pred[n].map(x => x.r)); cen[n] = pred[n].map(x => x.r - md); }
      const keep = cen.shipped.map(v => Math.abs(v) < CLIP);
      for (const n of NAMES) cen[n].forEach((v, i) => { if (keep[i]) R[n].push({ cluster: c.key, r: v }); });
      // unclipped, with the team, for the noise measurements: the tail IS the question there
      (NOISE[wk] = NOISE[wk] || []).push(...cen.race1.map((v, i) => ({ cluster: c.key, team: pred.race1[i].team, r: v })));
    }
  }
}

/* Spread is measured robustly, as 1.4826 x the median absolute residual - the
   standard deviation a normal distribution with the same middle would have.
   A single race has heavy tails (a fall, a day jogged in), and a root mean
   square is ruled by them: measured that way the race-day floor came out ABOVE
   every method's error, which a floor cannot be. The same robust measure is
   used for the floor and for the methods, so the two can be compared. */
const rsd = xs => 1.4826 * median(xs.map(x => Math.abs(typeof x === 'number' ? x : x.r)));
const rmse = rsd;
const floorSd = rsd(floor) / Math.SQRT2;

console.log('athlete-level backtest - ' + YEARS.join(', ')
  + '. Centred error in predicted championship time, % (lower is better).\n');
console.log('  race-day floor: ' + (100 * floorSd).toFixed(2) + '% one standard deviation, from '
  + floor.length + ' athletes who ran league and state nine days apart\n');
console.log('  weeks  targets  ' + NAMES.map(n => n.padStart(11)).join('') + '     drift*');
for (const wk of WEEKS) {
  const R = results[wk];
  const base = rmse(R.shipped);
  const drift = Math.sqrt(Math.max(0, base * base - floorSd * floorSd));
  console.log(('  ' + wk).padEnd(7) + String(R.shipped.length).padStart(8) + '  '
    + NAMES.map(n => (100 * rmse(R[n])).toFixed(2).padStart(11)).join('')
    + (100 * drift).toFixed(2).padStart(10));
}
console.log('\n  (root mean square; * drift is what the shipped method leaves above the floor)');

console.log('\n  who was on the line, and whether the database had ever seen them');
console.log('  weeks   finishers with a mark   scorers with a mark');
for (const wk of WEEKS) {
  const C = coverage[wk];
  console.log(('  ' + wk).padEnd(8) + ((100 * C.marked / C.finishers).toFixed(0) + '% of ' + C.finishers).padStart(22)
    + ((100 * C.scorersMarked / C.scorers).toFixed(0) + '% of ' + C.scorers).padStart(22));
}

// paired cluster bootstrap on RMSE, each method against shipped, per horizon
console.log('\n  each method against shipped: change in spread, 95% interval, and share of draws it wins');
for (const wk of WEEKS) {
  const R = results[wk];
  const clusters = [...new Set(R.shipped.map(x => x.cluster))];
  const idx = {}; R.shipped.forEach((x, i) => (idx[x.cluster] = idx[x.cluster] || []).push(i));
  const line = [];
  for (const n of NAMES.filter(n => n !== 'shipped')) {
    const diffs = []; let wins = 0;
    for (let d = 0; d < DRAWS; d++) {
      const pick = [];
      for (let i = 0; i < clusters.length; i++) pick.push(...idx[clusters[Math.floor(Math.random() * clusters.length)]]);
      const diff = rsd(pick.map(j => R[n][j].r)) - rsd(pick.map(j => R.shipped[j].r));
      diffs.push(diff); if (diff < 0) wins++;
    }
    diffs.sort((p, q) => p - q);
    line.push(n + ' ' + (100 * median(diffs) >= 0 ? '+' : '') + (100 * median(diffs)).toFixed(2)
      + ' [' + (100 * diffs[Math.floor(DRAWS * .025)]).toFixed(2) + ',' + (100 * diffs[Math.floor(DRAWS * .975)]).toFixed(2)
      + '] ' + (100 * wins / DRAWS).toFixed(0) + '%');
  }
  console.log('  ' + wk + ' wk: ' + line.join('   '));
}

if (TAUS.length) {
  /* One rate for every horizon, because the site would run one. For each season
     held out: pick the rate with the lowest error on the other three, pooled over
     the horizons that matter (6, 4, 2 and 1 week), then score it on the one
     held out, against the shipped method on the same athletes. */
  const HZ = [6, 4, 2, 1];
  const yearOf = x => x.cluster.split('|')[0];
  const pool = (n, keep) => HZ.flatMap(wk => results[wk][n].filter(x => keep(yearOf(x))));
  console.log('\n  leave one season out: the rate chosen on the other three, scored on the held-out one');
  console.log('  held out   rate chosen   shipped   race-rated   change');
  let a = [], b = [];
  for (const y of YEARS) {
    const train = TAUS.map(t => ({ t, e: rsd(pool('r' + t, v => v !== y)) })).sort((p, q) => p.e - q.e)[0].t;
    const sh = pool('shipped', v => v === y), rr = pool('r' + train, v => v === y);
    a.push(...sh); b.push(...rr);
    console.log('  ' + y + '       ' + (train + '%/wk').padEnd(12) + (100 * rsd(sh)).toFixed(2).padStart(8)
      + (100 * rsd(rr)).toFixed(2).padStart(12) + ((100 * (rsd(rr) / rsd(sh) - 1)).toFixed(1) + '%').padStart(10));
  }
  console.log('  pooled                   ' + (100 * rsd(a)).toFixed(2).padStart(8) + (100 * rsd(b)).toFixed(2).padStart(12)
    + ((100 * (rsd(b) / rsd(a) - 1)).toFixed(1) + '%').padStart(10));
}

if (process.argv.includes('--noise')) {
  /* What the simulator assumes about a race, against what championships did.
     Residuals are the race-rated prediction two weeks out, centred per race:
     prediction error plus race day, which is what the simulator's noise has to
     cover at that horizon. */
  const xs = NOISE[2];
  const sd = rsd(xs);
  const tail = k => xs.filter(x => x.r > k * sd).length / xs.length;
  const fast = k => xs.filter(x => x.r < -k * sd).length / xs.length;
  // the simulator's own shape, drawn the way draw() draws it
  const SK_HI = 1.45, SK_LO = 0.75, SK_MEAN = 0.7978845608 * (SK_HI - SK_LO) / 2;
  const SK_SD = Math.sqrt((SK_HI * SK_HI + SK_LO * SK_LO) / 2 - SK_MEAN * SK_MEAN);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sim = [];
  for (let i = 0; i < 400000; i++) {
    const z = gauss();
    sim.push(Math.sqrt(0.3) * gauss() + Math.sqrt(0.7) * ((z > 0 ? z * SK_HI : z * SK_LO) - SK_MEAN) / SK_SD);
  }
  const ssd = rsd(sim);
  const stail = k => sim.filter(v => v > k * ssd).length / sim.length;
  const sfast = k => sim.filter(v => v < -k * ssd).length / sim.length;
  console.log('\n  race-day tail, two weeks out (' + xs.length + ' athletes): share beyond k robust SDs');
  console.log('     k    slow: data   simulator     fast: data   simulator');
  for (const k of [2, 3, 4, 6])
    console.log(('     ' + k).padEnd(10) + (100 * tail(k)).toFixed(2).padStart(9) + '%' + (100 * stail(k)).toFixed(2).padStart(11) + '%'
      + (100 * fast(k)).toFixed(2).padStart(14) + '%' + (100 * sfast(k)).toFixed(2).padStart(11) + '%');

  /* How much of a race is shared by a team: one-way ANOVA of clipped residuals
     by team within race - the intraclass correlation. TEAM_SHARE is 0.30. */
  const groups = new Map();
  for (const x of xs) if (Math.abs(x.r) < CLIP) {
    const k = x.cluster + '|' + x.team; (groups.get(k) || groups.set(k, []).get(k)).push(x.r);
  }
  const gs = [...groups.values()].filter(g => g.length >= 3);
  const N = gs.reduce((s, g) => s + g.length, 0), G = gs.length;
  const grand = gs.flat().reduce((s, v) => s + v, 0) / N;
  let ssb = 0, ssw = 0;
  for (const g of gs) { const m = g.reduce((s, v) => s + v, 0) / g.length;
    ssb += g.length * (m - grand) ** 2; for (const v of g) ssw += (v - m) ** 2; }
  const msb = ssb / (G - 1), msw = ssw / (N - G);
  const n0 = (N - gs.reduce((s, g) => s + g.length ** 2, 0) / N) / (G - 1);
  const vb = Math.max(0, (msb - msw) / n0);
  console.log('\n  shared by a team: ' + (100 * vb / (vb + msw)).toFixed(0) + '% of the variance ('
    + G + ' team-races, ' + N + ' athletes). The simulator assumes 30%.');
}

if (TAUS.length && process.argv.includes('--bygender')) {
  /* Boys and girls with their own improvement rate, against one shared rate.
     Same leave-one-season-out rule: the rate is chosen on the other three
     seasons of that gender and scored on the held-out one. */
  const HZ = [6, 4, 2, 1];
  const yearOf = x => x.cluster.split('|')[0], genOf = x => x.cluster.split('|')[2];
  const pool = (n, keep) => HZ.flatMap(wk => results[wk][n].filter(keep));
  const pick = keep => TAUS.map(t => ({ t, e: rsd(pool('r' + t, keep)) })).sort((p, q) => p.e - q.e)[0].t;
  console.log('\n  boys and girls: a rate each, against one shared rate (leave one season out)');
  for (const g of ['M', 'F']) {
    let sh = [], own = [], shared = [];
    for (const y of YEARS) {
      const tOwn = pick(x => yearOf(x) !== y && genOf(x) === g);
      const tAll = pick(x => yearOf(x) !== y);
      const held = x => yearOf(x) === y && genOf(x) === g;
      sh.push(...pool('shipped', held)); own.push(...pool('r' + tOwn, held)); shared.push(...pool('r' + tAll, held));
      console.log('    ' + (g === 'M' ? 'boys ' : 'girls') + ' ' + y + ': own rate ' + tOwn + '%/wk, shared ' + tAll + '%/wk');
    }
    console.log('    ' + (g === 'M' ? 'boys ' : 'girls') + ' pooled error: shipped ' + (100 * rsd(sh)).toFixed(2)
      + '   shared rate ' + (100 * rsd(shared)).toFixed(2) + '   own rate ' + (100 * rsd(own)).toFixed(2));
  }
}
