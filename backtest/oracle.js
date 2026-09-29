// Where does the team-level error live? Oracle runs on the backtest seasons.
//
// The same simulator, fed three different databases at each cutoff:
//
//   board     what the board actually had: every athlete's marks at the cutoff,
//             each team's fastest seven on those marks
//   lineup    the seven each team ACTUALLY raced at its league championship,
//             still on marks from the cutoff. Anyone in the lineup with no mark
//             yet is left out, because the model could not have known them.
//             The gap from board to lineup is what not knowing the roster cost.
//   fresh     the same real lineups on every mark up to the day before the
//             league championship - the best information that exists without
//             the race itself. The gap from lineup to fresh is fitness change
//             between the cutoff and the race; what fresh still gets wrong is
//             race day, plus the model's own imperfection.
//
// Each variant is scored at its own best sigma from one grid, so none is
// flattered relative to the others. The outcome is the usual one: did the team
// qualify for state. That is settled by the league championships, which run
// three to four days after the 2-week cutoff, so 1 week has nothing to score
// here - see athlete_level.js for it.
//
//   node backtest/oracle.js [seasonsPerPoint]
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const SEASONS = +(process.argv[2] || 4000);
const RAW = path.join(__dirname, 'raw');
const DIR = path.join(__dirname, 'data');
const GRID = [1.2, 1.6, 2.3, 3, 4, 5, 6];
const split = l => { const o = []; let c = '', q = false;
  for (const ch of l) { if (q) { if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; }
  o.push(c); return o; };
const fmt = s => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
const esc = v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const isVarsity = n => /varsity/i.test(n) && !/junior\s*varsity|\bjv\b/i.test(n);

const written = [];
for (const y of L.years()) {
  const cfg = L.CFG[y];
  const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'y' + y + '_meta.json'), 'utf8')).meets;
  const truth = L.truthFor(y);
  const dateOf = mid => (meta[mid] || {}).date || '';
  const rows = fs.readFileSync(path.join(RAW, 'y' + y + '_raw.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(split).map(c => ({ aid: c[0], name: c[1] + ' ' + c[2], grade: c[3], school: c[5], g: c[6],
                            dist: +c[7], s: +c[8], mid: c[9], div: c[11] }))
    .filter(r => r.dist === 5000 && r.s > 0 && dateOf(r.mid) >= y + '-08-15'
                 && !(cfg.exclude || []).includes(r.mid));
  const leagueDay = Object.values(cfg.districts).map(dateOf).sort()[0];
  const dayBefore = (() => { const t = new Date(leagueDay + 'T12:00:00'); t.setDate(t.getDate() - 1);
    return t.toISOString().slice(0, 10); })();

  // the lineups: who ran varsity for each member team at its league championship
  const lineup = { M: new Map(), F: new Map() };
  for (const g of ['M', 'F']) {
    const members = new Set(); for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => members.add(t));
    for (const mid of Object.values(cfg.districts))
      for (const r of rows) if (r.mid === mid && r.g === g && isVarsity(r.div) && members.has(r.school)) {
        if (!lineup[g].has(r.school)) lineup[g].set(r.school, new Set());
        lineup[g].get(r.school).add(r.aid);
      }
  }

  /* A seed exactly as build_season.js builds one - top three marks, fastest
     seven a team - from marks dated on or before `upto`, optionally restricted
     to each team's real lineup. League championships are never marks here: they
     are the outcome. */
  const champ = new Set(Object.values(cfg.districts).concat([cfg.state]));
  const seed = (upto, onlyLineup) => {
    const out = ['gender,athlete,mark,grade,team,dist'];
    for (const g of ['M', 'F']) {
      const members = new Set(); for (const l in truth.leagues[g]) truth.leagues[g][l].forEach(t => members.add(t));
      const ath = new Map();
      for (const r of rows) {
        if (r.g !== g || !members.has(r.school) || champ.has(r.mid) || dateOf(r.mid) > upto) continue;
        if (onlyLineup && !(lineup[g].get(r.school) || new Set()).has(r.aid)) continue;
        if (!ath.has(r.aid)) ath.set(r.aid, { name: r.name, grade: r.grade, school: r.school, marks: [] });
        ath.get(r.aid).marks.push(r.s);
      }
      const byTeam = new Map();
      for (const a of ath.values()) {
        a.marks = [...new Set(a.marks)].sort((p, q) => p - q).slice(0, 3);
        if (!byTeam.has(a.school)) byTeam.set(a.school, []);
        byTeam.get(a.school).push(a);
      }
      for (const list of byTeam.values())
        for (const a of list.sort((p, q) => p.marks[0] - q.marks[0]).slice(0, 7))
          for (const m of a.marks) out.push([g, a.name, fmt(m), a.grade, a.school, 5000].map(esc).join(','));
    }
    return out.join('\n') + '\n';
  };

  for (const cut of L.cutoffs(y)) {
    for (const [tag, text] of [['orboard', seed(cut, false)], ['orlineup', seed(cut, true)],
                               ['orfresh', seed(dayBefore, true)]]) {
      const f = path.join(DIR, y + '-seed-' + cut + '-' + tag + '.csv');
      fs.writeFileSync(f, text); written.push(f);
    }
  }
}

const nCuts = Math.min(...L.years().map(y => L.cutoffs(y).length));
const WEEKS = [8, 6, 4, 2];
console.log('oracle backtest - ' + L.years().join(', ') + '. Brier on qualifying for state, '
  + 'each variant at its own best sigma (lower is better).\n');
console.log('  weeks        board        lineup         fresh    roster share   fitness share');
for (let ci = 0; ci < nCuts; ci++) {
  const res = {};
  for (const tag of ['orboard', 'orlineup', 'orfresh']) {
    let top = null;
    for (const sigma of GRID) {
      const pts = [];
      for (const y of L.years()) for (const g of ['M', 'F'])
        pts.push(...L.odds(y, g, L.cutoffs(y)[ci] + '-' + tag, sigma, SEASONS).teams.map(t => [t.p, t.actual]));
      const b = L.brier(pts);
      if (!top || b < top.b) top = { b, sigma };
    }
    res[tag] = top;
  }
  const total = res.orboard.b, gap = total - res.orfresh.b;
  const share = x => gap > 0 ? (100 * x / total).toFixed(0) + '%' : '-';
  console.log(('  ' + WEEKS[ci]).padEnd(8)
    + ['orboard', 'orlineup', 'orfresh'].map(t => (res[t].b.toFixed(4) + ' @' + res[t].sigma).padStart(14)).join('')
    + share(res.orboard.b - res.orlineup.b).padStart(14) + share(res.orlineup.b - res.orfresh.b).padStart(16));
}
console.log('\n  shares are of the board\'s whole error; what is left over is race day and the model itself');
for (const f of written) fs.unlinkSync(f);
